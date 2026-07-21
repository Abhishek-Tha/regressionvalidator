// Config
export { loadConfig, resolveLiveOrigin, resolvePreviewOrigin } from './config/loader.js';
// Discovery
export { discoverFromQueryIndex } from './discovery/query-index.js';
export { discoverFromSitemap } from './discovery/sitemap.js';
// Indexing
export { detectBlocks, buildBlockSignatures } from './indexing/block-detector.js';
export { scanPage } from './indexing/page-scanner.js';
export { createEmptyIndex, saveIndex, loadIndex, buildCacheKey, hashConfig, findBlockUsage, getAllBlockNames, getBlockVariations, mergePages, } from './indexing/usage-index.js';
// Impact analysis
export { getChangedFiles, groupChangedFilesByBlock, isSiteWideChange } from './impact/git-diff.js';
export { buildDependencyGraph, findTransitivelyAffectedBlocks } from './impact/dependency-graph.js';
export { analyzeImpact } from './impact/impact-analyzer.js';
// Page selection
export { selectRegressionPages } from './selection/page-selector.js';
// Capture
export { stabilizePage } from './capture/stabilizer.js';
export { captureScreenshot, captureMultiViewport, launchBrowser, waitForUrl } from './capture/screenshot.js';
// Comparison
export { compareVisuals } from './compare/visual.js';
export { captureDomSnapshot, diffDomSnapshots } from './compare/dom-diff.js';
export { runA11yAudit, diffA11yResults } from './compare/a11y.js';
export { instrumentPage, diffRuntimeMetrics } from './compare/runtime.js';
// Reporting
export { classifyPageStatus, buildRegressionReport, buildReportSummary, overallStatus } from './reporting/report-builder.js';
export { generateHtmlReport, generateMarkdownSummary, saveReports } from './reporting/html-reporter.js';
//# sourceMappingURL=index.js.map