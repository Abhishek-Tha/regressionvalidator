import { PageRecord, QueryIndexResponse, DiscoveryResult } from './types.js';
import { DiscoveryConfig } from '../config/schema.js';

/**
 * Fetch all pages from an EDS query-index.json endpoint.
 * Handles pagination automatically (offset/limit).
 */
export async function discoverFromQueryIndex(
  origin: string,
  config: DiscoveryConfig,
): Promise<DiscoveryResult> {
  const indexPath = config.pageIndex ?? '/query-index.json';
  const baseUrl = `${origin}${indexPath}`;
  const pages: PageRecord[] = [];

  let offset = 0;
  const limit = 256;
  let total = Infinity;

  while (offset < total) {
    const url = `${baseUrl}?offset=${offset}&limit=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch query index at ${url}: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as QueryIndexResponse;
    total = data.total;

    for (const entry of data.data) {
      if (isExcluded(entry.path, config)) continue;
      if (!isIncluded(entry.path, config)) continue;

      pages.push({
        path: entry.path,
        url: `${origin}${entry.path}`,
        title: entry.title,
        lastModified: entry.lastModified,
      });
    }

    offset += data.data.length;
    if (data.data.length === 0) break; // safety guard
  }

  return {
    source: 'query-index',
    pages,
    discoveredAt: new Date().toISOString(),
  };
}

function matchesGlob(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§DOUBLESTAR§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§DOUBLESTAR§§/g, '.*');
  return new RegExp(`^${escaped}$`).test(path);
}

function isExcluded(path: string, config: DiscoveryConfig): boolean {
  return config.exclude.some((pattern) => matchesGlob(path, pattern));
}

function isIncluded(path: string, config: DiscoveryConfig): boolean {
  if (config.include.length === 0) return true;
  return config.include.some((pattern) => matchesGlob(path, pattern));
}
