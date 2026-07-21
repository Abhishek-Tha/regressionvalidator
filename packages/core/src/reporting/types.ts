import { ImpactAnalysis } from '../impact/types.js';
import { VisualDiffResult } from '../compare/visual.js';
import { DomDiffResult } from '../compare/dom-diff.js';
import { A11yDiffResult } from '../compare/a11y.js';
import { RuntimeDiffResult } from '../compare/runtime.js';

export type PageStatus = 'passed' | 'warning' | 'failed' | 'unable-to-test' | 'expected-change';

export interface PageComparisonResult {
  pagePath: string;
  baseUrl: string;
  branchUrl: string;
  viewport: string;
  status: PageStatus;
  /** Reasons this page was selected for testing */
  selectionReasons: string[];
  /** Affected block names on this page */
  affectedBlocks: string[];
  visual?: VisualDiffResult;
  dom?: DomDiffResult[];
  a11y?: A11yDiffResult;
  runtime?: RuntimeDiffResult;
  /** Human-readable summary of what changed */
  summary: string;
  /** Path to before screenshot */
  beforeScreenshot?: string;
  /** Path to after screenshot */
  afterScreenshot?: string;
  /** Path to diff image */
  diffScreenshot?: string;
  error?: string;
}

export interface RegressionReport {
  /** Unique run identifier */
  runId: string;
  generatedAt: string;
  baseRef: string;
  headRef: string;
  impact: ImpactAnalysis;
  /** Total pages found using affected blocks */
  totalAffectedPages: number;
  /** Pages actually tested */
  testedPages: number;
  /** Pages skipped due to selection limit */
  skippedPages: number;
  /** Pages that could not be tested (preview unavailable, auth, etc.) */
  unableToTestPages: number;
  mode: 'representative' | 'full';
  viewports: string[];
  comparisons: PageComparisonResult[];
  /** Aggregated counts */
  summary: ReportSummary;
  /** Overall report status */
  status: 'passed' | 'warning' | 'failed';
  /** Path to generated HTML report */
  htmlReportPath?: string;
  /** Path to report JSON */
  jsonReportPath?: string;
  /** Path to summary markdown */
  markdownPath?: string;
}

export interface ReportSummary {
  passed: number;
  warnings: number;
  failed: number;
  unableToTest: number;
  totalComparisons: number;
  newA11yCriticalIssues: number;
  newConsoleErrors: number;
  pagesWithOverflow: number;
  pagesWithMissingBlocks: number;
}
