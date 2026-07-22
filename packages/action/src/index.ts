import * as core from '@actions/core';
import * as github from '@actions/github';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  loadConfig,
  analyzeImpact,
  selectRegressionPages,
  launchBrowser,
  navigateAndStabilize,
  clipBlockFromPage,
  compareVisuals,
  classifyPageStatus,
  buildRegressionReport,
  saveReports,
  generateMarkdownSummary,
  resolveLiveOrigin,
  resolvePreviewOrigin,
  discoverFromQueryIndex,
  discoverFromSitemap,
  hashConfig,
  createEmptyIndex,
  waitForUrl,
  pageExists,
  scanPage,
} from '@blockguard/core';
import { upsertPrComment, upsertCheckRun } from './github-client.js';
import type { PageComparisonResult } from '@blockguard/core';

/** Run at most `limit` async tasks concurrently. */
async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(workers);
}

async function run(): Promise<void> {
  try {
    // ─── Read Inputs ───────────────────────────────────────────────────────────
    const owner = core.getInput('owner', { required: true });
    const repo = core.getInput('repo', { required: true });
    const baseBranch = core.getInput('base-branch') || 'main';
    const configPath = core.getInput('config') || 'blockguard.config.yml';
    const mode = (core.getInput('mode') || 'representative') as 'representative' | 'full';
    const maxPages = parseInt(core.getInput('max-pages') || '10', 10);
    const failOnRegression = core.getInput('fail-on-regression') === 'true';
    const advisoryMode = core.getInput('advisory-mode') !== 'false';
    const outputDir = core.getInput('output-dir') || '/tmp/blockguard-report';
    const githubToken = core.getInput('github-token', { required: true });

    const octokit = github.getOctokit(githubToken);
    const context = github.context;
    const prNumber = context.payload.pull_request?.number;
    const headSha = context.payload.pull_request?.head?.sha ?? context.sha;
    const headBranch =
      context.payload.pull_request?.head?.ref?.replace('refs/heads/', '') ?? 'HEAD';

    const prBaseSha = context.payload.pull_request?.base?.sha;
    const baseRef = core.getInput('base-ref') || prBaseSha || `origin/${baseBranch}`;
    const headRef = core.getInput('head-ref') || headSha;

    // ─── Load Config ───────────────────────────────────────────────────────────
    let config = existsSync(configPath)
      ? loadConfig(configPath)
      : ({
          version: 1 as const,
          site: { owner, repo, baseBranch },
          discovery: {
            pageIndex: core.getInput('page-index-url') ? '/query-index.json' : undefined,
            sitemap: core.getInput('site-map-url') ? '/sitemap.xml' : undefined,
            include: ['/**'],
            exclude: ['/drafts/**', '/tools/**'],
            maxDepth: 3,
          },
          blockDetection: {
            selector: '.block',
            nameStrategy: 'class' as const,
            ignoredClasses: ['block', 'initialized', 'loading'],
            variationStrategy: 'remaining-classes' as const,
          },
          selection: {
            mode,
            maximumPages: maxPages,
            includeEveryVariation: true,
            pagesPerVariation: 2,
            prioritize: ['traffic', 'multiple-instances'] as ('traffic' | 'multiple-instances')[],
          },
          capture: {
            disableAnimations: true,
            waitForFonts: false,
            waitForImages: false,
            maskSelectors: ['.timestamp', '.personalized-content'],
            hideSelectors: ['.cookie-banner'],
            waitForSelectors: ['main .block'],
            delayMs: 200,
            timezone: 'UTC',
            locale: 'en-US',
          },
          viewports: [
            { name: 'desktop', width: 1440, height: 900 },
          ],
          thresholds: {
            visualWarning: 0.5,
            visualFailure: 3.0,
            newConsoleErrorsFailure: 1,
            failOnNewCriticalAccessibilityIssue: true,
            failOnMissingBlock: true,
            failOnHorizontalOverflow: true,
          },
          outputDir,
        });

    const liveOrigin = core.getInput('live-origin') || resolveLiveOrigin(config);
    const previewOrigin = core.getInput('preview-origin') || resolvePreviewOrigin(config, headBranch);

    core.info(`\n🛡️  BlockGuard starting`);
    core.info(`   Base:    ${liveOrigin}`);
    core.info(`   Preview: ${previewOrigin}`);

    // ─── Step 1: Impact Analysis ───────────────────────────────────────────────
    core.startGroup('📊 Impact Analysis');
    const impact = await analyzeImpact({ baseRef, headRef, projectRoot: process.cwd() });

    core.info(`Risk: ${impact.risk}`);
    core.info(`Changed blocks: ${impact.allAffectedBlocks.join(', ') || 'none'}`);

    if (impact.allAffectedBlocks.length === 0) {
      core.info('No block changes detected — skipping regression tests.');
      core.setOutput('status', 'passed');
      core.setOutput('affected-pages', '0');
      core.setOutput('tested-pages', '0');
      core.endGroup();
      return;
    }
    core.endGroup();

    // ─── Step 2: Wait for preview (max 90s, poll every 5s) ────────────────────
    core.startGroup('⏳ Waiting for EDS preview');
    const previewReady = await waitForUrl(`${previewOrigin}/`, 90_000, 5_000);
    if (!previewReady) {
      core.warning(`Preview not available at ${previewOrigin} after 90s — skipping visual tests`);
    }
    core.endGroup();

    // ─── Step 3: Discover + verify published pages ────────────────────────────
    core.startGroup('🔍 Discovering pages');
    let pages: { path: string; url: string }[] = [];

    try {
      if (config.discovery.pageIndex) {
        const result = await discoverFromQueryIndex(liveOrigin, config.discovery);
        pages = result.pages;
      } else if (config.discovery.sitemap) {
        const result = await discoverFromSitemap(liveOrigin, config.discovery);
        pages = result.pages;
      }
    } catch (err) {
      core.warning(`Page discovery failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    core.info(`Discovered ${pages.length} pages — verifying each exists on live origin...`);
    const publishedPages: typeof pages = [];
    await Promise.all(
      pages.map(async (p) => {
        if (await pageExists(`${liveOrigin}${p.path}`)) {
          publishedPages.push(p);
        } else {
          core.debug(`Skipping unpublished page: ${p.path}`);
        }
      }),
    );
    pages = publishedPages;
    core.info(`${pages.length} published pages on live origin`);
    core.endGroup();

    // ─── Step 3b: Scan pages for block usage ──────────────────────────────────
    core.startGroup('🔎 Scanning pages for block usage');
    const configHash = hashConfig(config);
    let index = createEmptyIndex(`${owner}/${repo}`, headRef, configHash);

    const sharedBrowser = await launchBrowser();
    const indexedPages: Awaited<ReturnType<typeof scanPage>>[] = [];

    try {
      await withConcurrency(pages, 3, async (p) => {
        const liveUrl = `${liveOrigin}${p.path}`;
        const previewUrl = `${previewOrigin}${p.path}`;
        core.info(`  Scanning ${p.path}...`);
        try {
          const scannedLive = await scanPage(
            sharedBrowser, liveUrl, p.path, `${owner}/${repo}`, 'en', config.blockDetection,
          );

          let merged = scannedLive;
          if (previewReady) {
            try {
              const scannedPreview = await scanPage(
                sharedBrowser, previewUrl, p.path, `${owner}/${repo}`, 'en', config.blockDetection,
              );
              const mergedBlocks = [...scannedLive.blocks];
              for (const previewBlock of scannedPreview.blocks) {
                const existing = mergedBlocks.find((b) => b.name === previewBlock.name);
                if (!existing) {
                  mergedBlocks.push(previewBlock);
                  core.info(`    Branch-only block detected: ${previewBlock.name} on ${p.path}`);
                } else {
                  for (const v of previewBlock.variations) {
                    if (!existing.variations.includes(v)) existing.variations.push(v);
                  }
                }
              }
              merged = { ...scannedLive, blocks: mergedBlocks };
            } catch (previewErr) {
              core.debug(`  Preview scan failed for ${p.path}: ${previewErr instanceof Error ? previewErr.message : String(previewErr)}`);
            }
          }

          indexedPages.push(merged);
          core.info(`    Blocks: ${merged.blocks.map((b) => b.name).join(', ') || 'none'}`);
        } catch (err) {
          core.warning(`  Failed to scan ${p.path}: ${err instanceof Error ? err.message : String(err)}`);
        }
      });

      const affectedSet = new Set(impact.allAffectedBlocks.map((b) => b.toLowerCase()));
      const relevantPages = indexedPages.filter((p) =>
        p.blocks.some((b) => affectedSet.has(b.name.toLowerCase())),
      );

      core.info(
        `${relevantPages.length} / ${indexedPages.length} pages use changed block(s): ${impact.allAffectedBlocks.join(', ')}`,
      );
      index = { ...index, pages: relevantPages };
    } catch (err) {
      await sharedBrowser.close();
      throw err;
    }
    core.endGroup();

    // ─── Step 4: Select pages ─────────────────────────────────────────────────
    core.startGroup('📋 Selecting test pages');

    for (const [block, vars] of Object.entries(impact.allAffectedVariations)) {
      if (vars.length > 0) {
        core.info(`  Block '${block}' — only variation(s) changed: ${vars.join(', ')}`);
      } else {
        core.info(`  Block '${block}' — entire block changed (all variations)`);
      }
    }

    const selectionResult = selectRegressionPages(
      index.pages,
      impact.allAffectedBlocks,
      config.selection,
      impact.allAffectedVariations,
    );
    core.info(`Selected ${selectionResult.selected.length} / ${selectionResult.totalAffected} pages`);
    core.endGroup();

    // ─── Step 5: Capture & compare ────────────────────────────────────────────
    core.startGroup('📸 Capturing screenshots and comparing');
    const comparisons: PageComparisonResult[] = [];
    const runId = `bg-${Date.now()}`;

    try {
      const previewExistsMap = new Map<string, boolean>();
      if (previewReady) {
        await Promise.all(
          selectionResult.selected.map(async ({ page }) => {
            const branchUrl = `${previewOrigin}${page.path}`;
            previewExistsMap.set(page.path, await pageExists(branchUrl));
          }),
        );
      }

      await withConcurrency(selectionResult.selected, 3, async ({ page, reasons, affectedBlockNames, affectedVariations }) => {
        const baseUrl = `${liveOrigin}${page.path}`;
        const branchUrl = `${previewOrigin}${page.path}`;

        if (previewReady && !previewExistsMap.get(page.path)) {
          core.info(`  Skipping ${page.path} — not on preview branch`);
          return;
        }

        for (const viewport of config.viewports) {
          core.info(`  Testing ${page.path} @ ${viewport.name}`);
          const compDir = join(outputDir, 'comparisons', page.path.replace(/\//g, '_'), viewport.name);

          // ── Per-variation capture plan ────────────────────────────────────
          // Key = "blockName" for default variation, "blockName (variation)" for named ones.
          // When the whole block changed (changedVars=[]) AND the page has multiple
          // distinct variations, we create one capture per variation so each appears
          // as its own section in the report instead of a single merged entry.
          type BlockCapture = {
            key: string;        // report label / blockScreenshots key
            blockName: string;
            selector: string;   // CSS selector to clip
            captureDir: string; // output sub-directory
          };

          const blockCapturePlan: BlockCapture[] = [];

          for (const blockName of affectedBlockNames) {
            const changedVars = affectedVariations[blockName] ?? [];
            const pageBlock = page.blocks.find((b) => b.name === blockName);
            const pageVariations = pageBlock?.variations ?? [];

            if (changedVars.length > 0) {
              // Variation-scoped change — one entry per changed variation
              for (const v of changedVars) {
                const key = `${blockName} (${v})`;
                blockCapturePlan.push({
                  key,
                  blockName,
                  selector: `.${blockName}.${v}`,
                  captureDir: join(compDir, `${blockName}_${v}`),
                });
              }
            } else if (pageVariations.length > 0) {
              // Whole block changed — create one capture entry per distinct variation
              // present on this page so each variation gets its own report section.
              for (const v of pageVariations) {
                const key = `${blockName} (${v})`;
                blockCapturePlan.push({
                  key,
                  blockName,
                  selector: `.${blockName}.${v}`,
                  captureDir: join(compDir, `${blockName}_${v}`),
                });
              }
              // Only add a bare "blockName" entry when the page has more instances
              // than it has named variations — meaning at least one instance has no
              // variation class at all (a default/unstyled instance alongside the
              // named ones).  Without this guard, `.blockName` matches the variation
              // instances too and every block section is rendered twice.
              const instances = pageBlock?.instances ?? 0;
              if (instances > pageVariations.length) {
                blockCapturePlan.push({
                  key: blockName,
                  blockName,
                  selector: `.${blockName}`,
                  captureDir: join(compDir, blockName),
                });
              }
            } else {
              // No variations — single capture for the whole block
              blockCapturePlan.push({
                key: blockName,
                blockName,
                selector: `.${blockName}`,
                captureDir: join(compDir, blockName),
              });
            }
          }

          // ── Execute captures — PAGE REUSE ─────────────────────────────────
          // Load base and branch URLs ONCE per viewport (in parallel), then
          // clip each block from the already-loaded pages. This eliminates
          // N×page-loads (previously one per block) and replaces networkidle2
          // with a fast domcontentloaded + decoration-complete wait.
          const blockScreenshots: Record<string, { before?: string; after?: string; diff?: string }> = {};
          let worstVisual: import('@blockguard/core').VisualDiffResult | undefined;
          let anyCaptureFailed = false;
          let captureError: string | undefined;

          const basePage = await sharedBrowser.newPage();
          const branchPage = await sharedBrowser.newPage();

          try {
            // Navigate both sides in parallel — biggest single time saving
            const [baseNavErr, branchNavErr] = await Promise.allSettled([
              navigateAndStabilize(basePage, baseUrl, viewport, config.capture),
              navigateAndStabilize(branchPage, branchUrl, viewport, config.capture),
            ]);

            if (baseNavErr.status === 'rejected') {
              throw new Error(`Base navigation failed: ${baseNavErr.reason}`);
            }
            if (branchNavErr.status === 'rejected') {
              core.warning(`  Branch navigation failed for ${page.path} @ ${viewport.name}: ${branchNavErr.reason}`);
              // Non-fatal: still try to clip from whatever loaded
            }

            // Clip every block from the already-loaded pages (no re-navigation)
            for (const capture of blockCapturePlan) {
              core.info(`    Clip '${capture.key}' selector: ${capture.selector}`);

              let [baseShot, branchShot] = await Promise.all([
                clipBlockFromPage(basePage, capture.selector, 'before', viewport, capture.captureDir),
                clipBlockFromPage(branchPage, capture.selector, 'after', viewport, capture.captureDir),
              ]);

              if (!baseShot.blockFound) {
                core.info(`      '${capture.key}' not found on live — used full-page fallback`);
              }
              if (!branchShot.blockFound && branchShot.success) {
                core.warning(`      '${capture.key}' missing on preview branch (${page.path}) — possible regression`);
              }

              if (!baseShot.success || !branchShot.success) {
                anyCaptureFailed = true;
                captureError = baseShot.error || branchShot.error;
                continue;
              }

              // If one side clipped but the other fell back to full-page, re-clip
              // both as full-page so dimensions match for a fair pixel diff.
              if (baseShot.blockFound !== branchShot.blockFound) {
                core.info(`      '${capture.key}' block-found mismatch — re-clipping both as full-page`);
                const [baseFull, branchFull] = await Promise.all([
                  clipBlockFromPage(basePage, 'body', 'before-full', viewport, capture.captureDir),
                  clipBlockFromPage(branchPage, 'body', 'after-full', viewport, capture.captureDir),
                ]);
                if (baseFull.success && branchFull.success) {
                  baseShot = baseFull;
                  branchShot = branchFull;
                }
              }

              const diffPath = join(capture.captureDir, `diff-${viewport.name}.png`);
              const visual = compareVisuals(baseShot.filePath, branchShot.filePath, diffPath);

              blockScreenshots[capture.key] = {
                before: baseShot.filePath,
                after: branchShot.filePath,
                diff: diffPath,
              };

              if (!worstVisual || visual.mismatchPercent > (worstVisual.mismatchPercent ?? 0)) {
                worstVisual = visual;
              }
            }

            // Build the flat list of affected block keys for this comparison entry
            const capturedKeys = Object.keys(blockScreenshots);
            const reportAffectedBlocks = capturedKeys.length > 0 ? capturedKeys : affectedBlockNames;
            const firstKey = reportAffectedBlocks[0];

            if (anyCaptureFailed && !worstVisual) {
              comparisons.push({
                pagePath: page.path, baseUrl, branchUrl, viewport: viewport.name,
                status: 'unable-to-test', selectionReasons: reasons,
                affectedBlocks: reportAffectedBlocks,
                affectedVariations,
                summary: `Screenshot failed: ${captureError}`,
                error: captureError,
                blockScreenshots,
              });
              return;
            }

            const { status, summary } = classifyPageStatus(
              {
                pagePath: page.path, baseUrl, branchUrl, viewport: viewport.name,
                selectionReasons: reasons,
                affectedBlocks: reportAffectedBlocks,
                affectedVariations,
                visual: worstVisual,
                beforeScreenshot: blockScreenshots[firstKey]?.before,
                afterScreenshot: blockScreenshots[firstKey]?.after,
                diffScreenshot: blockScreenshots[firstKey]?.diff,
              },
              config.thresholds,
            );

            comparisons.push({
              pagePath: page.path, baseUrl, branchUrl, viewport: viewport.name,
              status, selectionReasons: reasons,
              affectedBlocks: reportAffectedBlocks,
              affectedVariations,
              visual: worstVisual, summary,
              beforeScreenshot: blockScreenshots[firstKey]?.before,
              afterScreenshot: blockScreenshots[firstKey]?.after,
              diffScreenshot: blockScreenshots[firstKey]?.diff,
              blockScreenshots,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            core.warning(`Failed to compare ${page.path} @ ${viewport.name}: ${msg}`);
            comparisons.push({
              pagePath: page.path, baseUrl, branchUrl, viewport: viewport.name,
              status: 'unable-to-test', selectionReasons: reasons, affectedBlocks: affectedBlockNames,
              summary: `Comparison error: ${msg}`, error: msg,
            });
          } finally {
            // Always close the reused pages to free browser resources
            await Promise.allSettled([basePage.close(), branchPage.close()]);
          }
        }
      });
    } finally {
      await sharedBrowser.close();
    }
    core.endGroup();

    // ─── Step 6: Build and save report ────────────────────────────────────────
    core.startGroup('📝 Generating report');
    const report = buildRegressionReport({
      runId, baseRef, headRef, impact, comparisons,
      totalAffectedPages: selectionResult.totalAffected,
      skippedPages: selectionResult.skipped,
      mode,
      viewports: config.viewports.map((v) => v.name),
      outputDir,
    });

    saveReports(report, outputDir);
    const markdown = generateMarkdownSummary(report);
    core.info(`Report status: ${report.status}`);
    core.endGroup();

    // ─── Step 7: Post to GitHub ───────────────────────────────────────────────
    core.startGroup('🐙 Posting to GitHub');
    await core.summary.addRaw(markdown).write();

    if (prNumber) {
      try {
        await upsertPrComment(octokit, owner, repo, prNumber, markdown);
        core.info(`Updated PR #${prNumber} comment`);
      } catch (err) {
        core.warning(`Failed to post PR comment: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    try {
      await upsertCheckRun(
        octokit, owner, repo, headSha,
        report.status,
        report.summary.failed > 0
          ? `${report.summary.failed} regression(s) detected across ${report.testedPages} pages`
          : `${report.testedPages} pages tested — ${report.status}`,
        report.htmlReportPath,
      );
    } catch (err) {
      core.warning(`Failed to create check run: ${err instanceof Error ? err.message : String(err)}`);
    }
    core.endGroup();

    // ─── Step 8: Set outputs and exit ─────────────────────────────────────────
    core.setOutput('status', report.status);
    core.setOutput('affected-pages', String(selectionResult.totalAffected));
    core.setOutput('tested-pages', String(report.testedPages));
    core.setOutput('report-path', outputDir);
    core.setOutput('run-id', runId);

    if (!advisoryMode && failOnRegression && report.status === 'failed') {
      core.setFailed(`BlockGuard detected ${report.summary.failed} regression(s)`);
    } else if (report.status === 'failed') {
      core.warning(`BlockGuard detected ${report.summary.failed} regression(s) (advisory mode — not failing workflow)`);
    }
  } catch (err) {
    core.setFailed(`BlockGuard action failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

run();
