# BlockGuard 🛡️

**EDS Block Regression Validator** — a GitHub-native regression and impact-analysis solution for Adobe Edge Delivery Services (EDS) projects.

BlockGuard detects changed blocks in a pull request, finds every page using those blocks, compares the PR preview against the live baseline at mobile and desktop viewports, and reports regressions before UAT.

---

## Architecture

```
blockguard/
├── packages/
│   ├── core/          @blockguard/core — deterministic engine
│   ├── action/        blockguard-action — GitHub Action wrapper
│   └── cli/           @blockguard/cli — local CLI
├── examples/
│   ├── blockguard.config.yml   — annotated config template
│   └── consumer-workflow.yml   — copy to your EDS repo
└── .github/workflows/ci.yml    — BlockGuard's own CI
```

---

## Quick Start

### Option 1 — GitHub Action (recommended)

This is the primary and recommended way to use BlockGuard. No local setup required.

**Step 1:** Copy `examples/consumer-workflow.yml` to your EDS repository:

```
your-eds-repo/
└── .github/workflows/blockguard.yml
```

**Step 2:** Copy `examples/blockguard.config.yml` to your EDS repository root:

```
your-eds-repo/
└── blockguard.config.yml
```

**Step 3:** Update the owner and repo values in the workflow:

```yaml
- uses: your-org/blockguard-action@v1
  with:
    owner: your-org
    repo: your-eds-site
    page-index-url: https://main--your-eds-site--your-org.aem.live/query-index.json
    github-token: ${{ secrets.GITHUB_TOKEN }}
    mode: representative
    fail-on-regression: 'false'   # advisory mode during rollout
```

That is it. The Action runs automatically on every PR that touches `blocks/**`, `scripts/**`, or `styles/**`.

The Action will:
1. Detect which blocks changed in the PR
2. Discover affected pages via `query-index.json`
3. Wait for the EDS branch preview to become available
4. Screenshot live and preview at mobile (390 px) and desktop (1440 px)
5. Run pixel diff, DOM diff, accessibility, and runtime checks
6. Post a consolidated PR comment and job summary
7. Upload `blockguard-report/` as a workflow artifact (before/after/diff images + HTML report)

---

### Option 2 — CLI (local developer testing)

Install globally and run against any branch:

```bash
npm install -g @blockguard/cli

# Detect which blocks changed
blockguard analyze --base main --head feature/cards

# Find pages using a block
blockguard usage cards --variation featured

# Run regression test locally
blockguard test cards --base main --head feature/cards

# View the report
blockguard report --format md
```

---

## Configuration

Copy `examples/blockguard.config.yml` to your EDS project root and adjust:

```yaml
version: 1

site:
  owner: your-org
  repo: your-eds-site
  baseBranch: main

discovery:
  pageIndex: /query-index.json   # or sitemap: /sitemap.xml

selection:
  mode: representative           # representative | full
  maximumPages: 20

thresholds:
  visualWarning: 0.5             # % pixel mismatch
  visualFailure: 3.0
  failOnNewCriticalAccessibilityIssue: true
  failOnMissingBlock: true
```

---

## What BlockGuard Checks

| Check | Tool | Default |
|-------|------|---------|
| Visual pixel diff | pixelmatch | warn ≥ 0.5 %, fail ≥ 3 % |
| Missing block in branch | DOM diff | fail |
| Horizontal overflow | DOM diff | fail |
| Heading structure change | DOM diff | warn |
| New console JS errors | Runtime | fail ≥ 1 |
| Failed network requests | Runtime | warn |
| New critical a11y violations | axe-core | fail |
| New serious a11y violations | axe-core | warn |

---

## PR Report Example

```
BlockGuard Regression Report

Changed blocks:   cards
Impact:           62 pages · 4 variations · 3 locales
Tested:           12 representative pages · 2 viewports · 24 comparisons

Results:          20 passed · 3 warnings · 1 failed

Failure:
  Cards Featured variation overflows at 390 px width.
```

Artifacts uploaded per run:

```
blockguard-report/
├── index.html
├── report.json
├── summary.md
└── comparisons/
    ├── page-a/
    │   ├── before.png
    │   ├── after.png
    │   └── diff.png
    └── page-b/
```

---

## Development

### Prerequisites

- Node.js 20+
- npm 10+

### Setup

```bash
git clone https://github.com/your-org/blockguard.git
cd blockguard
npm install
npm run build
npm run test
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build all packages |
| `npm run test` | Run unit tests (33 tests) |
| `npm run lint` | Lint all packages |
| `npm run clean` | Remove all dist/ outputs |

### Project Structure

```
packages/core/src/
├── config/         Schema validation and config loader
├── discovery/      Query-index and sitemap page discovery
├── indexing/       Block detection and usage index
├── impact/         Git diff and dependency graph analysis
├── selection/      Representative page selection algorithm
├── capture/        Puppeteer screenshot and stabilization
├── compare/        Visual, DOM, a11y, and runtime comparison
└── reporting/      JSON, HTML, and Markdown report generation
```

---

## Rollout Strategy

Start in **advisory mode** (the default):

1. One repository, one frequently-used block
2. `fail-on-regression: 'false'` — posts warnings but never blocks the PR
3. Review reports and tune thresholds over 2–4 sprints
4. Enable `fail-on-regression: 'true'` once false-positive rate is acceptable

Then expand to:
- Multiple blocks and variations
- Accessibility gating
- Full regression on release branches
- Required status checks

---

## Security

- Uses `pull_request` (not `pull_request_target`) — untrusted PR code never gets write access
- `GITHUB_TOKEN` is scoped to `contents: read`, `pull-requests: write`, `checks: write` only
- No production credentials are exposed to PR runners
- Screenshots are retained for 14 days (configurable)
- Candidate pages are treated as untrusted content

---

## License

MIT
