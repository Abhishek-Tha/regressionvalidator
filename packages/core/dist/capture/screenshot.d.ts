import { Browser } from 'puppeteer';
import { CaptureConfig, ViewportConfig } from '../config/schema.js';
export interface ScreenshotResult {
    url: string;
    viewport: string;
    filePath: string;
    capturedAt: string;
    success: boolean;
    error?: string;
}
export interface CapturePageOptions {
    browser: Browser;
    url: string;
    label: string;
    viewport: ViewportConfig;
    outputDir: string;
    captureConfig: CaptureConfig;
}
/**
 * Take a full-page screenshot of a URL at the given viewport.
 */
export declare function captureScreenshot(options: CapturePageOptions): Promise<ScreenshotResult>;
/**
 * Launch a reusable Puppeteer browser with consistent settings.
 */
export declare function launchBrowser(): Promise<Browser>;
/**
 * Capture screenshots at multiple viewports for a single URL.
 */
export declare function captureMultiViewport(browser: Browser, url: string, label: string, viewports: ViewportConfig[], outputDir: string, captureConfig: CaptureConfig): Promise<ScreenshotResult[]>;
/**
 * Poll a URL until it responds with a 200 or the timeout is reached.
 * Used to wait for EDS preview branches to become available.
 */
export declare function waitForUrl(url: string, timeoutMs?: number, intervalMs?: number): Promise<boolean>;
//# sourceMappingURL=screenshot.d.ts.map