# BlockGuard 🛡️

**EDS Block Regression Validator** — a GitHub-native regression and impact-analysis solution for Adobe Edge Delivery Services (EDS) projects.

BlockGuard detects changed blocks in a pull request, scans every published live page to find which ones actually use those blocks, screenshots live vs. preview at mobile and desktop viewports, and reports regressions before UAT.

---

## Architecture

```
blockguard/
├── packages/
│   ├── core/          @blockguard/core — deterministic engine
│   ├── action/        blockguard-action — GitHub Action (composite)
│   ├── cli/           @blockguard/cli — local CLI
│   └── mcp/           @blockguard/mcp — MCP server for AI assistant integration
├── examples/
│   ├── blockguard.config.yml   — annotated config template
│   └── consumer-workflow.yml   — copy this to your EDS repo
└── .github/workflows/ci.yml    — BlockGuard's own CI
```

---

## Quick Start

### Option 1 — GitHub Action (recommended)

No local setup. Chrome is installed automatically by the action — you do **not** need any `npx puppeteer browsers install` steps in your workflow.

**Step 1:** Copy `examples/consumer-workflow.yml` from this repo into your EDS repository, renaming it to `blockguard.yml`:

```
# Source (this repo):
examples/consumer-workflow.yml

# Destination (your EDS repo):
your-eds-repo/
└── .github/workflows/blockguard.yml
```

**Step 2 (optional):** Copy `examples/blockguard.config.yml` to your EDS repository root for advanced configuration:

```
your-eds-repo/
└── blockguard.config.yml
```

**Step 3:** Update the four values marked with `←` in the workflow:

```yaml
      - name: Run BlockGuard regression
        id: blockguard
        uses: your-org/blockguard/packages/action@v1  # ← replace with your action repo and tag
        with:
          owner: your-org                     # ← GitHub username / org
          repo: your-eds-site                 # ← EDS repo name (no URL)
          base-branch: main
          page-index-url: https://main--your-eds-site--your-org.aem.live/query-index.json  # ← live query-index URL
          github-token: ${{ secrets.GITHUB_TOKEN }}
          mode: representative
          max-pages: '15'
          fail-on-regression: 'false'         # advisory mode during rollout
          advisory-mode: 'true'
```

That is it. The action triggers automatically on every PR that touches `blocks/**`, `scripts/**`, `styles/**`, `icons/**`, or `blockguard.config.yml`.

---

### What BlockGuard does on each PR

1. **Impact analysis** — git diff to identify changed block folders under `blocks/`
2. **Wait for EDS preview** — polls `${previewOrigin}/` until it responds (up to 2 min)
3. **Discover published pages** — fetches `query-index.json` from the live origin; HEAD-checks each path to confirm it is published (404s are silently dropped)
4. **Scan for real block usage** — Puppeteer loads each published live page and reads the actual DOM block classes; pages that do **not** use any of the changed blocks are excluded
5. **Select representative pages** — picks a smart subset (up to `max-pages`) covering all block variations
6. **Screenshot & compare** — captures before (live) and after (preview) at mobile (390 px) and desktop (1440 px); skips preview pages that return 404
7. **Pixel diff + DOM diff** — pixelmatch + heading/overflow analysis
8. **Post report** — PR comment, job summary, and `blockguard-report/` artifact (before/after/diff images + HTML report)

---

### Option 2 — CLI (local developer testing)

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

### Option 3 — MCP Server (AI Assistant / Copilot integration)

