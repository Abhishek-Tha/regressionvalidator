import { UsageIndex, IndexedPage, BlockUsageSummary } from './types.js';
export declare function createEmptyIndex(site: string, baseCommit: string, configHash: string): UsageIndex;
/**
 * Save a usage index as JSON to the given directory.
 */
export declare function saveIndex(index: UsageIndex, outputDir: string): string;
/**
 * Load a usage index from a JSON file.
 */
export declare function loadIndex(filePath: string): UsageIndex;
/**
 * Generate a cache key for a given site + commit + config combination.
 */
export declare function buildCacheKey(site: string, commit: string, configHash: string): string;
/**
 * Hash a config object for cache invalidation.
 */
export declare function hashConfig(config: object): string;
/**
 * Find all pages in the index that use a specific block (and optionally a variation).
 */
export declare function findBlockUsage(index: UsageIndex, blockName: string, variation?: string, locale?: string): BlockUsageSummary;
/**
 * Get all unique block names across the index.
 */
export declare function getAllBlockNames(index: UsageIndex): string[];
/**
 * Get all unique variations for a block.
 */
export declare function getBlockVariations(index: UsageIndex, blockName: string): string[];
/**
 * Merge a set of freshly scanned pages into an existing index.
 * Replaces existing entries by path.
 */
export declare function mergePages(index: UsageIndex, freshPages: IndexedPage[]): UsageIndex;
//# sourceMappingURL=usage-index.d.ts.map