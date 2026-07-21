/**
 * Run axe-core accessibility audit on a Puppeteer page.
 * Injects axe-core via CDN if not already present.
 */
export async function runA11yAudit(page, url) {
    // Inject axe-core
    await page.evaluate(() => {
        return new Promise((resolve, reject) => {
            if (window['axe']) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load axe-core'));
            document.head.appendChild(script);
        });
    });
    // Run axe analysis
    const results = await page.evaluate(async () => {
        const axe = window['axe'];
        const result = await axe.run({
            runOnly: {
                type: 'tag',
                values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'],
            },
        });
        return result.violations.map((v) => {
            const violation = v;
            return {
                id: violation.id,
                impact: violation.impact,
                description: violation.description,
                help: violation.help,
                helpUrl: violation.helpUrl,
                nodes: violation.nodes.length,
            };
        });
    });
    const violations = results;
    return {
        url,
        violations,
        violationCount: violations.length,
        criticalCount: violations.filter((v) => v.impact === 'critical').length,
        seriousCount: violations.filter((v) => v.impact === 'serious').length,
    };
}
/**
 * Diff two a11y results to find new and resolved violations.
 */
export function diffA11yResults(baseline, branch) {
    const baselineIds = new Set(baseline.violations.map((v) => v.id));
    const branchIds = new Set(branch.violations.map((v) => v.id));
    const newViolations = branch.violations.filter((v) => !baselineIds.has(v.id));
    const resolvedViolations = baseline.violations.filter((v) => !branchIds.has(v.id));
    return {
        newViolations,
        resolvedViolations,
        newCriticalCount: newViolations.filter((v) => v.impact === 'critical').length,
        newSeriousCount: newViolations.filter((v) => v.impact === 'serious').length,
    };
}
//# sourceMappingURL=a11y.js.map