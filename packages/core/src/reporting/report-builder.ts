import { ThresholdsConfig } from '../config/schema.js';
import {
  PageComparisonResult,
  PageStatus,
  RegressionReport,
  ReportSummary,
} from './types.js';
import { ImpactAnalysis } from '../impact/types.js';

/**
 * Apply configured thresholds to a single page comparison and determine its status.
 */
export function classifyPageStatus(
  comparison: Omit<PageComparisonResult, 'status' | 'summary'>,
  thresholds: ThresholdsConfig,
): { status: PageStatus; summary: string } {
  const issues: string[] = [];
  let status: PageStatus = 'passed';

  const escalate = (to: PageStatus) => {
    if (to === 'failed' || (to === 'warning' && status === 'passed')) {
      status = to;
    }
  };

  // Visual diff check
  if (comparison.visual) {
    const pct = comparison.visual.mismatchPercent;
    if (pct >= thresholds.visualFailure) {
      escalate('failed');
      issues.push(`Visual diff ${pct.toFixed(1)}% exceeds failure threshold (${thresholds.visualFailure}%)`);
    } else if (pct >= thresholds.visualWarning) {
      escalate('warning');
      issues.push(`Visual diff ${pct.toFixed(1)}% exceeds warning threshold (${thresholds.visualWarning}%)`);
    }
  }

  // DOM diff — missing block
  if (comparison.dom) {
    for (const diff of comparison.dom) {
      if (diff.missingInBranch && thresholds.failOnMissingBlock) {
        escalate('failed');
        issues.push(`Block "${diff.blockName}" missing in branch`);
      }
      if (diff.hasHorizontalOverflow && thresholds.failOnHorizontalOverflow) {
        escalate('failed');
        issues.push(`Block "${diff.blockName}" has horizontal overflow`);
      }
      if (diff.overflowChanged) {
        escalate('warning');
        issues.push(`Block "${diff.blockName}" overflow state changed`);
      }
      if (diff.headingChanges.before.length > 0 || diff.headingChanges.after.length > 0) {
        escalate('warning');
        issues.push(`Block "${diff.blockName}" heading structure changed`);
      }
    }
  }

  // A11y check
  if (comparison.a11y) {
    if (comparison.a11y.newCriticalCount > 0 && thresholds.failOnNewCriticalAccessibilityIssue) {
      escalate('failed');
      issues.push(
        `${comparison.a11y.newCriticalCount} new critical accessibility violation(s)`,
      );
    }
    if (comparison.a11y.newSeriousCount > 0) {
      escalate('warning');
      issues.push(`${comparison.a11y.newSeriousCount} new serious accessibility violation(s)`);
    }
  }

  // Runtime errors
  if (comparison.runtime) {
    const newErrors = comparison.runtime.newErrorCount;
    if (newErrors >= thresholds.newConsoleErrorsFailure && newErrors > 0) {
      escalate('failed');
      issues.push(`${newErrors} new console error(s) detected`);
    }
  }

  const summary =
    issues.length === 0 ? 'No regressions detected' : issues.join('; ');

  return { status, summary };
}

/**
 * Aggregate all page comparison results into a report summary.
 */
export function buildReportSummary(comparisons: PageComparisonResult[]): ReportSummary {
  const summary: ReportSummary = {
    passed: 0,
    warnings: 0,
    failed: 0,
    unableToTest: 0,
    totalComparisons: comparisons.length,
    newA11yCriticalIssues: 0,
    newConsoleErrors: 0,
    pagesWithOverflow: 0,
    pagesWithMissingBlocks: 0,
  };

  for (const c of comparisons) {
    switch (c.status) {
      case 'passed':
      case 'expected-change':
        summary.passed++;
        break;
      case 'warning':
        summary.warnings++;
        break;
      case 'failed':
        summary.failed++;
        break;
      case 'unable-to-test':
        summary.unableToTest++;
        break;
    }

    if (c.a11y) {
      summary.newA11yCriticalIssues += c.a11y.newCriticalCount;
    }
    if (c.runtime) {
      summary.newConsoleErrors += c.runtime.newConsoleErrors.length;
    }
    if (c.dom) {
      if (c.dom.some((d) => d.hasHorizontalOverflow)) summary.pagesWithOverflow++;
      if (c.dom.some((d) => d.missingInBranch)) summary.pagesWithMissingBlocks++;
    }
  }

  return summary;
}

/**
 * Determine the overall report status from the summary.
 */
export function overallStatus(summary: ReportSummary): 'passed' | 'warning' | 'failed' {
  if (summary.failed > 0) return 'failed';
  if (summary.warnings > 0) return 'warning';
  return 'passed';
}

/**
 * Build a complete regression report from all components.
 */
export function buildRegressionReport(params: {
  runId: string;
  baseRef: string;
  headRef: string;
  impact: ImpactAnalysis;
  comparisons: PageComparisonResult[];
  totalAffectedPages: number;
  skippedPages: number;
  mode: 'representative' | 'full';
  viewports: string[];
  outputDir: string;
}): RegressionReport {
  const reportSummary = buildReportSummary(params.comparisons);
  const status = overallStatus(reportSummary);

  return {
    runId: params.runId,
    generatedAt: new Date().toISOString(),
    baseRef: params.baseRef,
    headRef: params.headRef,
    impact: params.impact,
    totalAffectedPages: params.totalAffectedPages,
    testedPages: params.comparisons.filter((c) => c.status !== 'unable-to-test').length,
    skippedPages: params.skippedPages,
    unableToTestPages: params.comparisons.filter((c) => c.status === 'unable-to-test').length,
    mode: params.mode,
    viewports: params.viewports,
    comparisons: params.comparisons,
    summary: reportSummary,
    status,
    jsonReportPath: `${params.outputDir}/report.json`,
    htmlReportPath: `${params.outputDir}/index.html`,
    markdownPath: `${params.outputDir}/summary.md`,
  };
}
