/**
 * Instrument a Puppeteer page to collect runtime errors and failed requests.
 * Must be called before page.goto().
 */
export function instrumentPage(page) {
    const consoleErrors = [];
    const consoleWarnings = [];
    const failedRequests = [];
    const unhandledExceptions = [];
    page.on('console', (msg) => {
        const type = msg.type();
        if (type === 'error') {
            consoleErrors.push(msg.text());
        }
        else if (type === 'warn') {
            consoleWarnings.push(msg.text());
        }
    });
    page.on('requestfailed', (request) => {
        failedRequests.push({
            url: request.url(),
            reason: request.failure()?.errorText ?? 'unknown',
        });
    });
    page.on('pageerror', (err) => {
        unhandledExceptions.push(err.message);
    });
    return {
        getMetrics: (url, viewport) => ({
            url,
            viewport,
            consoleErrors: [...consoleErrors],
            consoleWarnings: [...consoleWarnings],
            failedRequests: [...failedRequests],
            unhandledExceptions: [...unhandledExceptions],
            jsErrorCount: consoleErrors.length + unhandledExceptions.length,
            failedRequestCount: failedRequests.length,
        }),
    };
}
/**
 * Diff two runtime metric captures to identify new regressions.
 */
export function diffRuntimeMetrics(baseline, branch, maxNewErrors = 1) {
    const baseErrors = new Set(baseline.consoleErrors.map(normaliseError));
    const baseRequests = new Set(baseline.failedRequests.map((r) => r.url));
    const baseExceptions = new Set(baseline.unhandledExceptions.map(normaliseError));
    const newConsoleErrors = branch.consoleErrors.filter((e) => !baseErrors.has(normaliseError(e)));
    const newFailedRequests = branch.failedRequests
        .filter((r) => !baseRequests.has(r.url))
        .map((r) => r.url);
    const newUnhandledExceptions = branch.unhandledExceptions.filter((e) => !baseExceptions.has(normaliseError(e)));
    const newErrorCount = newConsoleErrors.length + newFailedRequests.length + newUnhandledExceptions.length;
    return {
        newConsoleErrors,
        newFailedRequests,
        newUnhandledExceptions,
        newErrorCount,
        hasRegressions: newErrorCount >= maxNewErrors,
    };
}
/**
 * Normalise an error message for comparison — strip stack traces and line numbers.
 */
function normaliseError(error) {
    return error
        .split('\n')[0] // first line only
        .replace(/:\d+:\d+/g, '') // strip line:col
        .replace(/https?:\/\/[^\s]+/g, '<url>') // strip URLs
        .trim()
        .toLowerCase();
}
//# sourceMappingURL=runtime.js.map