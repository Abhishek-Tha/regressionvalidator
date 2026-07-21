import { RegressionReport } from './types.js';
/**
 * Generate a self-contained HTML regression report.
 */
export declare function generateHtmlReport(report: RegressionReport, outputDir: string): string;
/**
 * Generate a Markdown summary for PR comments.
 */
export declare function generateMarkdownSummary(report: RegressionReport): string;
/**
 * Save reports to disk.
 */
export declare function saveReports(report: RegressionReport, outputDir: string): void;
//# sourceMappingURL=html-reporter.d.ts.map