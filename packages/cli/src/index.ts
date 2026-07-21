#!/usr/bin/env node
/**
 * BlockGuard CLI
 *
 * Commands:
 *   blockguard index   --config <path>
 *   blockguard usage   <block> [--variation <var>] [--locale <locale>]
 *   blockguard analyze --base <ref> --head <ref> [--project-root <path>]
 *   blockguard test    <block> --base <ref> --head <ref> [options]
 *   blockguard report  --run-id <id> --format html|json|md
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import {
  loadConfig,
  analyzeImpact,
  findBlockUsage,
  loadIndex,
  saveIndex,
  createEmptyIndex,
  getAllBlockNames,
  hashConfig,
  generateMarkdownSummary,
  resolveLiveOrigin,
  discoverFromQueryIndex,
  discoverFromSitemap,
} from '@blockguard/core';

const args = process.argv.slice(2);
const command = args[0];

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    }
  }
  return flags;
}

const flags = parseFlags(args.slice(1));

function getConfigPath(): string {
  return resolve(flags['config'] ?? 'blockguard.config.yml');
}

function log(msg: string): void {
  process.stdout.write(msg + '\n');
}

function error(msg: string): never {
  process.stderr.write(`\n❌ Error: ${msg}\n\n`);
  process.exit(1);
}

async function cmdIndex(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);
  const origin = resolveLiveOrigin(config);

  log(`\n🔍 BlockGuard — Indexing site: ${origin}`);
  log(`   Using config: ${configPath}\n`);

  let pages: { path: string; url: string }[] = [];

  if (config.discovery.pageIndex) {
    log('  → Fetching query-index...');
    const result = await discoverFromQueryIndex(origin, config.discovery);
    pages = result.pages;
    log(`     Found ${pages.length} pages\n`);
  } else if (config.discovery.sitemap) {
    log('  → Parsing sitemap...');
    const result = await discoverFromSitemap(origin, config.discovery);
    pages = result.pages;
    log(`     Found ${pages.length} pages\n`);
  } else {
    error('No discovery source configured (pageIndex or sitemap required)');
  }

  const configHash = hashConfig(config);
  const index = createEmptyIndex(
    `${config.site.owner}/${config.site.repo}`,
    'manual',
    configHash,
  );

  // Note: Full Puppeteer scanning requires a browser — emit instructions
  log(`⚠️  Full block scanning requires Puppeteer. Found ${pages.length} pages.`);
  log(`   For complete indexing, use the GitHub Action or MCP server.\n`);

  const outputDir = config.outputDir;
  const savedPath = saveIndex(index, outputDir);
  log(`✅ Skeleton index saved to: ${savedPath}\n`);
}

async function cmdUsage(): Promise<void> {
  const blockName = args[1];
  if (!blockName) error('Usage: blockguard usage <block-name> [--variation <var>] [--locale <locale>]');

  const configPath = getConfigPath();
  const config = loadConfig(configPath);
  const indexPath = join(config.outputDir, 'block-usage-index.json');

  if (!existsSync(indexPath)) {
    error(`No index found at ${indexPath}. Run "blockguard index" first.`);
  }

  const index = loadIndex(indexPath);
  const result = findBlockUsage(index, blockName, flags['variation'], flags['locale']);

  log(`\n📦 Block usage: "${blockName}"`);
  if (flags['variation']) log(`   Variation: "${flags['variation']}"`);
  log(`\n   Total pages: ${result.pages.length}`);
  log(`   Total instances: ${result.totalInstances}\n`);

  for (const page of result.pages) {
    const block = page.blocks.find((b) => b.name === blockName);
    const vars = block?.variations.join(', ') || 'default';
    log(`   • ${page.path}  [${vars}]  (${page.locale})`);
  }
  log('');
}

async function cmdAnalyze(): Promise<void> {
  const baseRef = flags['base'] ?? 'origin/main';
  const headRef = flags['head'] ?? 'HEAD';
  const projectRoot = resolve(flags['project-root'] ?? '.');

  log(`\n🔎 BlockGuard — Impact Analysis`);
  log(`   Project: ${projectRoot}`);
  log(`   ${baseRef} → ${headRef}\n`);

  const impact = await analyzeImpact({ baseRef, headRef, projectRoot });

  log(`Risk level: ${impact.risk.toUpperCase()}`);
  log(`\nDirectly changed blocks (${impact.directlyChangedBlocks.length}):`);
  for (const b of impact.directlyChangedBlocks) {
    log(`  • ${b.name}`);
    for (const f of b.changedFiles) log(`      - ${f}`);
  }

  if (impact.transitivelyChangedBlocks.length > 0) {
    log(`\nTransitively affected blocks (${impact.transitivelyChangedBlocks.length}):`);
    for (const b of impact.transitivelyChangedBlocks) {
      log(`  • ${b.name} (via ${b.changedFiles.join(', ')})`);
    }
  }

  if (impact.sharedFilesChanged.length > 0) {
    log(`\nShared files changed:`);
    for (const f of impact.sharedFilesChanged) log(`  • ${f}`);
  }

  log('');
}

async function cmdTest(): Promise<void> {
  const blockName = args[1];
  if (!blockName) error('Usage: blockguard test <block-name> --base <ref> --head <ref>');

  const baseRef = flags['base'] ?? 'origin/main';
  const headRef = flags['head'] ?? 'HEAD';

  log(`\n🧪 BlockGuard — Regression Test`);
  log(`   Block: ${blockName}`);
  log(`   ${baseRef} → ${headRef}`);
  log(`\n   Use the GitHub Action or MCP server for full regression testing.`);
  log(`   CLI test support requires a running Puppeteer instance.\n`);

  // In production, this would orchestrate the full pipeline:
  // analyzeImpact → selectRegressionPages → captureMultiViewport → compareVisuals → buildRegressionReport
  log('ℹ️  Full CLI test pipeline coming in a future release.');
  log('   For now, use: npx blockguard-action or the MCP run_block_regression tool.\n');
}

async function cmdReport(): Promise<void> {
  const format = flags['format'] ?? 'md';
  const configPath = getConfigPath();
  const config = loadConfig(configPath);
  const reportPath = join(config.outputDir, 'report.json');

  if (!existsSync(reportPath)) {
    error(`No report found at ${reportPath}. Run a regression test first.`);
  }

  const reportJson = readFileSync(reportPath, 'utf8');
  const report = JSON.parse(reportJson);

  if (format === 'md' || format === 'markdown') {
    const md = generateMarkdownSummary(report);
    log(md);
  } else if (format === 'json') {
    log(JSON.stringify(report, null, 2));
  } else if (format === 'html') {
    log(`HTML report: ${join(config.outputDir, 'index.html')}`);
  } else {
    error(`Unknown format: ${format}. Use html, json, or md.`);
  }
}

async function cmdBlocks(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);
  const indexPath = join(config.outputDir, 'block-usage-index.json');

  if (!existsSync(indexPath)) {
    error(`No index found at ${indexPath}. Run "blockguard index" first.`);
  }

  const index = loadIndex(indexPath);
  const blocks = getAllBlockNames(index);

  log(`\n📋 All blocks in index (${blocks.length}):\n`);
  for (const b of blocks) log(`  • ${b}`);
  log('');
}

function printHelp(): void {
  log(`
BlockGuard — EDS Block Regression Validator

Usage: blockguard <command> [options]

Commands:
  index                     Discover pages and build block-usage index
  usage <block>             Find pages using a specific block
  analyze                   Analyse git diff and determine impact
  test <block>              Run regression test for a block (requires Action/MCP)
  report                    Display the latest regression report
  blocks                    List all indexed blocks

Global Options:
  --config <path>           Path to blockguard.config.yml (default: ./blockguard.config.yml)

Command Options:
  index:
    --config <path>         Config file path

  usage:
    --variation <var>       Filter by block variation
    --locale <locale>       Filter by locale (e.g. en-us)

  analyze:
    --base <ref>            Base git ref (default: origin/main)
    --head <ref>            Head git ref (default: HEAD)
    --project-root <path>   EDS project root (default: cwd)

  report:
    --format html|json|md   Output format (default: md)

Examples:
  blockguard index --config blockguard.config.yml
  blockguard usage cards --variation featured
  blockguard analyze --base main --head feature/cards
  blockguard report --format md
`);
}

// Main dispatch
(async () => {
  try {
    switch (command) {
      case 'index':
        await cmdIndex();
        break;
      case 'usage':
        await cmdUsage();
        break;
      case 'analyze':
        await cmdAnalyze();
        break;
      case 'test':
        await cmdTest();
        break;
      case 'report':
        await cmdReport();
        break;
      case 'blocks':
        await cmdBlocks();
        break;
      case '--help':
      case '-h':
      case 'help':
      case undefined:
        printHelp();
        break;
      default:
        error(`Unknown command: ${command}. Run "blockguard --help" for usage.`);
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
})();
