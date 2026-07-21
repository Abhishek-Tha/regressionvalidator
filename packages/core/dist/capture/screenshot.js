import puppeteer from 'puppeteer';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { stabilizePage } from './stabilizer.js';
/**
 * Take a full-page screenshot of a URL at the given viewport.
 */
export async function captureScreenshot(options) {
    const { browser, url, label, viewport, outputDir, captureConfig } = options;
    if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
    }
    const filename = `${label}-${viewport.name}.png`;
    const filePath = join(outputDir, filename);
    const page = await browser.newPage();
    try {
        await page.setViewport({
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: 1,
        });
        // Set timezone via Chrome DevTools Protocol
        const cdp = await page.createCDPSession();
        await cdp.send('Emulation.setTimezoneOverride', { timezoneId: captureConfig.timezone });
        await page.setExtraHTTPHeaders({
            'Accept-Language': captureConfig.locale,
        });
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 60_000,
        });
        await stabilizePage(page, captureConfig);
        await page.screenshot({
            path: filePath,
            fullPage: true,
        });
        return {
            url,
            viewport: viewport.name,
            filePath,
            capturedAt: new Date().toISOString(),
            success: true,
        };
    }
    catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
            url,
            viewport: viewport.name,
            filePath: '',
            capturedAt: new Date().toISOString(),
            success: false,
            error,
        };
    }
    finally {
        await page.close();
    }
}
/**
 * Launch a reusable Puppeteer browser with consistent settings.
 */
export async function launchBrowser() {
    return puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--font-render-hinting=none',
            '--force-color-profile=srgb',
        ],
    });
}
/**
 * Capture screenshots at multiple viewports for a single URL.
 */
export async function captureMultiViewport(browser, url, label, viewports, outputDir, captureConfig) {
    const results = [];
    for (const viewport of viewports) {
        const result = await captureScreenshot({
            browser,
            url,
            label,
            viewport,
            outputDir,
            captureConfig,
        });
        results.push(result);
    }
    return results;
}
/**
 * Poll a URL until it responds with a 200 or the timeout is reached.
 * Used to wait for EDS preview branches to become available.
 */
export async function waitForUrl(url, timeoutMs = 120_000, intervalMs = 5_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            if (response.ok)
                return true;
        }
        catch {
            // Not yet available
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
}
//# sourceMappingURL=screenshot.js.map