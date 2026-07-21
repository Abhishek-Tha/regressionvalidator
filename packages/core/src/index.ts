// Config
export { loadConfig, resolveLiveOrigin, resolvePreviewOrigin } from './config/loader.js';
export type {
  BlockGuardConfig,
  SiteConfig,
  ViewportConfig,
  BlockDetectionConfig,
  DiscoveryConfig,
  SelectionConfig,
  CaptureConfig,
  ThresholdsConfig,
} from './config/schema.js';

// Discovery
export { discoverFromQueryIndex } from './discovery/query-index.js';
export { discoverFromSitemap } from './discovery/sitemap.js';
export type { PageRecord, DiscoveryResult, DiscoverySource } from './discovery/types.js';

// Indexing
export { detectBlocks, buildBlockSignatures } from './indexing/block-detector.js';
export { scanPage } from './indexing/page-scanner.js';
export {
  createEmptyIndex,
  saveIndex,
  loadIndex,
  buildCacheKey,
  hashConfig,
  findBlockUsage,
  getAllBlockNames,
  getBlockVariations,
  mergePages,
} from './indexing/usage-index.js';
export type {
  BlockUsage,
  BlockSignature,
  IndexedPage,
  UsageIndex,
  BlockUsageSummary,
} from './indexing/types.js';

// Impact analysis
export { getChangedFiles, groupChangedFilesByBlock, isSiteWideChange } from './impact/git-diff.js';
export { buildDependencyGraph, findTransitivelyAffectedBlocks } from './impact/dependency-graph.js';
export { analyzeImpact } from './impact/impact-analyzer.js';
export type { ImpactAnalysis, ChangedBlock, RiskLevel, BlockDependencyGraph } from './impact/types.js';

// Page selection
export { selectRegressionPages } from './selection/page-selector.js';
export type { SelectedPage, SelectionResult } from './selection/page-selector.js';

// Capture
export { stabilizePage } from './capture/stabilizer.js';
export { captureScreenshot, captureMultiViewport, captureBlockClip, launchBrowser, waitForUrl, pageExists } from './capture/screenshot.js';
export type { ScreenshotResult, CapturePageOptions, BlockClipResult } from './capture/screenshot.js';

// Comparison
export { compareVisuals } from './compare/visual.js';
export type { VisualDiffResult } from './compare/visual.js';

export { captureDomSnapshot, diffDomSnapshots } from './compare/dom-diff.js';
export type { PageDomSnapshot, BlockDomSnapshot, DomDiffResult } from './compare/dom-diff.js';

export { runA11yAudit, diffA11yResults } from './compare/a11y.js';
export type { A11yResult, A11yViolation, A11yDiffResult } from './compare/a11y.js';

export { instrumentPage, diffRuntimeMetrics } from './compare/runtime.js';
export type { RuntimeMetrics, RuntimeDiffResult } from './compare/runtime.js';

// Reporting
export { classifyPageStatus, buildRegressionReport, buildReportSummary, overallStatus } from './reporting/report-builder.js';
export { generateHtmlReport, generateMarkdownSummary, saveReports } from './reporting/html-reporter.js';
export type {
  PageComparisonResult,
  RegressionReport,
  ReportSummary,
  PageStatus,
} from './reporting/types.js';
