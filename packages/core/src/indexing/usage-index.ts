import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { UsageIndex, IndexedPage, BlockUsageSummary } from './types.js';

export function createEmptyIndex(site: string, baseCommit: string, configHash: string): UsageIndex {
  return {
    version: 1,
    site,
    baseCommit,
    configHash,
    builtAt: new Date().toISOString(),
    pages: [],
  };
}

/**
 * Save a usage index as JSON to the given directory.
 */
export function saveIndex(index: UsageIndex, outputDir: string): string {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  const filePath = join(outputDir, 'block-usage-index.json');
  writeFileSync(filePath, JSON.stringify(index, null, 2), 'utf8');
  return filePath;
}

/**
 * Load a usage index from a JSON file.
 */
export function loadIndex(filePath: string): UsageIndex {
  if (!existsSync(filePath)) {
    throw new Error(`Usage index not found at: ${filePath}`);
  }
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as UsageIndex;
}

/**
 * Generate a cache key for a given site + commit + config combination.
 */
export function buildCacheKey(site: string, commit: string, configHash: string): string {
  return `blockguard-index-${site}-${commit.slice(0, 8)}-${configHash.slice(0, 8)}`;
}

/**
 * Hash a config object for cache invalidation.
 */
export function hashConfig(config: object): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 16);
}

/**
 * Find all pages in the index that use a specific block (and optionally a variation).
 */
export function findBlockUsage(
  index: UsageIndex,
  blockName: string,
  variation?: string,
  locale?: string,
): BlockUsageSummary {
  const matchingPages: IndexedPage[] = [];
  let totalInstances = 0;

  for (const page of index.pages) {
    if (locale && page.locale !== locale) continue;

    const blockUsage = page.blocks.find((b) => b.name === blockName);
    if (!blockUsage) continue;

    if (variation && !blockUsage.variations.includes(variation)) continue;

    matchingPages.push(page);
    totalInstances += blockUsage.instances;
  }

  return {
    blockName,
    variation,
    pages: matchingPages,
    totalInstances,
  };
}

/**
 * Get all unique block names across the index.
 */
export function getAllBlockNames(index: UsageIndex): string[] {
  const names = new Set<string>();
  for (const page of index.pages) {
    for (const block of page.blocks) {
      names.add(block.name);
    }
  }
  return Array.from(names).sort();
}

/**
 * Get all unique variations for a block.
 */
export function getBlockVariations(index: UsageIndex, blockName: string): string[] {
  const variations = new Set<string>();
  for (const page of index.pages) {
    const block = page.blocks.find((b) => b.name === blockName);
    if (block) {
      for (const v of block.variations) {
        variations.add(v);
      }
    }
  }
  return Array.from(variations).sort();
}

/**
 * Merge a set of freshly scanned pages into an existing index.
 * Replaces existing entries by path.
 */
export function mergePages(index: UsageIndex, freshPages: IndexedPage[]): UsageIndex {
  const pageMap = new Map(index.pages.map((p) => [p.path, p]));
  for (const page of freshPages) {
    pageMap.set(page.path, page);
  }
  return {
    ...index,
    pages: Array.from(pageMap.values()),
    builtAt: new Date().toISOString(),
  };
}
