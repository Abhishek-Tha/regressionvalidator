import * as core from '@actions/core';
import * as github from '@actions/github';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  loadConfig,
  analyzeImpact,
  selectRegressionPages,
  launchBrowser,
  captureMultiViewport,
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

async function run(): Promise<void> {
  try {
    // ─── Read Inputs ───────────────────────────────────────────────────────────
    const owner = core.getInput('owner', { required: true });
    const repo = core.getInput('repo', { required: true });
    const baseBranch = core.getInput('base-branch') || 'main';
    const configPath = core.getInput('config') || 'blockguard.config.yml';
    const mode = (core.getInput('mode') || 'representative') as 'representative' | 'full';
    const maxPages = parseInt(core.getInput('max-pages') || '15', 10);
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

    // In GitHub Actions shallow clones, local branch refs like "main" are not present.
    // Use the PR base SHA directly when available, otherwise fall back to origin/<branch>.
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
            waitForFonts: true,
            waitForImages: true,
            maskSelectors: ['.timestamp', '.personalized-content'],
            hideSelectors: ['.cookie-banner'],
            waitForSelectors: ['main .block'],
            delayMs: 500,
            timezone: 'UTC',
            locale: 'en-US',
          },
          viewports: [
            { name: 'mobile', width: 390, height: 844 },
            { name: 'desktop', width: 1440, height: 1000 },
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

    const liveOrigin =
      core.getInput('live-origin') || resolveLiveOrigin(config);
    const previewOrigin =
      core.getInput('preview-origin') || resolvePreviewOrigin(config, headBranch);

    core.info(`\n🛡️  BlockGuard starting`);
    core.info(`   Base:    ${liveOrigin}`);
    core.info(`   Preview: ${previewOrigin}`);

    // ─── Step 1: Impact Analysis ───────────────────────────────────────────────
    core.startGroup('📊 Impact Analysis');
    const impact = await analyzeImpact({
      baseRef,
      headRef,
      projectRoot: process.cwd(),
    });

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

    // ─── Step 2: Wait for preview ─────────────────────────────────────────────
    core.startGroup('⏳ Waiting for EDS preview');
    const previewReady = await waitForUrl(`${previewOrigin}/`, 120_000);
    if (!previewReady) {
      core.warning(`Preview not available at ${previewOrigin} after 2 minutes — skipping visual tests`);
    }
    core.endGroup();

    // ─── Step 3: Discover pages ───────────────────────────────────────────────
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

    // Filter to only pages that are actually published on the live (.aem.live) origin.
    // Pages discovered from query-index but not yet live will return 404 and must be skipped.
    core.info(`Discovered ${pages.length} pages — verifying each exists on live origin...`);
    const publishedPages: typeof pages = [];
    await Promise.all(
      pages.map(async (p) => {
        const liveUrl = `${liveOrigin}${p.path}`;
        if (await pageExists(liveUrl)) {
          publishedPages.push(p);
        } else {
          core.debug(`Skipping unpublished page (404 on live): ${liveUrl}`);
        }
      }),
    );
    pages = publishedPages;

    core.info(`${pages.length} published pages found on live origin`);
    core.endGroup();

    // ─── Step 3b: Scan published pages to detect real block usage ─────────────
    core.startGroup('🔎 Scanning pages for block usage');
    const configHash = hashConfig(config);
    let index = createEmptyIndex(`${owner}/${repo}`, headRef, configHash);

    const scanBrowser = await launchBrowser();
    const indexedPages: Awaited<ReturnType<typeof scanPage>>[] = [];

    try {
      for (const p of pages) {
        const liveUrl = `${liveOrigin}${p.path}`;
        core.info(`  Scanning ${p.path} for blocks...`);
        try {
          const scanned = await scanPage(
            scanBrowser,
            liveUrl,
            p.path,
            `${owner}/${repo}`,
            'en',
            config.blockDetection,
          );
          indexedPages.push(scanned);
          const names = scanned.blocks.map((b) => b.name).join(', ') || 'none';
          core.info(`    Found blocks: ${names}`);
        } catch (err) {
          core.warning(`  Failed to scan ${p.path}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      await scanBrowser.close();
    }

    // Keep only pages that actually use at least one of the changed blocks
    const affectedSet = new Set(impact.allAffectedBlocks.map((b) => b.toLowerCase()));
    const relevantPages = indexedPages.filter((p) =>
      p.blocks.some((b) => affectedSet.has(b.name.toLowerCase())),
    );

    core.info(
      `${relevantPages.length} / ${indexedPages.length} pages use a changed block (${impact.allAffectedBlocks.join(', ')})`,
    );

    index = { ...index, pages: relevantPages };
    core.endGroup();

    // ─── Step 4: Select pages ─────────────────────────────────────────────────
    core.startGroup('📋 Selecting test pages');
    const selectionResult = selectRegressionPages(
      index.pages,
      impact.allAffectedBlocks,
      config.selection,
    );

    core.info(
      `Selected ${selectionResult.selected.length} / ${selectionResult.totalAffected} pages for testing`,
    );
    core.endGroup();

    // ─── Step 5: Capture & compare ─────────────────────────────────────────────
    core.startGroup('📸 Capturing screenshots and comparing');
    const comparisons: PageComparisonResult[] = [];
    const runId = `bg-${Date.now()}`;
    const browser = await launchBrowser();

    try {
      for (const { page, reasons, affectedBlockNames } of selectionResult.selected) {
        const baseUrl = `${liveOrigin}${page.path}`;
        const branchUrl = `${previewOrigin}${page.path}`;

        for (const viewport of config.viewports) {
          core.info(`  Testing ${page.path} @ ${viewport.name}`);

          const compDir = join(outputDir, 'comparisons', page.path.replace(/\//g, '_'), viewport.name);

          try {
            // Skip pages that are not published on the preview branch (404).
            // These are pages that exist on live but haven't been pushed to this branch.
            if (previewReady && !(await pageExists(branchUrl))) {
              core.info(`  Skipping ${page.path} @ ${viewport.name} — not published on preview branch`);
              continue;
            }

            // Capture screenshots
            const [baseScreenshots, branchScreenshots] = await Promise.all([
              captureMultiViewport(browser, baseUrl, 'before', [viewport], compDir, config.capture),
              captureMultiViewport(browser, branchUrl, 'after', [viewport], compDir, config.capture),
            ]);

            const baseShot = baseScreenshots[0];
            const branchShot = branchScreenshots[0];

            if (!baseShot?.success || !branchShot?.success) {
              comparisons.push({
                pagePath: page.path,
                baseUrl,
                branchUrl,
                viewport: viewport.name,
                status: 'unable-to-test',
                selectionReasons: reasons,
                affectedBlocks: affectedBlockNames,
                summary: `Screenshot failed: ${baseShot?.error || branchShot?.error}`,
                error: baseShot?.error || branchShot?.error,
              });
              continue;
            }

            // Visual diff
            const diffPath = join(compDir, `diff-${viewport.name}.png`);
            const visual = compareVisuals(
              baseShot.filePath,
              branchShot.filePath,
              diffPath,
            );

            // Classify and push result
            const { status, summary } = classifyPageStatus(
              {
                pagePath: page.path,
                baseUrl,
                branchUrl,
                viewport: viewport.name,
                selectionReasons: reasons,
                affectedBlocks: affectedBlockNames,
                visual,
                beforeScreenshot: baseShot.filePath,
                afterScreenshot: branchShot.filePath,
                diffScreenshot: diffPath,
              },
              config.thresholds,
            );

            comparisons.push({
              pagePath: page.path,
              baseUrl,
              branchUrl,
              viewport: viewport.name,
              status,
              selectionReasons: reasons,
              affectedBlocks: affectedBlockNames,
              visual,
              summary,
              beforeScreenshot: baseShot.filePath,
              afterScreenshot: branchShot.filePath,
              diffScreenshot: diffPath,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            core.warning(`Failed to compare ${page.path} @ ${viewport.name}: ${msg}`);
            comparisons.push({
              pagePath: page.path,
              baseUrl,
              branchUrl,
              viewport: viewport.name,
              status: 'unable-to-test',
              selectionReasons: reasons,
              affectedBlocks: affectedBlockNames,
              summary: `Comparison error: ${msg}`,
              error: msg,
            });
          }
        }
      }
    } finally {
      await browser.close();
    }
    core.endGroup();

    // ─── Step 6: Build and save report ────────────────────────────────────────
    core.startGroup('📝 Generating report');
    const report = buildRegressionReport({
      runId,
      baseRef,
      headRef,
      impact,
      comparisons,
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

    // Job summary
    await core.summary.addRaw(markdown).write();

    // PR comment
    if (prNumber) {
      try {
        await upsertPrComment(octokit, owner, repo, prNumber, markdown);
        core.info(`Updated PR #${prNumber} comment`);
      } catch (err) {
        core.warning(`Failed to post PR comment: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Check run
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

    // Fail the workflow only if explicitly requested and not in advisory mode
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
