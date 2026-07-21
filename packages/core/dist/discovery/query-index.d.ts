import { DiscoveryResult } from './types.js';
import { DiscoveryConfig } from '../config/schema.js';
/**
 * Fetch all pages from an EDS query-index.json endpoint.
 * Handles pagination automatically (offset/limit).
 */
export declare function discoverFromQueryIndex(origin: string, config: DiscoveryConfig): Promise<DiscoveryResult>;
//# sourceMappingURL=query-index.d.ts.map