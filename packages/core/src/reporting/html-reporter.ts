import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { RegressionReport, PageComparisonResult } from './types.js';

const STATUS_EMOJI: Record<string, string> = {
  passed: '✅',
  warning: '⚠️',
  failed: '❌',
  'unable-to-test': '⏭️',
  'expected-change': '✔️',
};

const STATUS_COLOR: Record<string, string> = {
  passed: '#22c55e',
  warning: '#f59e0b',
  failed: '#ef4444',
  'unable-to-test': '#94a3b8',
  'expected-change': '#3b82f6',
};

/**
 * Generate a self-contained HTML regression report.
 */
export function generateHtmlReport(report: RegressionReport, outputDir: string): string {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const html = buildHtml(report, outputDir);
  const outputPath = join(outputDir, 'index.html');
  writeFileSync(outputPath, html, 'utf8');
  return outputPath;
}

function buildHtml(report: RegressionReport, outputDir: string): string {
  const { summary, status, impact } = report;
  const statusColor = STATUS_COLOR[status] ?? '#94a3b8';

  const pageRows = report.comparisons
    .map((c) => buildPageRow(c, outputDir))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BlockGuard Regression Report — ${report.runId}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #1e293b; }
    .header { background: #1e293b; color: white; padding: 24px 32px; }
    .header h1 { font-size: 1.5rem; font-weight: 700; }
    .header .meta { font-size: 0.875rem; color: #94a3b8; margin-top: 4px; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-weight: 600; font-size: 0.875rem; color: white; background: ${statusColor}; margin-left: 12px; vertical-align: middle; }
    .container { max-width: 1400px; margin: 0 auto; padding: 32px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card .value { font-size: 2rem; font-weight: 700; }
    .card .label { font-size: 0.875rem; color: #64748b; margin-top: 4px; }
    .section { background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; }
    .section h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; padding: 8px 12px; background: #f1f5f9; font-weight: 600; color: #475569; }
    td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    .status-pill { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; color: white; }
    .tag { display: inline-block; background: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; margin: 1px; }
    .screenshots { display: flex; gap: 8px; flex-wrap: wrap; }
    .screenshots img { max-width: 200px; max-height: 150px; object-fit: cover; border: 1px solid #e2e8f0; border-radius: 4px; cursor: pointer; }
    .screenshots a { font-size: 0.75rem; color: #3b82f6; text-decoration: none; }
    details summary { cursor: pointer; font-weight: 600; padding: 8px 0; }
    .diff-pct { font-weight: 600; }
    .diff-pct.warn { color: #f59e0b; }
    .diff-pct.fail { color: #ef4444; }
    .diff-pct.pass { color: #22c55e; }
    .footer { text-align: center; padding: 24px; color: #94a3b8; font-size: 0.75rem; }
  </style>
</head>
<body>
  <div class="header">
    <h1>BlockGuard Regression Report <span class="status-badge">${STATUS_EMOJI[status]} ${status.toUpperCase()}</span></h1>
    <div class="meta">
      Run ID: ${report.runId} &nbsp;·&nbsp;
      Generated: ${new Date(report.generatedAt).toLocaleString()} &nbsp;·&nbsp;
      ${report.baseRef} → ${report.headRef}
    </div>
  </div>

  <div class="container">
    <div class="grid">
      <div class="card">
        <div class="value">${impact.allAffectedBlocks.length}</div>
        <div class="label">Changed Blocks</div>
      </div>
      <div class="card">
        <div class="value">${report.totalAffectedPages}</div>
        <div class="label">Affected Pages</div>
      </div>
      <div class="card">
        <div class="value">${report.testedPages}</div>
        <div class="label">Pages Tested</div>
      </div>
      <div class="card">
        <div class="value" style="color: #22c55e">${summary.passed}</div>
        <div class="label">Passed</div>
      </div>
      <div class="card">
        <div class="value" style="color: #f59e0b">${summary.warnings}</div>
        <div class="label">Warnings</div>
      </div>
      <div class="card">
        <div class="value" style="color: #ef4444">${summary.failed}</div>
        <div class="label">Failed</div>
      </div>
    </div>

    <div class="section">
      <h2>Impact Analysis</h2>
      <table>
        <tr><th>Risk Level</th><td>${impact.risk}</td></tr>
        <tr><th>Directly Changed Blocks</th><td>${impact.directlyChangedBlocks.map((b) => `<span class="tag">${b.name}</span>`).join(' ') || '—'}</td></tr>
        <tr><th>Transitively Affected</th><td>${impact.transitivelyChangedBlocks.map((b) => `<span class="tag">${b.name}</span>`).join(' ') || '—'}</td></tr>
        <tr><th>Shared Files Changed</th><td>${impact.sharedFilesChanged.map((f) => `<span class="tag">${f}</span>`).join(' ') || '—'}</td></tr>
        <tr><th>Mode</th><td>${report.mode}</td></tr>
        <tr><th>Viewports</th><td>${report.viewports.map((v) => `<span class="tag">${v}</span>`).join(' ')}</td></tr>
        <tr><th>Skipped Pages</th><td>${report.skippedPages}</td></tr>
      </table>
    </div>

    <div class="section">
      <h2>Page Comparison Results (${report.comparisons.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Page</th>
            <th>Viewport</th>
            <th>Visual Diff</th>
            <th>Issues</th>
            <th>Screenshots</th>
          </tr>
        </thead>
        <tbody>
          ${pageRows}
        </tbody>
      </table>
    </div>
  </div>

  <div class="footer">
    Generated by BlockGuard &nbsp;·&nbsp; ${new Date(report.generatedAt).toISOString()}
  </div>
</body>
</html>`;
}

function buildPageRow(c: PageComparisonResult, outputDir: string): string {
  const color = STATUS_COLOR[c.status] ?? '#94a3b8';
  const emoji = STATUS_EMOJI[c.status] ?? '';

  const diffPct = c.visual ? c.visual.mismatchPercent : null;
  let diffClass = 'pass';
  if (diffPct !== null) {
    if (diffPct >= 3.0) diffClass = 'fail';
    else if (diffPct >= 0.5) diffClass = 'warn';
  }

  const screenshotsHtml = buildScreenshotsHtml(c, outputDir);

  const issues: string[] = [];
  if (c.dom) {
    for (const d of c.dom) {
      if (d.missingInBranch) issues.push(`Missing block: ${d.blockName}`);
      if (d.hasHorizontalOverflow) issues.push(`Overflow: ${d.blockName}`);
      if (d.headingChanges.before.length > 0) issues.push(`Heading changed: ${d.blockName}`);
    }
  }
  if (c.a11y && c.a11y.newCriticalCount > 0) {
    issues.push(`${c.a11y.newCriticalCount} new critical a11y issue(s)`);
  }
  if (c.runtime && c.runtime.newConsoleErrors.length > 0) {
    issues.push(`${c.runtime.newConsoleErrors.length} new console error(s)`);
  }
  if (c.error) issues.push(c.error);

  return `<tr>
    <td><span class="status-pill" style="background:${color}">${emoji} ${c.status}</span></td>
    <td><a href="${c.branchUrl}" target="_blank">${c.pagePath}</a></td>
    <td><span class="tag">${c.viewport}</span></td>
    <td>${diffPct !== null ? `<span class="diff-pct ${diffClass}">${diffPct.toFixed(2)}%</span>` : '—'}</td>
    <td>${issues.length > 0 ? issues.map((i) => `<div>• ${escapeHtml(i)}</div>`).join('') : '—'}</td>
    <td>${screenshotsHtml}</td>
  </tr>`;
}

function buildScreenshotsHtml(c: PageComparisonResult, outputDir: string): string {
  const links: string[] = [];

  const toRelative = (p?: string) => {
    if (!p) return null;
    try {
      return relative(outputDir, p);
    } catch {
      return p;
    }
  };

  const before = toRelative(c.beforeScreenshot);
  const after = toRelative(c.afterScreenshot);
  const diff = toRelative(c.diffScreenshot);

  if (before) links.push(`<a href="${before}" target="_blank">Before</a>`);
  if (after) links.push(`<a href="${after}" target="_blank">After</a>`);
  if (diff) links.push(`<a href="${diff}" target="_blank">Diff</a>`);

  if (links.length === 0) return '—';
  return `<div class="screenshots">${links.join(' · ')}</div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate a Markdown summary for PR comments.
 */
export function generateMarkdownSummary(report: RegressionReport): string {
  const { summary, impact, status } = report;
  const emoji = STATUS_EMOJI[status] ?? '';

  const blockList = impact.allAffectedBlocks.map((b) => `- \`${b}\``).join('\n');
  const failedPages = report.comparisons
    .filter((c) => c.status === 'failed')
    .map((c) => `- **${c.pagePath}** (${c.viewport}): ${c.summary}`)
    .join('\n');
  const warnPages = report.comparisons
    .filter((c) => c.status === 'warning')
    .map((c) => `- **${c.pagePath}** (${c.viewport}): ${c.summary}`)
    .join('\n');

  return `## ${emoji} BlockGuard Regression Report

**Status:** \`${status.toUpperCase()}\` &nbsp;|&nbsp; **Run:** \`${report.runId}\`

### Changed Blocks
${blockList || '_None detected_'}

### Impact
- **${report.totalAffectedPages}** pages use the affected blocks
- **${report.testedPages}** pages tested across **${report.viewports.join(', ')}** viewports
- **${report.skippedPages}** pages skipped (selection limit)
- Mode: **${report.mode}**

### Results

| Passed | Warnings | Failed | Unable to Test |
|--------|----------|--------|----------------|
| ${summary.passed} | ${summary.warnings} | ${summary.failed} | ${summary.unableToTest} |

${summary.failed > 0 ? `### ❌ Failures\n${failedPages}` : ''}

${summary.warnings > 0 ? `### ⚠️ Warnings\n${warnPages}` : ''}

${summary.newA11yCriticalIssues > 0 ? `### ♿ Accessibility\n${summary.newA11yCriticalIssues} new critical accessibility issue(s) detected.` : ''}

---
<details><summary>Full report</summary>

See attached workflow artifact \`blockguard-report/index.html\` for before/after/diff screenshots.

</details>

<!-- blockguard-report-marker -->`;
}

/**
 * Save reports to disk.
 */
export function saveReports(report: RegressionReport, outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // JSON report
  writeFileSync(
    join(outputDir, 'report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  // HTML report
  generateHtmlReport(report, outputDir);

  // Markdown summary
  const markdown = generateMarkdownSummary(report);
  writeFileSync(join(outputDir, 'summary.md'), markdown, 'utf8');
}
