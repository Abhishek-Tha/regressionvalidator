import { Page } from 'puppeteer';
export interface RuntimeMetrics {
    url: string;
    viewport: string;
    consoleErrors: string[];
    consoleWarnings: string[];
    failedRequests: Array<{
        url: string;
        reason: string;
    }>;
    unhandledExceptions: string[];
    jsErrorCount: number;
    failedRequestCount: number;
}
export interface RuntimeDiffResult {
    newConsoleErrors: string[];
    newFailedRequests: string[];
    newUnhandledExceptions: string[];
    newErrorCount: number;
    hasRegressions: boolean;
}
/**
 * Instrument a Puppeteer page to collect runtime errors and failed requests.
 * Must be called before page.goto().
 */
export declare function instrumentPage(page: Page): {
    getMetrics: (url: string, viewport: string) => RuntimeMetrics;
};
/**
 * Diff two runtime metric captures to identify new regressions.
 */
export declare function diffRuntimeMetrics(baseline: RuntimeMetrics, branch: RuntimeMetrics, maxNewErrors?: number): RuntimeDiffResult;
//# sourceMappingURL=runtime.d.ts.map