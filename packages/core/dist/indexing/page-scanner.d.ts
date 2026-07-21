import { Browser } from 'puppeteer';
import { BlockDetectionConfig } from '../config/schema.js';
import { IndexedPage } from './types.js';
/**
 * Scan a single page with Puppeteer and extract block usage data.
 */
export declare function scanPage(browser: Browser, url: string, path: string, site: string, locale: string, blockDetection: BlockDetectionConfig): Promise<IndexedPage>;
//# sourceMappingURL=page-scanner.d.ts.map