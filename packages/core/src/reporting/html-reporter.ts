import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, relative, isAbsolute } from 'path';
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

const VP_ICON: Record<string, string> = {
  mobile: '📱',
  desktop: '🖥',
  tablet: '📟',
};

/**
 * Embed an image file as a base64 data URI for a self-contained report.
 * Returns null if the file cannot be read.
 */
function toDataUri(filePath?: string): string | null {
  if (!filePath) return null;
  try {
    const data = readFileSync(filePath);
    return `data:image/png;base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

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

// ─── Group comparisons by pagePath ───────────────────────────────────────────

function groupByPage(
  comparisons: PageComparisonResult[],
): Map<string, PageComparisonResult[]> {
  const map = new Map<string, PageComparisonResult[]>();
  for (const c of comparisons) {
    const existing = map.get(c.pagePath) ?? [];
    existing.push(c);
    map.set(c.pagePath, existing);
  }
  return map;
}

/** Worst status wins: failed > warning > unable-to-test > expected-change > passed */
function worstStatus(comparisons: PageComparisonResult[]): string {
  const order = ['failed', 'warning', 'unable-to-test', 'expected-change', 'passed'];
  for (const s of order) {
    if (comparisons.some((c) => c.status === s)) return s;
  }
  return 'passed';
}

// ─── Main HTML builder ────────────────────────────────────────────────────────

function buildHtml(report: RegressionReport, outputDir: string): string {
  const { summary, status, impact } = report;
  const statusColor = STATUS_COLOR[status] ?? '#94a3b8';

  const grouped = groupByPage(report.comparisons);
  const pageGroupsHtml = Array.from(grouped.entries())
    .map(([pagePath, comparisons]) => buildPageGroup(pagePath, comparisons, outputDir))
    .join('\n');

  const vpCount = report.viewports.length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BlockGuard Regression Report — ${report.runId}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f1f5f9; color: #1e293b; }

    /* ── Header ── */
    .header { background: #1e293b; color: white; padding: 24px 32px; }
    .header h1 { font-size: 1.5rem; font-weight: 700; }
    .header .meta { font-size: 0.875rem; color: #94a3b8; margin-top: 4px; }
    .status-badge {
      display: inline-block; padding: 4px 12px; border-radius: 9999px;
      font-weight: 600; font-size: 0.875rem; color: white;
      background: ${statusColor}; margin-left: 12px; vertical-align: middle;
    }

    /* ── Layout ── */
    .container { max-width: 1400px; margin: 0 auto; padding: 32px; }

    /* ── Summary cards ── */
    .grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px; margin-bottom: 32px;
    }
    .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .card .value { font-size: 2rem; font-weight: 700; }
    .card .label { font-size: 0.875rem; color: #64748b; margin-top: 4px; }

    /* ── Sections ── */
    .section {
      background: white; border-radius: 8px; padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,.1); margin-bottom: 24px;
    }
    .section h2 {
      font-size: 1.125rem; font-weight: 600; margin-bottom: 16px;
      padding-bottom: 12px; border-bottom: 1px solid #e2e8f0;
    }

    /* ── Impact table ── */
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; padding: 8px 12px; background: #f1f5f9; font-weight: 600; color: #475569; }
    td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tr:last-child td { border-bottom: none; }

    /* ── Tags / pills ── */
    .tag {
      display: inline-block; background: #e2e8f0; color: #475569;
      padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; margin: 1px;
    }
    .status-pill {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 9999px; font-size: 0.75rem;
      font-weight: 700; color: white; white-space: nowrap;
    }

    /* ── Page group card ── */
    .page-group {
      border: 1px solid #e2e8f0; border-radius: 10px;
      margin-bottom: 16px; overflow: hidden;
    }
    .page-group-header {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      padding: 14px 20px; cursor: pointer; user-select: none;
      background: #f8fafc; border-bottom: 1px solid #e2e8f0;
    }
    .page-group-header:hover { background: #f1f5f9; }
    .page-group-title { font-weight: 700; font-size: 1rem; flex: 1; min-width: 100px; }
    .page-group-title a { color: #1e40af; text-decoration: none; }
    .page-group-title a:hover { text-decoration: underline; }
    .page-group-meta { font-size: 0.8rem; color: #64748b; }
    .chevron { font-size: 0.75rem; color: #64748b; transition: transform .2s; }
    .page-group-body { padding: 20px; background: white; }
    .page-group.collapsed .page-group-body { display: none; }
    .page-group.collapsed .chevron { transform: rotate(-90deg); }

    /* ── Block chips ── */
    .block-chip {
      display: inline-flex; align-items: center; gap: 4px;
      background: #dbeafe; color: #1d4ed8; padding: 2px 8px;
      border-radius: 9999px; font-size: 0.72rem; font-weight: 700;
    }

    /* ── Block section ── */
    .block-section {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
      margin-bottom: 14px; overflow: hidden;
    }
    .block-section:last-child { margin-bottom: 0; }

    /* ── Diff summary bar (top of each block section) ── */
    .diff-summary-bar {
      display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
      padding: 10px 16px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0;
    }
    .diff-badge {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 0.78rem; font-weight: 700;
    }
    .diff-badge .vp-label {
      font-size: 0.7rem; font-weight: 600; color: #64748b;
      background: #e2e8f0; padding: 1px 6px; border-radius: 4px;
    }
    .pct.fail { color: #ef4444; }
    .pct.warn { color: #f59e0b; }
    .pct.pass { color: #22c55e; }
    .diff-summary-bar .spacer { flex: 1; }

    /* ── Screenshot grid — all viewports side by side ── */
    .block-screenshots { padding: 0 14px 14px; }

    /* Viewport header row */
    .vp-headers {
      display: grid; gap: 0;
      grid-template-columns: 80px ${Array(vpCount).fill('repeat(3, 1fr)').join(' 1px ')};
    }
    .vp-head-spacer { /* top-left empty */ }
    .vp-head-label {
      grid-column: span 3; text-align: center;
      font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .05em; color: #475569;
      padding: 10px 6px 4px; border-bottom: 2px solid #e2e8f0;
    }
    .vp-head-div { /* 1px spacer between viewport groups */ }

    /* Image row */
    .img-row {
      display: grid; gap: 0; align-items: center;
      grid-template-columns: 80px ${Array(vpCount).fill('repeat(3, 1fr)').join(' 1px ')};
    }
    .img-row .row-lbl {
      font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .04em; color: #94a3b8; padding: 2px;
      line-height: 1.3;
    }
    .img-row .vp-sep { background: #e2e8f0; width: 1px; margin: 4px 0; align-self: stretch; }

    /* Screenshot cell */
    .shot-cell { padding: 6px 5px; }
    .shot-cell img {
      width: 100%; border-radius: 5px; border: 1px solid #e2e8f0;
      object-fit: cover; max-height: 130px; display: block;
    }
    .shot-cell .no-shot {
      width: 100%; border-radius: 5px; border: 2px dashed #e2e8f0;
      height: 80px; display: flex; align-items: center; justify-content: center;
      color: #cbd5e1; font-size: 0.7rem; background: #f8fafc;
    }

    /* Column labels row (BEFORE / AFTER / DIFF) */
    .col-labels {
      display: grid; gap: 0; margin-top: 2px;
      grid-template-columns: 80px ${Array(vpCount).fill('repeat(3, 1fr)').join(' 1px ')};
    }
    .col-labels .cl-sep { /* spacer */ }
    .cl { text-align: center; font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding-bottom: 4px; }
    .cl.before { color: #2563eb; }
    .cl.after  { color: #16a34a; }
    .cl.diff   { color: #dc2626; }

    /* ── Issues ── */
    .issues-list { padding: 10px 14px 0; }
    .issue-item {
      font-size: 0.8rem; color: #b45309; background: #fef9c3;
      border-left: 3px solid #f59e0b; padding: 4px 8px; margin-bottom: 4px;
      border-radius: 0 4px 4px 0;
    }
    .issue-item.error { color: #b91c1c; background: #fee2e2; border-color: #ef4444; }

    /* ── Footer ── */
    .footer { text-align: center; padding: 24px; color: #94a3b8; font-size: 0.75rem; }
  </style>
</head>
<body>

  <div class="header">
    <h1>BlockGuard Regression Report
      <span class="status-badge">${STATUS_EMOJI[status] ?? ''} ${status.toUpperCase()}</span>
    </h1>
    <div class="meta">
      Run ID: ${report.runId} &nbsp;·&nbsp;
      Generated: ${new Date(report.generatedAt).toLocaleString()} &nbsp;·&nbsp;
      ${report.baseRef} → ${report.headRef}
    </div>
  </div>

  <div class="container">

    <!-- Summary cards -->
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
        <div class="value" style="color:#22c55e">${summary.passed}</div>
        <div class="label">Passed</div>
      </div>
      <div class="card">
        <div class="value" style="color:#f59e0b">${summary.warnings}</div>
        <div class="label">Warnings</div>
      </div>
      <div class="card">
        <div class="value" style="color:#ef4444">${summary.failed}</div>
        <div class="label">Failed</div>
      </div>
    </div>

    <!-- Impact Analysis -->
    <div class="section">
      <h2>Impact Analysis</h2>
      <table>
        <tr><th>Risk Level</th><td>${impact.risk}</td></tr>
        <tr>
          <th>Directly Changed Blocks</th>
          <td>${impact.directlyChangedBlocks.map((b) => `<span class="tag">${b.name}</span>`).join(' ') || '—'}</td>
        </tr>
        <tr>
          <th>Transitively Affected</th>
          <td>${impact.transitivelyChangedBlocks.map((b) => `<span class="tag">${b.name}</span>`).join(' ') || '—'}</td>
        </tr>
        <tr>
          <th>Shared Files Changed</th>
          <td>${impact.sharedFilesChanged.map((f) => `<span class="tag">${f}</span>`).join(' ') || '—'}</td>
        </tr>
        <tr><th>Mode</th><td>${report.mode}</td></tr>
        <tr>
          <th>Viewports</th>
          <td>${report.viewports.map((v) => `<span class="tag">${v}</span>`).join(' ')}</td>
        </tr>
        <tr><th>Skipped Pages</th><td>${report.skippedPages}</td></tr>
      </table>
    </div>

    <!-- Page Comparison Results -->
    <div class="section">
      <h2>Page Comparison Results (${grouped.size} pages · ${report.comparisons.length} viewport checks)</h2>
      ${pageGroupsHtml}
    </div>

  </div>

  <div class="footer">
    Generated by BlockGuard &nbsp;·&nbsp; ${new Date(report.generatedAt).toISOString()}
  </div>

  <script>
    document.querySelectorAll('.page-group-header').forEach(function(header) {
      header.addEventListener('click', function() {
        header.closest('.page-group').classList.toggle('collapsed');
      });
    });
  </script>
</body>
</html>`;
}

// ─── Page group (one collapsible card per unique pagePath) ────────────────────

function buildPageGroup(
  pagePath: string,
  comparisons: PageComparisonResult[],
  outputDir: string,
): string {
  const overallStatus = worstStatus(comparisons);
  const color = STATUS_COLOR[overallStatus] ?? '#94a3b8';
  const emoji = STATUS_EMOJI[overallStatus] ?? '';

  // Unique affected blocks across all viewports for this page
  const allBlocks = Array.from(
    new Set(comparisons.flatMap((c) => c.affectedBlocks ?? [])),
  );

  const blockChips = allBlocks
    .map((b) => `<span class="block-chip">🧩 ${escapeHtml(b)}</span>`)
    .join('');

  // Build one block section per unique block name
  const blockSectionsHtml = allBlocks.length > 0
    ? allBlocks.map((b) => buildBlockSection(b, comparisons, outputDir)).join('\n')
    : buildBlockSection('', comparisons, outputDir); // fallback: no block names

  const branchUrl = comparisons[0]?.branchUrl ?? '#';

  return `<div class="page-group collapsed">
  <div class="page-group-header">
    <span class="status-pill" style="background:${color}">${emoji} ${overallStatus}</span>
    <span class="page-group-title">
      <a href="${branchUrl}" target="_blank">${escapeHtml(pagePath)}</a>
    </span>
    ${blockChips}
    <span class="page-group-meta">${comparisons.length} viewport${comparisons.length !== 1 ? 's' : ''}</span>
    <span class="chevron">▼</span>
  </div>
  <div class="page-group-body">
    ${blockSectionsHtml}
  </div>
</div>`;
}

// ─── Block section ────────────────────────────────────────────────────────────
/**
 * One card per affected block.
 *
 * Header bar:  🧩 blockName  |  📱 Mobile 80.55%  |  🖥 Desktop 90.45%  |  ❌ failed
 *
 * Image grid:  row-label  | [Mobile: Before | After | Diff] | [Desktop: Before | After | Diff]
 * All images embedded as base64 — visible inline, no click needed.
 */
function buildBlockSection(
  blockName: string,
  comparisons: PageComparisonResult[],
  outputDir: string,
): string {
  const overallStatus = worstStatus(comparisons);
  const color = STATUS_COLOR[overallStatus] ?? '#94a3b8';
  const emoji = STATUS_EMOJI[overallStatus] ?? '';

  // ── Diff summary badges ──
  const diffBadges = comparisons
    .map((c) => {
      const pct = c.visual?.mismatchPercent ?? null;
      if (pct === null) return '';
      const cls = pct >= 3.0 ? 'fail' : pct >= 0.5 ? 'warn' : 'pass';
      const icon = VP_ICON[c.viewport] ?? '🖥';
      const label = c.viewport.charAt(0).toUpperCase() + c.viewport.slice(1);
      return `<span class="diff-badge">
        <span class="vp-label">${icon} ${label}</span>
        <span class="pct ${cls}">${pct.toFixed(2)}%</span>
      </span>`;
    })
    .join('');

  // ── Viewport header labels row ──
  const vpSep = `<div class="vp-head-div"></div>`;
  const vpHeadCells = comparisons
    .map((c, i) => {
      const icon = VP_ICON[c.viewport] ?? '🖥';
      const label = c.viewport.charAt(0).toUpperCase() + c.viewport.slice(1);
      return (i > 0 ? vpSep : '') + `<div class="vp-head-label">${icon} ${label}</div>`;
    })
    .join('');

  // ── Image row — prefer per-block screenshot, fall back to full-page ──
  const imgRowCells = comparisons
    .map((c, i) => {
      const blockShot = blockName ? c.blockScreenshots?.[blockName] : undefined;
      const rawBefore = blockShot?.before ?? c.beforeScreenshot;
      const rawAfter  = blockShot?.after  ?? c.afterScreenshot;
      const rawDiff   = blockShot?.diff   ?? c.diffScreenshot;
      const before = toDataUri(rawBefore) ?? toRelativeSrc(rawBefore, outputDir);
      const after  = toDataUri(rawAfter)  ?? toRelativeSrc(rawAfter,  outputDir);
      const diff   = toDataUri(rawDiff)   ?? toRelativeSrc(rawDiff,   outputDir);
      return (i > 0 ? `<div class="vp-sep"></div>` : '') +
        shotCell(before) +
        shotCell(after) +
        shotCell(diff);
    })
    .join('');

  // ── Column label row (BEFORE / AFTER / DIFF repeated per viewport) ──
  const colLabelCells = comparisons
    .map((_, i) =>
      (i > 0 ? `<div class="cl-sep"></div>` : '') +
      `<div class="cl before">Before</div>` +
      `<div class="cl after">After</div>` +
      `<div class="cl diff">Diff</div>`)
    .join('');

  // ── Issues ──
  const issues = comparisons.flatMap((c) => collectIssues(c));
  const issuesHtml = issues.length > 0
    ? `<div class="issues-list">${issues.map((i) => {
        const cls = i.startsWith('❌') ? 'issue-item error' : 'issue-item';
        return `<div class="${cls}">${escapeHtml(i)}</div>`;
      }).join('')}</div>`
    : '';

  const chip = blockName
    ? `<span class="block-chip">🧩 ${escapeHtml(blockName)}</span>`
    : '';

  return `<div class="block-section">
  <div class="diff-summary-bar">
    ${chip}
    ${diffBadges}
    <span class="spacer"></span>
    <span class="status-pill" style="background:${color}">${emoji} ${overallStatus}</span>
  </div>
  ${issuesHtml}
  <div class="block-screenshots">
    <div class="vp-headers">
      <div class="vp-head-spacer"></div>
      ${vpHeadCells}
    </div>
    <div class="img-row">
      <div class="row-lbl">Before&nbsp;(Live)</div>
      ${imgRowCells}
    </div>
    <div class="col-labels">
      <div></div>
      ${colLabelCells}
    </div>
  </div>
</div>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert an absolute screenshot path to a relative path from outputDir.
 * Used as fallback when base64 embedding fails (e.g. file already moved).
 */
function toRelativeSrc(filePath: string | undefined, outputDir: string): string | null {
  if (!filePath) return null;
  try {
    const rel = isAbsolute(filePath) ? relative(outputDir, filePath) : filePath;
    return rel.replace(/\\/g, '/');
  } catch {
    return null;
  }
}

function shotCell(src: string | null): string {
  if (!src) {
    return `<div class="shot-cell"><div class="no-shot">No screenshot</div></div>`;
  }
  return `<div class="shot-cell"><img src="${src}" alt="screenshot" loading="lazy" /></div>`;
}

function collectIssues(c: PageComparisonResult): string[] {
  const issues: string[] = [];
  if (c.dom) {
    for (const d of c.dom) {
      if (d.missingInBranch) issues.push(`⚠️ Missing block: ${d.blockName}`);
      if (d.hasHorizontalOverflow) issues.push(`⚠️ Horizontal overflow: ${d.blockName}`);
      if (d.headingChanges.before.length > 0)
        issues.push(`⚠️ Heading changed: ${d.blockName}`);
    }
  }
  if (c.a11y && c.a11y.newCriticalCount > 0)
    issues.push(`❌ ${c.a11y.newCriticalCount} new critical accessibility issue(s)`);
  if (c.runtime && c.runtime.newConsoleErrors.length > 0)
    issues.push(`❌ ${c.runtime.newConsoleErrors.length} new console error(s)`);
  if (c.error) issues.push(`❌ ${c.error}`);
  return issues;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Markdown summary ─────────────────────────────────────────────────────────

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

// ─── Save all reports to disk ─────────────────────────────────────────────────

export function saveReports(report: RegressionReport, outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(
    join(outputDir, 'report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  generateHtmlReport(report, outputDir);

  const markdown = generateMarkdownSummary(report);
  writeFileSync(join(outputDir, 'summary.md'), markdown, 'utf8');
}