The `packages/mcp` package exposes BlockGuard as a local [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server. This lets you drive regression testing conversationally through any MCP-compatible AI assistant (ACS Copilot, Cline, Claude Dev, etc.) without leaving your editor.

#### Build the MCP server

```bash
git clone https://github.com/Abhishek-Tha/regressionvalidator.git
cd regressionvalidator
npm install
npm run build
# Output: packages/mcp/dist/server.js
```

#### Register the server with your AI assistant

Open your MCP settings file for your IDE:

| IDE / Extension | Settings file |
|-----------------|---------------|
| ACS Copilot (VS Code) | `~/Library/Application Support/Code/User/globalStorage/acs-copilot-agent.acs-copilot-agent/settings/acs_copilot_mcp_settings.json` |
| Cline / Claude Dev (VS Code) | `~/.cline/mcp_settings.json` |
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |

Add the `block-regression-validator` entry to `mcpServers`:

```json
{
  "mcpServers": {
    "block-regression-validator": {
      "command": "node",
      "args": ["/absolute/path/to/regressionvalidator/packages/mcp/dist/server.js"],
      "env": {
        "LIVE_ORIGIN": "https://main--your-repo--your-org.aem.live",
        "PREVIEW_ORIGIN": "https://branch--your-repo--your-org.aem.page",
        "PROJECT_ROOT": "/absolute/path/to/your/eds-repo",
        "GITHUB_TOKEN": "ghp_yourTokenHere",
        "BLOCKGUARD_OWNER": "your-org",
        "BLOCKGUARD_REPO": "your-eds-repo"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

> **All `env` values are optional defaults.** You can omit them entirely and pass the values inline in your prompts instead (see [Mode B](#mode-b--no-env-vars-pass-per-prompt) below). The `args` path must be absolute.

#### Mode A — Pre-configured (recommended)

Set the env vars once in MCP settings. Your prompts stay short:

> *"Run a full regression test for the cards block"*  
> *"Which pages use the hero block?"*  
> *"Get the BlockGuard report for PR #42"*

#### Mode B — No env vars (pass per prompt)

Skip all `env` keys in MCP settings:

```json
{
  "mcpServers": {
    "block-regression-validator": {
      "command": "node",
      "args": ["/absolute/path/to/regressionvalidator/packages/mcp/dist/server.js"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Then include the details in your prompt:

> *"Run a full regression test for the cards block on https://main--mysite--myorg.aem.live vs https://feature--mysite--myorg.aem.page in /Users/me/eds-repo"*

---

#### MCP Tools & Example Prompts

All 8 tools are available once the server is registered. Tools that accept `liveOrigin`, `previewOrigin`, `projectRoot`, `githubToken`, `owner`, and `repo` fall back to the corresponding env vars if not passed explicitly.

---

##### `index_site_blocks`
Discover all pages on an EDS site and build a block-usage index. Run this first before querying block usage.

| Argument | Required | Description |
|----------|----------|-------------|
| `baseUrl` | ✅ | Live site origin URL |
| `pageSource` | | `query-index` (default) or `sitemap` |
| `outputDir` | | Where to save the index (default: `/tmp/blockguard`) |
| `refresh` | | Force re-index even if cached |

**Example prompts:**
```
Index all blocks on https://main--mysite--myorg.aem.live
Build a block usage index for my site using the sitemap
Refresh the block index for https://main--mysite--myorg.aem.live
```

---

##### `find_block_usage`
Find all pages that use a specific EDS block, optionally filtered by variation or locale.

| Argument | Required | Description |
|----------|----------|-------------|
| `block` | ✅ | Block name (e.g. `cards`, `hero`) |
| `variation` | | Filter by variation (e.g. `featured`) |
| `locale` | | Filter by locale (e.g. `en-us`) |
| `indexPath` | | Path to an existing `block-usage-index.json` |

**Example prompts:**
```
Which pages use the hero block?
Find all pages using the cards block with the featured variation
Show me pages that use the columns block in the en-us locale
```

---

##### `analyze_code_change`
Analyse a git diff to determine which EDS blocks changed and whether the impact is block-scoped or site-wide.

| Argument | Required | Description |
|----------|----------|-------------|
| `baseRef` | | Git base ref (default: `origin/main`) |
| `headRef` | | Git head ref (default: `HEAD`) |
| `projectRoot` | | Absolute path to the EDS project repo (falls back to `PROJECT_ROOT` env var) |

**Example prompts:**
```
Analyze what blocks changed in my current branch vs main
What is the risk level of my current changes?
Which blocks have been modified between origin/main and HEAD?
```

---

##### `select_regression_pages`
Given a list of changed block names, select the most representative pages for regression testing.

| Argument | Required | Description |
|----------|----------|-------------|
| `changedBlocks` | ✅ | Array of block names |
| `mode` | | `representative` (default) or `full` |
| `maxPages` | | Max pages to select (default: 20) |
| `indexPath` | | Path to existing index |

**Example prompts:**
```
Select the best pages to test for the cards and columns blocks
Which pages should I regression test for the hero block? Use full mode
Pick up to 5 representative pages for testing the navigation block
```

---

##### `run_block_regression`
Run a full regression test for a block: screenshot live + preview, pixel diff, DOM diff, accessibility, and runtime checks. This is the primary end-to-end tool.

| Argument | Required | Description |
|----------|----------|-------------|
| `block` | ✅ | Block name to test |
| `liveOrigin` | ✅* | Live site origin URL (\*falls back to `LIVE_ORIGIN` env var) |
| `previewOrigin` | ✅* | Branch preview origin URL (\*falls back to `PREVIEW_ORIGIN` env var) |
| `projectRoot` | | EDS repo path (falls back to `PROJECT_ROOT` env var) |
| `baseRef` | | Git base ref (default: `origin/main`) |
| `headRef` | | Git head ref (default: `HEAD`) |
| `mode` | | `representative` or `full` |
| `viewports` | | Array of viewport names: `["mobile", "desktop"]` |
| `outputDir` | | Output directory for screenshots and report |

**Example prompts:**
```
Run a full regression test for the cards block
Test the hero block at mobile viewport only
Run regression on the columns block in full mode and save the report to /tmp/my-report
```

---

##### `get_regression_report`
Retrieve a previously generated local regression report by path.

| Argument | Required | Description |
|----------|----------|-------------|
| `reportPath` | | Path to `report.json` or report directory (default: `/tmp/blockguard-mcp`) |
| `format` | | `summary` (default), `markdown`, or `full` |

**Example prompts:**
```
Show me the last regression report
Get the regression report as markdown
Show the full JSON for the report at /tmp/my-report
```

---

##### `get_pr_regression_report`
Fetch the BlockGuard regression report for a GitHub Pull Request. Finds the BlockGuard check run, downloads the report artifact, and returns the results.

| Argument | Required | Description |
|----------|----------|-------------|
| `pr` | ✅ | Pull Request number |
| `owner` | | GitHub org/user (falls back to `BLOCKGUARD_OWNER` env var) |
| `repo` | | Repository name (falls back to `BLOCKGUARD_REPO` env var) |
| `format` | | `markdown` (default), `summary`, or `full` |
| `githubToken` | | GitHub PAT (falls back to `GITHUB_TOKEN` env var) |

**Example prompts:**
```
Get the BlockGuard report for PR #42
Show me the regression results for PR #15 as a summary
What failed in the BlockGuard run for PR #7?
```

---

##### `trigger_pr_regression`
Trigger or re-trigger a BlockGuard regression run for a GitHub Pull Request. Re-runs the latest failed/cancelled run, or dispatches the workflow if no previous run exists.

| Argument | Required | Description |
|----------|----------|-------------|
| `pr` | ✅ | Pull Request number |
| `owner` | | GitHub org/user (falls back to `BLOCKGUARD_OWNER` env var) |
| `repo` | | Repository name (falls back to `BLOCKGUARD_REPO` env var) |
| `githubToken` | | GitHub PAT (falls back to `GITHUB_TOKEN` env var) |

**Example prompts:**
```
Re-run the BlockGuard regression on PR #42
Trigger BlockGuard for PR #10
Restart the failed regression test on PR #5
```

---

## Consumer workflow — abregtest example

This is the workflow used in the [abregtest](https://github.com/abhishek-tha/abregtest) EDS repo (the reference test site for BlockGuard):

```yaml
# .github/workflows/blockguard.yml  (in your EDS repo)
name: EDS Block Regression (BlockGuard)

on:
  pull_request:
    paths:
      - "blocks/**"
      - "scripts/**"
      - "styles/**"
      - "icons/**"
      - "blockguard.config.yml"
  workflow_dispatch:
    inputs:
      mode:
        description: "Test mode"
        required: false
        default: "representative"
        type: choice
        options:
          - representative
          - full

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  blockguard:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run BlockGuard regression
        id: blockguard
        uses: your-org/blockguard/packages/action@v1  # ← replace with your action repo and tag
        with:
          owner: abhishek-tha
          repo: abregtest
          base-branch: main
          page-index-url: https://main--abregtest--abhishek-tha.aem.live/query-index.json
          github-token: ${{ secrets.GITHUB_TOKEN }}
          mode: representative
          max-pages: '15'
          fail-on-regression: 'false'
          advisory-mode: 'true'

      - name: Upload regression report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: blockguard-report
          path: /tmp/blockguard-report/
          retention-days: 14

      - name: Summary
        if: always()
        run: |
          echo "Status:          ${{ steps.blockguard.outputs.status }}"
          echo "Affected pages:  ${{ steps.blockguard.outputs.affected-pages }}"
          echo "Tested pages:    ${{ steps.blockguard.outputs.tested-pages }}"
```

> **Note:** No manual Chrome/Puppeteer installation steps are needed. The BlockGuard composite action installs the correct Chrome version automatically on every run.

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

If `blockguard.config.yml` is absent, BlockGuard falls back to sensible defaults derived from the workflow inputs.

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

## Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `owner` | ✅ | — | GitHub username or org |
| `repo` | ✅ | — | EDS repository name |
| `github-token` | ✅ | — | `${{ secrets.GITHUB_TOKEN }}` |
| `base-branch` | | `main` | Base branch for git diff |
| `page-index-url` | | — | Full URL to `query-index.json` |
| `site-map-url` | | — | Full URL to `sitemap.xml` (fallback) |
| `live-origin` | | auto | Override live origin URL |
| `preview-origin` | | auto | Override preview origin URL |
| `mode` | | `representative` | `representative` or `full` |
| `max-pages` | | `15` | Max pages to test per run |
| `fail-on-regression` | | `false` | Fail the workflow on regressions |
| `advisory-mode` | | `true` | Post warnings only, never fail |
| `output-dir` | | `/tmp/blockguard-report` | Report output directory |

## Action Outputs

| Output | Description |
|--------|-------------|
| `status` | `passed`, `warning`, or `failed` |
| `affected-pages` | Pages that use the changed blocks |
| `tested-pages` | Pages actually screenshotted and compared |
| `report-path` | Path to the generated HTML report |
| `run-id` | BlockGuard run identifier |

---

## PR Report Example

```
BlockGuard Regression Report

Changed blocks:   columns
Impact:           3 published pages scanned · 2 use 'columns'
Tested:           2 pages · 2 viewports · 4 comparisons

Results:          3 passed · 1 warning · 0 failed
```

Artifacts uploaded per run:

```
blockguard-report/
├── index.html
├── report.json
├── summary.md
└── comparisons/
    ├── _home/
    │   ├── desktop/
    │   │   ├── before-desktop.png
    │   │   ├── after-desktop.png
    │   │   └── diff-desktop.png
    │   └── mobile/
    └── _landing/
```

---

## Development

### Prerequisites

- Node.js 20+
- npm 10+

### Setup

```bash
git clone https://github.com/Abhishek-Tha/regressionvalidator.git
cd regressionvalidator
npm install
npm run build
npm run test
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build all packages (core → cli → action → mcp) |
| `npm run test` | Run unit tests |
| `npm run lint` | Lint all packages |
| `npm run clean` | Remove all dist/ outputs |

### Project Structure

```
packages/core/src/
├── config/         Schema validation and config loader
├── discovery/      Query-index and sitemap page discovery
├── indexing/       Block detection and page scanning
├── impact/         Git diff and dependency graph analysis
├── selection/      Representative page selection algorithm
├── capture/        Puppeteer screenshot, stabilization, pageExists
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
- Only published pages (verified via HEAD request against live origin) are tested

---

## License

MIT
