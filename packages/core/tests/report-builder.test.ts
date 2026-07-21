import { describe, it, expect } from 'vitest';
import { classifyPageStatus, buildReportSummary, overallStatus } from '../src/reporting/report-builder.js';
import { PageComparisonResult } from '../src/reporting/types.js';
import { ThresholdsConfig } from '../src/config/schema.js';

const defaultThresholds: ThresholdsConfig = {
  visualWarning: 0.5,
  visualFailure: 3.0,
  newConsoleErrorsFailure: 1,
  failOnNewCriticalAccessibilityIssue: true,
  failOnMissingBlock: true,
  failOnHorizontalOverflow: true,
};

function makeComparison(overrides: Partial<PageComparisonResult> = {}): PageComparisonResult {
  return {
    pagePath: '/test',
    baseUrl: 'https://live.example.com/test',
    branchUrl: 'https://preview.example.com/test',
    viewport: 'desktop',
    status: 'passed',
    selectionReasons: ['covers-variation:cards:default'],
    affectedBlocks: ['cards'],
    summary: 'No regressions detected',
    ...overrides,
  };
}

describe('classifyPageStatus', () => {
  it('returns passed when no issues', () => {
    const { status } = classifyPageStatus(
      { pagePath: '/test', baseUrl: '', branchUrl: '', viewport: 'desktop',
        selectionReasons: [], affectedBlocks: [] },
      defaultThresholds,
    );
    expect(status).toBe('passed');
  });

  it('returns warning for visual diff above warning threshold', () => {
    const { status } = classifyPageStatus(
      {
        pagePath: '/test', baseUrl: '', branchUrl: '', viewport: 'desktop',
        selectionReasons: [], affectedBlocks: [],
        visual: { mismatchPercent: 1.0, diffPixels: 100, totalPixels: 10000,
          baselinePath: '', branchPath: '', diffPath: '', width: 100, height: 100 },
      },
      defaultThresholds,
    );
    expect(status).toBe('warning');
  });

  it('returns failed for visual diff above failure threshold', () => {
    const { status } = classifyPageStatus(
      {
        pagePath: '/test', baseUrl: '', branchUrl: '', viewport: 'desktop',
        selectionReasons: [], affectedBlocks: [],
        visual: { mismatchPercent: 5.0, diffPixels: 500, totalPixels: 10000,
          baselinePath: '', branchPath: '', diffPath: '', width: 100, height: 100 },
      },
      defaultThresholds,
    );
    expect(status).toBe('failed');
  });

  it('returns failed for missing block', () => {
    const { status, summary } = classifyPageStatus(
      {
        pagePath: '/test', baseUrl: '', branchUrl: '', viewport: 'desktop',
        selectionReasons: [], affectedBlocks: ['cards'],
        dom: [{
          blockName: 'cards', variations: [], removedElements: [], addedElements: [],
          headingChanges: { before: [], after: [] },
          linkChanges: { added: [], removed: [] },
          imageChanges: { added: [], removed: [] },
          missingInBranch: true, hasHorizontalOverflow: false, overflowChanged: false,
        }],
      },
      defaultThresholds,
    );
    expect(status).toBe('failed');
    expect(summary).toContain('missing');
  });

  it('returns failed for new critical a11y violation', () => {
    const { status } = classifyPageStatus(
      {
        pagePath: '/test', baseUrl: '', branchUrl: '', viewport: 'desktop',
        selectionReasons: [], affectedBlocks: [],
        a11y: { newViolations: [], resolvedViolations: [], newCriticalCount: 1, newSeriousCount: 0 },
      },
      defaultThresholds,
    );
    expect(status).toBe('failed');
  });
});

describe('buildReportSummary', () => {
  it('counts statuses correctly', () => {
    const comparisons: PageComparisonResult[] = [
      makeComparison({ status: 'passed' }),
      makeComparison({ status: 'passed' }),
      makeComparison({ status: 'warning' }),
      makeComparison({ status: 'failed' }),
      makeComparison({ status: 'unable-to-test' }),
    ];

    const summary = buildReportSummary(comparisons);
    expect(summary.passed).toBe(2);
    expect(summary.warnings).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.unableToTest).toBe(1);
    expect(summary.totalComparisons).toBe(5);
  });
});

describe('overallStatus', () => {
  it('returns failed if any failures', () => {
    const summary = { passed: 5, warnings: 2, failed: 1, unableToTest: 0,
      totalComparisons: 8, newA11yCriticalIssues: 0, newConsoleErrors: 0,
      pagesWithOverflow: 0, pagesWithMissingBlocks: 0 };
    expect(overallStatus(summary)).toBe('failed');
  });

  it('returns warning if warnings and no failures', () => {
    const summary = { passed: 5, warnings: 2, failed: 0, unableToTest: 0,
      totalComparisons: 7, newA11yCriticalIssues: 0, newConsoleErrors: 0,
      pagesWithOverflow: 0, pagesWithMissingBlocks: 0 };
    expect(overallStatus(summary)).toBe('warning');
  });

  it('returns passed when all pass', () => {
    const summary = { passed: 5, warnings: 0, failed: 0, unableToTest: 0,
      totalComparisons: 5, newA11yCriticalIssues: 0, newConsoleErrors: 0,
      pagesWithOverflow: 0, pagesWithMissingBlocks: 0 };
    expect(overallStatus(summary)).toBe('passed');
  });
});
