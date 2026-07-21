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
export async function runA11yAudit(page: Page, url: string): Promise<A11yResult> {
  // Inject axe-core
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      if ((window as unknown as Record<string, unknown>)['axe']) {
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
    const axe = (window as unknown as Record<string, unknown>)['axe'] as {
      run: (options?: object) => Promise<{ violations: unknown[] }>;
    };

    const result = await axe.run({
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'],
      },
    });

    return result.violations.map((v: unknown) => {
      const violation = v as {
        id: string;
        impact: string;
        description: string;
        help: string;
        helpUrl: string;
        nodes: unknown[];
      };
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

  const violations = results as A11yViolation[];

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
export function diffA11yResults(baseline: A11yResult, branch: A11yResult): A11yDiffResult {
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
