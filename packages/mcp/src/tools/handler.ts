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
    case 'get_pr_regression_report':
      return handleGetPrRegressionReport(args);
    case 'trigger_pr_regression':
      return handleTriggerPrRegression(args);
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

// ─── GitHub-aware handlers ────────────────────────────────────────────────────

/**
 * Resolve GitHub credentials + owner/repo from args or environment.
 */
function resolveGitHubContext(args: ToolArgs): {
  token: string;
  owner: string;
  repo: string;
} {
  const token =
    (String(args['githubToken'] ?? '') || process.env['GITHUB_TOKEN']) ?? '';
  const owner =
    (String(args['owner'] ?? '') || process.env['BLOCKGUARD_OWNER']) ?? '';
  const repo =
    (String(args['repo'] ?? '') || process.env['BLOCKGUARD_REPO']) ?? '';

  if (!token) throw new Error('GitHub token is required. Pass githubToken or set GITHUB_TOKEN env var.');
  if (!owner) throw new Error('GitHub owner is required. Pass owner or set BLOCKGUARD_OWNER env var.');
  if (!repo) throw new Error('GitHub repo is required. Pass repo or set BLOCKGUARD_REPO env var.');

  return { token, owner, repo };
}

/**
 * Minimal GitHub REST helper — avoids pulling in @octokit/* as a runtime dep.
 */
async function ghFetch(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
  return res;
}

/**
 * Download a GitHub Actions artifact zip into memory and extract report.json.
 * Returns the parsed JSON object or null if report.json is not in the zip.
 */
