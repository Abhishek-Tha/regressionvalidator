import { PageRecord, DiscoveryResult } from './types.js';
import { DiscoveryConfig } from '../config/schema.js';

interface SitemapUrl {
  loc: string;
  lastmod?: string;
}

/**
 * Fetch and parse an XML sitemap, returning all page paths that pass include/exclude filters.
 */
export async function discoverFromSitemap(
  origin: string,
  config: DiscoveryConfig,
): Promise<DiscoveryResult> {
  const sitemapPath = config.sitemap ?? '/sitemap.xml';
  const sitemapUrl = `${origin}${sitemapPath}`;

  const response = await fetch(sitemapUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch sitemap at ${sitemapUrl}: ${response.status} ${response.statusText}`,
    );
  }

  const xml = await response.text();
  const urls = parseSitemapXml(xml);

  const pages: PageRecord[] = [];

  for (const entry of urls) {
    let urlPath: string;
    try {
      urlPath = new URL(entry.loc).pathname;
    } catch {
      urlPath = entry.loc;
    }

    if (isExcluded(urlPath, config)) continue;
    if (!isIncluded(urlPath, config)) continue;

    pages.push({
      path: urlPath,
      url: entry.loc,
      lastModified: entry.lastmod,
    });
  }

  return {
    source: 'sitemap',
    pages,
    discoveredAt: new Date().toISOString(),
  };
}

function parseSitemapXml(xml: string): SitemapUrl[] {
  const urls: SitemapUrl[] = [];

  // Simple regex-based XML parsing to avoid a heavy dependency
  const urlBlocks = xml.match(/<url>([\s\S]*?)<\/url>/g) ?? [];

  for (const block of urlBlocks) {
    const locMatch = block.match(/<loc>(.*?)<\/loc>/);
    const lastmodMatch = block.match(/<lastmod>(.*?)<\/lastmod>/);

    if (locMatch) {
      urls.push({
        loc: locMatch[1].trim(),
        lastmod: lastmodMatch ? lastmodMatch[1].trim() : undefined,
      });
    }
  }

  return urls;
}

function matchesGlob(path: string, pattern: string): boolean {
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
