import { Page } from 'puppeteer';
import { CaptureConfig } from '../config/schema.js';
/**
 * Apply all stabilization steps to a Puppeteer page before taking a screenshot.
 * This ensures consistent, deterministic captures regardless of dynamic content.
 */
export declare function stabilizePage(page: Page, config: CaptureConfig): Promise<void>;
//# sourceMappingURL=stabilizer.d.ts.map