async function downloadArtifactReport(
  downloadUrl: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  // GitHub redirects artifact downloads — follow with auth header
  const res = await ghFetch(downloadUrl, token, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Artifact download failed: ${res.status} ${res.statusText}`);

  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);

  // Use Node's built-in zlib + streams to unzip without extra deps
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Dynamically load adm-zip if available, otherwise try yauzl, else parse manually
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AdmZip = require('adm-zip') as any;
    const zip = new AdmZip(buffer);
    const entry = zip
      .getEntries()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .find((e: any) => (e.entryName as string).endsWith('report.json'));
    if (!entry) return null;
    return JSON.parse(zip.readAsText(entry)) as Record<string, unknown>;
  } catch {
    // adm-zip not available — fall back: treat as raw JSON (some artifact setups)
    try {
      const text = buffer.toString('utf8');
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

async function handleGetPrRegressionReport(args: ToolArgs): Promise<unknown> {
  const prNumber = Number(args['pr']);
  const format = String(args['format'] ?? 'markdown');

  if (!prNumber || isNaN(prNumber)) throw new Error('pr (Pull Request number) is required');

  const { token, owner, repo } = resolveGitHubContext(args);

  // ── 1. Get PR head SHA ────────────────────────────────────────────────────
  const prRes = await ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`, token);
  if (!prRes.ok) {
    throw new Error(`Could not fetch PR #${prNumber}: ${prRes.status} ${prRes.statusText}`);
  }
  const pr = (await prRes.json()) as Record<string, unknown>;
  const headSha = (pr['head'] as Record<string, unknown>)?.['sha'] as string;
  if (!headSha) throw new Error(`Could not determine head SHA for PR #${prNumber}`);

  // ── 2. Find the BlockGuard check run on this commit ───────────────────────
  const checksRes = await ghFetch(
    `/repos/${owner}/${repo}/commits/${headSha}/check-runs?per_page=100`,
    token,
  );
  if (!checksRes.ok) throw new Error(`Could not fetch check runs: ${checksRes.status}`);

  const checksData = (await checksRes.json()) as Record<string, unknown>;
  const checkRuns = (checksData['check_runs'] as Record<string, unknown>[]) ?? [];

  const blockguardCheck = checkRuns.find(
    (c) =>
      String(c['name'] ?? '')
        .toLowerCase()
        .includes('blockguard'),
  );

  if (!blockguardCheck) {
    return {
      pr: prNumber,
      headSha,
      status: 'not-found',
      message: `No BlockGuard check run found on PR #${prNumber} (commit ${headSha.slice(0, 7)}). ` +
        `The BlockGuard workflow may not have run yet. Use trigger_pr_regression to start it.`,
      allChecks: checkRuns.map((c) => c['name']),
    };
  }

  const checkStatus = String(blockguardCheck['status'] ?? '');
  const checkConclusion = blockguardCheck['conclusion'] ? String(blockguardCheck['conclusion']) : null;

  if (checkStatus !== 'completed') {
    return {
      pr: prNumber,
      headSha,
      checkName: blockguardCheck['name'],
      status: 'in-progress',
      checkStatus,
      message: `BlockGuard is still running on PR #${prNumber}. Check back shortly.`,
    };
  }

  // ── 3. Find the Actions workflow run that created this check ──────────────
  // The check run's details_url points to the run: .../actions/runs/{run_id}
  const detailsUrl = String(blockguardCheck['details_url'] ?? '');
  const runIdMatch = detailsUrl.match(/\/runs\/(\d+)/);
  if (!runIdMatch) {
    return {
      pr: prNumber,
      checkConclusion,
      checkName: blockguardCheck['name'],
      status: checkConclusion ?? 'unknown',
      message: `BlockGuard check completed (${checkConclusion}) but could not resolve workflow run ID from: ${detailsUrl}`,
    };
  }
  const workflowRunId = runIdMatch[1];

  // ── 4. List artifacts for the workflow run ────────────────────────────────
  const artifactsRes = await ghFetch(
    `/repos/${owner}/${repo}/actions/runs/${workflowRunId}/artifacts`,
    token,
  );
  if (!artifactsRes.ok) {
    throw new Error(`Could not fetch artifacts: ${artifactsRes.status}`);
  }

  const artifactsData = (await artifactsRes.json()) as Record<string, unknown>;
  const artifacts = (artifactsData['artifacts'] as Record<string, unknown>[]) ?? [];

  const reportArtifact = artifacts.find(
    (a) =>
      String(a['name'] ?? '')
        .toLowerCase()
        .includes('blockguard'),
  );

  if (!reportArtifact) {
    // No artifact — report conclusion only
    return {
      pr: prNumber,
      workflowRunId,
      checkConclusion,
      status: checkConclusion ?? 'unknown',
      message:
        `BlockGuard check ran (conclusion: ${checkConclusion}) but no report artifact was found ` +
        `in workflow run ${workflowRunId}. ` +
        `Make sure the action.yml includes an upload-artifact step for the blockguard-report.`,
      availableArtifacts: artifacts.map((a) => a['name']),
    };
  }

  // ── 5. Download and parse report.json from the artifact zip ───────────────
  const downloadUrl = String(reportArtifact['archive_download_url'] ?? '');
  let report: Record<string, unknown> | null = null;

  try {
    report = await downloadArtifactReport(downloadUrl, token);
  } catch (err) {
    return {
      pr: prNumber,
      workflowRunId,
      checkConclusion,
      artifactName: reportArtifact['name'],
      status: checkConclusion ?? 'unknown',
      message: `Downloaded artifact but failed to parse report.json: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!report) {
    return {
      pr: prNumber,
      workflowRunId,
      status: checkConclusion ?? 'unknown',
      message: 'report.json not found inside the artifact zip.',
    };
  }

  // ── 6. Format and return ──────────────────────────────────────────────────
  const comparisons = (report['comparisons'] as PageComparisonResult[]) ?? [];

  if (format === 'markdown') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { markdown: generateMarkdownSummary(report as unknown as any) };
  }

  if (format === 'summary') {
    return {
      pr: prNumber,
      workflowRunId,
      runId: report['runId'],
      status: report['status'],
      checkConclusion,
      summary: report['summary'],
      testedPages: report['testedPages'],
      totalAffectedPages: report['totalAffectedPages'],
      changedBlocks: (report['impact'] as Record<string, unknown>)?.['allAffectedBlocks'] ?? [],
      failures: comparisons
        .filter((c) => c.status === 'failed')
        .map((c) => ({ page: c.pagePath, viewport: c.viewport, issue: c.summary })),
      warnings: comparisons
        .filter((c) => c.status === 'warning')
        .map((c) => ({ page: c.pagePath, viewport: c.viewport, issue: c.summary })),
    };
  }

  // format === 'full'
  return { pr: prNumber, workflowRunId, checkConclusion, ...report };
}

async function handleTriggerPrRegression(args: ToolArgs): Promise<unknown> {
  const prNumber = Number(args['pr']);
  if (!prNumber || isNaN(prNumber)) throw new Error('pr (Pull Request number) is required');

  const { token, owner, repo } = resolveGitHubContext(args);

  // ── 1. Get PR details ─────────────────────────────────────────────────────
  const prRes = await ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`, token);
  if (!prRes.ok) throw new Error(`Could not fetch PR #${prNumber}: ${prRes.status}`);

  const pr = (await prRes.json()) as Record<string, unknown>;
  const headSha = (pr['head'] as Record<string, unknown>)?.['sha'] as string;
  const headBranch = (pr['head'] as Record<string, unknown>)?.['ref'] as string;

  // ── 2. Find existing workflow runs for this commit ────────────────────────
  const runsRes = await ghFetch(
    `/repos/${owner}/${repo}/actions/runs?head_sha=${headSha}&per_page=50`,
    token,
  );
  if (!runsRes.ok) throw new Error(`Could not fetch workflow runs: ${runsRes.status}`);

  const runsData = (await runsRes.json()) as Record<string, unknown>;
  const runs = (runsData['workflow_runs'] as Record<string, unknown>[]) ?? [];

  // Find any BlockGuard workflow run
  const blockguardRun = runs.find(
    (r) =>
      String(r['name'] ?? '')
        .toLowerCase()
        .includes('blockguard') ||
      String(r['path'] ?? '')
        .toLowerCase()
        .includes('blockguard'),
  );

  // ── 3a. Re-run existing failed/cancelled run ──────────────────────────────
  if (blockguardRun) {
    const runStatus = String(blockguardRun['status'] ?? '');
    const runConclusion = blockguardRun['conclusion'] ? String(blockguardRun['conclusion']) : null;
    const runId = String(blockguardRun['id'] ?? '');

    if (runStatus === 'in_progress' || runStatus === 'queued') {
      return {
        pr: prNumber,
        status: 'already-running',
        workflowRunId: runId,
        message: `BlockGuard is already running for PR #${prNumber} (run ${runId}, status: ${runStatus}). No action taken.`,
        runsUrl: blockguardRun['html_url'],
      };
    }

    // Re-run all failed jobs
    const rerunRes = await ghFetch(
      `/repos/${owner}/${repo}/actions/runs/${runId}/rerun-failed-jobs`,
      token,
      { method: 'POST', body: JSON.stringify({ enable_debug_logging: false }) },
    );

    if (rerunRes.ok || rerunRes.status === 201) {
      return {
        pr: prNumber,
        status: 'retriggered',
        workflowRunId: runId,
        previousConclusion: runConclusion,
        message: `BlockGuard re-triggered for PR #${prNumber} (re-running failed jobs of run ${runId}).`,
        runsUrl: blockguardRun['html_url'],
      };
    }

    // Re-run failed — fall through to workflow_dispatch to start a fresh run
    const errText = await rerunRes.text();
    process.stderr.write(`Re-run attempt failed (${rerunRes.status}): ${errText} — falling through to workflow_dispatch\n`);
  }

  // ── 3b. No existing run (or re-run not possible) — try workflow_dispatch ──
  // Find a workflow file that contains "blockguard" in its name
  const workflowsRes = await ghFetch(`/repos/${owner}/${repo}/actions/workflows`, token);
  if (!workflowsRes.ok) throw new Error(`Could not list workflows: ${workflowsRes.status}`);

  const workflowsData = (await workflowsRes.json()) as Record<string, unknown>;
  const workflows = (workflowsData['workflows'] as Record<string, unknown>[]) ?? [];

  const bgWorkflow = workflows.find(
    (w) =>
      String(w['name'] ?? '')
        .toLowerCase()
        .includes('blockguard') ||
      String(w['path'] ?? '')
        .toLowerCase()
        .includes('blockguard'),
  );

  if (!bgWorkflow) {
    return {
      pr: prNumber,
      status: 'no-workflow',
      message:
        `No BlockGuard workflow run found for PR #${prNumber} (commit ${headSha.slice(0, 7)}) ` +
        `and no BlockGuard workflow file found in this repo. ` +
        `Available workflows: ${workflows.map((w) => w['name']).join(', ')}`,
    };
  }

  const workflowId = String(bgWorkflow['id'] ?? '');
  const dispatchRes = await ghFetch(
    `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ ref: headBranch }),
    },
  );

  if (dispatchRes.ok || dispatchRes.status === 204) {
    return {
      pr: prNumber,
      headBranch,
      workflowId,
      status: 'dispatched',
      message:
        `BlockGuard workflow dispatched on branch '${headBranch}' for PR #${prNumber}. ` +
        `It may take a few seconds to appear in the Actions tab.`,
    };
  }

  const dispatchErr = await dispatchRes.text();
  return {
    pr: prNumber,
    status: 'dispatch-failed',
    message: `workflow_dispatch failed: ${dispatchRes.status} — ${dispatchErr}`,
  };
}
