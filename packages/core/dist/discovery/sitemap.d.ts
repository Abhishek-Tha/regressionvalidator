import { DiscoveryResult } from './types.js';
import { DiscoveryConfig } from '../config/schema.js';
/**
 * Fetch and parse an XML sitemap, returning all page paths that pass include/exclude filters.
 */
export declare function discoverFromSitemap(origin: string, config: DiscoveryConfig): Promise<DiscoveryResult>;
//# sourceMappingURL=sitemap.d.ts.map