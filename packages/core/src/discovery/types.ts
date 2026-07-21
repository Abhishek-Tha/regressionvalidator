export interface PageRecord {
  path: string;
  url: string;
  title?: string;
  lastModified?: string;
}

export interface QueryIndexEntry {
  path: string;
  title?: string;
  description?: string;
  lastModified?: string;
  [key: string]: string | undefined;
}

export interface QueryIndexResponse {
  total: number;
  offset: number;
  limit: number;
  data: QueryIndexEntry[];
}

export type DiscoverySource = 'query-index' | 'sitemap' | 'path-list' | 'crawl';

export interface DiscoveryResult {
  source: DiscoverySource;
  pages: PageRecord[];
  discoveredAt: string;
}
