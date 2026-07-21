import { ThresholdsConfig } from '../config/schema.js';
import { PageComparisonResult, PageStatus, RegressionReport, ReportSummary } from './types.js';
import { ImpactAnalysis } from '../impact/types.js';
/**
 * Apply configured thresholds to a single page comparison and determine its status.
 */
export declare function classifyPageStatus(comparison: Omit<PageComparisonResult, 'status' | 'summary'>, thresholds: ThresholdsConfig): {
    status: PageStatus;
    summary: string;
};
/**
 * Aggregate all page comparison results into a report summary.
 */
export declare function buildReportSummary(comparisons: PageComparisonResult[]): ReportSummary;
/**
 * Determine the overall report status from the summary.
 */
export declare function overallStatus(summary: ReportSummary): 'passed' | 'warning' | 'failed';
/**
 * Build a complete regression report from all components.
 */
export declare function buildRegressionReport(params: {
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
}): RegressionReport;
//# sourceMappingURL=report-builder.d.ts.map