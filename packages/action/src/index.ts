import * as core from '@actions/core';
import * as github from '@actions/github';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  loadConfig,
  analyzeImpact,
  selectRegressionPages,
  launchBrowser,
  captureBlockClip,
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
            waitForFonts: false,        // ← skip font wait for speed
            waitForImages: false,       // ← skip image wait for speed
            maskSelectors: ['.timestamp', '.personalized-content'],
            hideSelectors: ['.cookie-banner'],
            waitForSelectors: ['main .block'],
            delayMs: 200,              // ← reduced from 500ms
            timezone: 'UTC',
            locale: 'en-US',
          },
          // ← desktop only by default; add mobile in blockguard.config.yml if needed
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

    // Parallel HEAD-check — only keep pages published on live origin
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

    // ─── Step 3b: Scan pages for block usage (parallel, concurrency=3) ────────
    // Single shared browser used for scan AND capture — avoids two browser launches
    core.startGroup('🔎 Scanning pages for block usage');
    const configHash = hashConfig(config);
    let index = createEmptyIndex(`${owner}/${repo}`, headRef, configHash);

    // Launch ONE browser, reused across scan + capture phases
    const sharedBrowser = await launchBrowser();
    const indexedPages: Awaited<ReturnType<typeof scanPage>>[] = [];

    try {
      await withConcurrency(pages, 3, async (p) => {
        const liveUrl = `${liveOrigin}${p.path}`;
        core.info(`  Scanning ${p.path}...`);
        try {
          const scanned = await scanPage(
            sharedBrowser,
            liveUrl,
            p.path,
            `${owner}/${repo}`,
            'en',
            config.blockDetection,
          );
          indexedPages.push(scanned);
          core.info(`    Blocks: ${scanned.blocks.map((b) => b.name).join(', ') || 'none'}`);
        } catch (err) {
          core.warning(`  Failed to scan ${p.path}: ${err instanceof Error ? err.message : String(err)}`);
        }
      });

      // Filter to pages that use a changed block
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

    // Log detected variations to aid debugging
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

    // ─── Step 5: Capture & compare (parallel pages, concurrency=3) ────────────
    core.startGroup('📸 Capturing screenshots and comparing');
    const comparisons: PageComparisonResult[] = [];
    const runId = `bg-${Date.now()}`;

    try {
      // Check preview existence for each unique page path upfront (parallel)
      const previewExistsMap = new Map<string, boolean>();
      if (previewReady) {
        await Promise.all(
          selectionResult.selected.map(async ({ page }) => {
            const branchUrl = `${previewOrigin}${page.path}`;
            previewExistsMap.set(page.path, await pageExists(branchUrl));
          }),
        );
      }

      // Process pages concurrently (3 at a time) with viewports sequential per page
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

          // Per-block cropped screenshots: blockName → { before, after, diff }
          const blockScreenshots: Record<string, { before?: string; after?: string; diff?: string }> = {};

          // Track worst visual diff across all blocks for the overall page status
          let worstVisual: import('@blockguard/core').VisualDiffResult | undefined;
          let anyCaptureFailed = false;
          let captureError: string | undefined;

          try {
            for (const blockName of affectedBlockNames) {
              const changedVars = affectedVariations[blockName] ?? [];
              // Build selector for this specific block
              const blockSelector = changedVars.length > 0
                ? changedVars.map((v) => `.${blockName}.${v}`).join(', ')
                : `.${blockName}`;

              const blockCompDir = join(compDir, blockName);
              core.info(`    Clip block '${blockName}' selector: ${blockSelector}`);

              const [baseShot, branchShot] = await Promise.all([
                captureBlockClip({
                  browser: sharedBrowser, url: baseUrl, label: 'before',
                  viewport, outputDir: blockCompDir, captureConfig: config.capture,
                  blockSelector,
                }),
                captureBlockClip({
                  browser: sharedBrowser, url: branchUrl, label: 'after',
                  viewport, outputDir: blockCompDir, captureConfig: config.capture,
                  blockSelector,
                }),
              ]);

              if (!baseShot.blockFound) {
                core.info(`      '${blockName}' not found on live — used full-page fallback`);
              }
              if (!branchShot.blockFound && branchShot.success) {
                core.warning(`      '${blockName}' missing on preview branch (${page.path}) — possible regression`);
              }

              if (!baseShot.success || !branchShot.success) {
                anyCaptureFailed = true;
                captureError = baseShot.error || branchShot.error;
                continue;
              }

              const diffPath = join(blockCompDir, `diff-${viewport.name}.png`);
              const visual = compareVisuals(baseShot.filePath, branchShot.filePath, diffPath);

              blockScreenshots[blockName] = {
                before: baseShot.filePath,
                after: branchShot.filePath,
                diff: diffPath,
              };

              // Keep track of the worst diff to drive the overall page status
              if (!worstVisual || visual.mismatchPercent > (worstVisual.mismatchPercent ?? 0)) {
                worstVisual = visual;
              }
            }

            if (anyCaptureFailed && !worstVisual) {
              comparisons.push({
                pagePath: page.path, baseUrl, branchUrl, viewport: viewport.name,
                status: 'unable-to-test', selectionReasons: reasons, affectedBlocks: affectedBlockNames,
                summary: `Screenshot failed: ${captureError}`,
                error: captureError,
                blockScreenshots,
              });
              return;
            }

            // Use worst-block visual diff for overall page classification
            const { status, summary } = classifyPageStatus(
              {
                pagePath: page.path, baseUrl, branchUrl, viewport: viewport.name,
                selectionReasons: reasons, affectedBlocks: affectedBlockNames,
                visual: worstVisual,
                beforeScreenshot: blockScreenshots[affectedBlockNames[0]]?.before,
                afterScreenshot: blockScreenshots[affectedBlockNames[0]]?.after,
                diffScreenshot: blockScreenshots[affectedBlockNames[0]]?.diff,
              },
              config.thresholds,
            );

            comparisons.push({
              pagePath: page.path, baseUrl, branchUrl, viewport: viewport.name,
              status, selectionReasons: reasons, affectedBlocks: affectedBlockNames,
              visual: worstVisual, summary,
              beforeScreenshot: blockScreenshots[affectedBlockNames[0]]?.before,
              afterScreenshot: blockScreenshots[affectedBlockNames[0]]?.after,
              diffScreenshot: blockScreenshots[affectedBlockNames[0]]?.diff,
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
