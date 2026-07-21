import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  analyzeImpact,
  findBlockUsage,
  loadIndex,
  saveIndex,
  createEmptyIndex,
  getBlockVariations,
  hashConfig,
  selectRegressionPages,
  launchBrowser,
  captureMultiViewport,
  compareVisuals,
  classifyPageStatus,
  buildRegressionReport,
  saveReports,
  generateMarkdownSummary,
  discoverFromQueryIndex,
  discoverFromSitemap,
} from '@blockguard/core';
import type { PageComparisonResult } from '@blockguard/core';

type ToolArgs = Record<string, unknown>;

/**
 * Dispatch a tool call by name to the appropriate handler function.
 */
export async function handleToolCall(name: string, args: ToolArgs): Promise<unknown> {
  switch (name) {
    case 'index_site_blocks':
      return handleIndexSiteBlocks(args);
    case 'find_block_usage':
      return handleFindBlockUsage(args);
    case 'analyze_code_change':
      return handleAnalyzeCodeChange(args);
    case 'select_regression_pages':
      return handleSelectRegressionPages(args);
    case 'run_block_regression':
      return handleRunBlockRegression(args);
    case 'get_regression_report':
      return handleGetRegressionReport(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── Tool Handlers ────────────────────────────────────────────────────────────

async function handleIndexSiteBlocks(args: ToolArgs): Promise<unknown> {
  const baseUrl = String(args['baseUrl'] ?? '');
  const pageSource = String(args['pageSource'] ?? 'query-index');
  const outputDir = String(args['outputDir'] ?? '/tmp/blockguard');

  if (!baseUrl) throw new Error('baseUrl is required');

  const discoveryConfig = {
    pageIndex: pageSource === 'query-index' ? '/query-index.json' : undefined,
    sitemap: pageSource === 'sitemap' ? '/sitemap.xml' : undefined,
    include: ['/**'],
    exclude: ['/drafts/**', '/tools/**'],
    maxDepth: 3,
  };

  let pages: { path: string; url: string }[] = [];

  if (pageSource === 'sitemap') {
    const result = await discoverFromSitemap(baseUrl, discoveryConfig);
    pages = result.pages;
  } else {
    const result = await discoverFromQueryIndex(baseUrl, discoveryConfig);
    pages = result.pages;
  }

  const index = createEmptyIndex(baseUrl, 'mcp-manual', hashConfig({ baseUrl, pageSource }));
  const savedPath = saveIndex(index, outputDir);

  return {
    pagesDiscovered: pages.length,
    indexPath: savedPath,
    message: `Discovered ${pages.length} pages from ${baseUrl}. Full block scanning requires Puppeteer — run this in the GitHub Action or via run_block_regression for visual testing.`,
    pages: pages.slice(0, 20).map((p) => p.path),
    hasMore: pages.length > 20,
  };
}

async function handleFindBlockUsage(args: ToolArgs): Promise<unknown> {
  const blockName = String(args['block'] ?? '');
  const variation = args['variation'] ? String(args['variation']) : undefined;
  const locale = args['locale'] ? String(args['locale']) : undefined;
  const indexPath = args['indexPath']
    ? String(args['indexPath'])
    : '/tmp/blockguard/block-usage-index.json';

  if (!blockName) throw new Error('block is required');

  if (!existsSync(indexPath)) {
    return {
      error: `No usage index found at ${indexPath}. Run index_site_blocks first.`,
      indexPath,
    };
  }

  const index = loadIndex(indexPath);
  const result = findBlockUsage(index, blockName, variation, locale);
  const allVariations = getBlockVariations(index, blockName);

  return {
    blockName,
    variation: variation ?? 'all',
    locale: locale ?? 'all',
    totalPages: result.pages.length,
    totalInstances: result.totalInstances,
    allVariations,
    pages: result.pages.map((p) => ({
      path: p.path,
      locale: p.locale,
      variations: p.blocks.find((b) => b.name === blockName)?.variations ?? [],
      instances: p.blocks.find((b) => b.name === blockName)?.instances ?? 0,
    })),
  };
}

async function handleAnalyzeCodeChange(args: ToolArgs): Promise<unknown> {
  const baseRef = String(args['baseRef'] ?? 'origin/main');
  const headRef = String(args['headRef'] ?? 'HEAD');
  const projectRoot = resolve(String(args['projectRoot'] ?? '.'));

  const impact = await analyzeImpact({ baseRef, headRef, projectRoot });

  return {
    baseRef,
    headRef,
    projectRoot,
    risk: impact.risk,
    directlyChangedBlocks: impact.directlyChangedBlocks.map((b) => ({
      name: b.name,
      files: b.changedFiles,
    })),
    transitivelyAffectedBlocks: impact.transitivelyChangedBlocks.map((b) => ({
      name: b.name,
      via: b.changedFiles,
    })),
    sharedFilesChanged: impact.sharedFilesChanged,
    allAffectedBlocks: impact.allAffectedBlocks,
    summary:
      impact.allAffectedBlocks.length === 0
        ? 'No block changes detected'
        : `${impact.allAffectedBlocks.length} block(s) affected: ${impact.allAffectedBlocks.join(', ')}. Risk: ${impact.risk}.`,
  };
}

async function handleSelectRegressionPages(args: ToolArgs): Promise<unknown> {
  const changedBlocks = (args['changedBlocks'] as string[]) ?? [];
  const mode = (String(args['mode'] ?? 'representative')) as 'representative' | 'full';
  const maxPages = Number(args['maxPages'] ?? 20);
  const indexPath = args['indexPath']
    ? String(args['indexPath'])
    : '/tmp/blockguard/block-usage-index.json';

  if (!changedBlocks.length) throw new Error('changedBlocks is required');

  if (!existsSync(indexPath)) {
    return {
      error: `No usage index found at ${indexPath}. Run index_site_blocks first.`,
    };
  }

  const index = loadIndex(indexPath);
  const selectionConfig = {
    mode,
    maximumPages: maxPages,
    includeEveryVariation: true,
    pagesPerVariation: 2,
    prioritize: ['traffic', 'multiple-instances'] as ('traffic' | 'multiple-instances')[],
  };

  const result = selectRegressionPages(index.pages, changedBlocks, selectionConfig);

  return {
    mode,
    totalAffectedPages: result.totalAffected,
    selectedPages: result.selected.length,
    skippedPages: result.skipped,
    pages: result.selected.map((s) => ({
      path: s.page.path,
      locale: s.page.locale,
      affectedBlocks: s.affectedBlockNames,
      reasons: s.reasons,
    })),
  };
}

async function handleRunBlockRegression(args: ToolArgs): Promise<unknown> {
  const blockName = String(args['block'] ?? '');
  const baseRef = String(args['baseRef'] ?? 'origin/main');
  const headRef = String(args['headRef'] ?? 'HEAD');
  const liveOrigin = String(args['liveOrigin'] ?? '');
  const previewOrigin = String(args['previewOrigin'] ?? '');
  const projectRoot = resolve(String(args['projectRoot'] ?? '.'));
  const mode = (String(args['mode'] ?? 'representative')) as 'representative' | 'full';
  const outputDir = String(args['outputDir'] ?? '/tmp/blockguard-mcp');
  const viewportNames = (args['viewports'] as string[]) ?? ['mobile', 'desktop'];

  if (!blockName) throw new Error('block is required');
  if (!liveOrigin) throw new Error('liveOrigin is required');
  if (!previewOrigin) throw new Error('previewOrigin is required');

  // Impact analysis
  const impact = await analyzeImpact({ baseRef, headRef, projectRoot });
  const blocksToTest = impact.allAffectedBlocks.length > 0
    ? impact.allAffectedBlocks
    : [blockName];

  // Build minimal index from query-index
  const discoveryConfig = {
    include: ['/**'],
    exclude: ['/drafts/**', '/tools/**'],
    maxDepth: 3,
    pageIndex: '/query-index.json',
  };

  let pages: { path: string; url: string }[] = [];
  try {
    const discovered = await discoverFromQueryIndex(liveOrigin, discoveryConfig);
    pages = discovered.pages;
  } catch {
    // Non-fatal — continue with empty page list
  }

  const viewportMap: Record<string, { name: string; width: number; height: number }> = {
    mobile: { name: 'mobile', width: 390, height: 844 },
    desktop: { name: 'desktop', width: 1440, height: 1000 },
  };
  const viewports = viewportNames.map((v) => viewportMap[v] ?? { name: v, width: 1440, height: 1000 });

  const indexedPages = pages.map((p) => ({
    path: p.path,
    url: `${liveOrigin}${p.path}`,
    site: liveOrigin,
    locale: 'en',
    lastScanned: new Date().toISOString(),
    blocks: blocksToTest.map((name) => ({
      name,
      variations: ['default'],
      instances: 1,
      signatures: [`${name}:default:1`],
    })),
  }));

  const selectionResult = selectRegressionPages(indexedPages, blocksToTest, {
    mode,
    maximumPages: 10,
    includeEveryVariation: true,
    pagesPerVariation: 2,
    prioritize: ['multiple-instances'],
  });

  const comparisons: PageComparisonResult[] = [];
  const runId = `bg-mcp-${Date.now()}`;
  const browser = await launchBrowser();
  const captureConfig = {
    disableAnimations: true,
    waitForFonts: true,
    waitForImages: true,
    maskSelectors: ['.timestamp'],
    hideSelectors: ['.cookie-banner'],
    waitForSelectors: ['main .block'],
    delayMs: 500,
    timezone: 'UTC',
    locale: 'en-US',
  };
  const thresholds = {
    visualWarning: 0.5,
    visualFailure: 3.0,
    newConsoleErrorsFailure: 1,
    failOnNewCriticalAccessibilityIssue: true,
    failOnMissingBlock: true,
    failOnHorizontalOverflow: true,
  };

  try {
    for (const { page, reasons, affectedBlockNames } of selectionResult.selected) {
      const baseUrl = `${liveOrigin}${page.path}`;
      const branchUrl = `${previewOrigin}${page.path}`;

      for (const viewport of viewports) {
        const compDir = join(outputDir, 'comparisons', page.path.replace(/\//g, '_'), viewport.name);

        try {
          const [baseShots, branchShots] = await Promise.all([
            captureMultiViewport(browser, baseUrl, 'before', [viewport], compDir, captureConfig),
            captureMultiViewport(browser, branchUrl, 'after', [viewport], compDir, captureConfig),
          ]);

          const baseShot = baseShots[0];
          const branchShot = branchShots[0];

          if (!baseShot?.success || !branchShot?.success) {
            comparisons.push({
              pagePath: page.path, baseUrl, branchUrl, viewport: viewport.name,
              status: 'unable-to-test', selectionReasons: reasons,
              affectedBlocks: affectedBlockNames,
              summary: `Screenshot failed: ${baseShot?.error || branchShot?.error}`,
            });
            continue;
          }

          const diffPath = join(compDir, `diff-${viewport.name}.png`);
          const visual = compareVisuals(baseShot.filePath, branchShot.filePath, diffPath);

          const { status, summary } = classifyPageStatus(
            { pagePath: page.path, baseUrl, branchUrl, viewport: viewport.name,
              selectionReasons: reasons, affectedBlocks: affectedBlockNames, visual,
              beforeScreenshot: baseShot.filePath, afterScreenshot: branchShot.filePath,
              diffScreenshot: diffPath },
            thresholds,
          );

          comparisons.push({
            pagePath: page.path, baseUrl, branchUrl, viewport: viewport.name,
            status, selectionReasons: reasons, affectedBlocks: affectedBlockNames,
            visual, summary,
            beforeScreenshot: baseShot.filePath,
            afterScreenshot: branchShot.filePath,
            diffScreenshot: diffPath,
          });
        } catch (err) {
          comparisons.push({
            pagePath: page.path, baseUrl, branchUrl, viewport: viewport.name,
            status: 'unable-to-test', selectionReasons: reasons,
            affectedBlocks: affectedBlockNames,
            summary: `Error: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
    }
  } finally {
    await browser.close();
  }

  const report = buildRegressionReport({
    runId, baseRef, headRef, impact, comparisons,
    totalAffectedPages: selectionResult.totalAffected,
    skippedPages: selectionResult.skipped,
    mode, viewports: viewportNames, outputDir,
  });

  saveReports(report, outputDir);

  return {
    runId,
    status: report.status,
    summary: report.summary,
    testedPages: report.testedPages,
    totalAffectedPages: report.totalAffectedPages,
    reportPath: outputDir,
    markdown: generateMarkdownSummary(report),
    failures: comparisons
      .filter((c) => c.status === 'failed')
      .map((c) => ({ page: c.pagePath, viewport: c.viewport, issue: c.summary })),
  };
}

async function handleGetRegressionReport(args: ToolArgs): Promise<unknown> {
  const format = String(args['format'] ?? 'summary');
  const reportPath = args['reportPath']
    ? String(args['reportPath'])
    : '/tmp/blockguard-mcp/report.json';

  const jsonPath = reportPath.endsWith('.json') ? reportPath : join(reportPath, 'report.json');

  if (!existsSync(jsonPath)) {
    return { error: `No report found at ${jsonPath}. Run run_block_regression first.` };
  }

  const report = JSON.parse(readFileSync(jsonPath, 'utf8'));

  if (format === 'markdown') {
    return { markdown: generateMarkdownSummary(report) };
  }

  if (format === 'summary') {
    return {
      runId: report.runId,
      status: report.status,
      summary: report.summary,
      testedPages: report.testedPages,
      totalAffectedPages: report.totalAffectedPages,
      changedBlocks: report.impact?.allAffectedBlocks ?? [],
      failures: (report.comparisons ?? [])
        .filter((c: PageComparisonResult) => c.status === 'failed')
        .map((c: PageComparisonResult) => ({ page: c.pagePath, viewport: c.viewport, issue: c.summary })),
    };
  }

  return report;
}
