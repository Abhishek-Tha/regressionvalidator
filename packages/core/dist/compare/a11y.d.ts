import { Page } from 'puppeteer';
export interface A11yViolation {
    id: string;
    impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
    description: string;
    help: string;
    helpUrl: string;
    nodes: number;
}
export interface A11yResult {
    url: string;
    violations: A11yViolation[];
    violationCount: number;
    criticalCount: number;
    seriousCount: number;
}
export interface A11yDiffResult {
    newViolations: A11yViolation[];
    resolvedViolations: A11yViolation[];
    newCriticalCount: number;
    newSeriousCount: number;
}
/**
 * Run axe-core accessibility audit on a Puppeteer page.
 * Injects axe-core via CDN if not already present.
 */
export declare function runA11yAudit(page: Page, url: string): Promise<A11yResult>;
/**
 * Diff two a11y results to find new and resolved violations.
 */
export declare function diffA11yResults(baseline: A11yResult, branch: A11yResult): A11yDiffResult;
//# sourceMappingURL=a11y.d.ts.map