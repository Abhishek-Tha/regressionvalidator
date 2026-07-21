import puppeteer, { Browser } from 'puppeteer';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { CaptureConfig, ViewportConfig } from '../config/schema.js';
import { stabilizePage } from './stabilizer.js';

export interface BlockClipResult extends ScreenshotResult {
  blockFound: boolean;
  clipBox?: { x: number; y: number; width: number; height: number };
}

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
export async function captureScreenshot(options: CapturePageOptions): Promise<ScreenshotResult> {
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

    // Full-page screenshot (scroll-capture) for accurate below-the-fold comparison.
    await page.screenshot({
      path: filePath as `${string}.png`,
      fullPage: true,
    });

    return {
      url,
      viewport: viewport.name,
      filePath,
      capturedAt: new Date().toISOString(),
      success: true,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      url,
      viewport: viewport.name,
      filePath: '',
      capturedAt: new Date().toISOString(),
      success: false,
      error,
    };
  } finally {
    await page.close();
  }
}

/**
 * Launch a reusable Puppeteer browser with consistent settings.
 */
export async function launchBrowser(): Promise<Browser> {
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
export async function captureMultiViewport(
  browser: Browser,
  url: string,
  label: string,
  viewports: ViewportConfig[],
  outputDir: string,
  captureConfig: CaptureConfig,
): Promise<ScreenshotResult[]> {
  const results: ScreenshotResult[] = [];

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
 * Navigate to a URL, find the first element matching `blockSelector`,
 * and screenshot only the clipped bounding box of that element.
 * Falls back to a full-page screenshot if the block is not found.
 */
export async function captureBlockClip(options: CapturePageOptions & {
  blockSelector: string;
}): Promise<BlockClipResult> {
  const { browser, url, label, viewport, outputDir, captureConfig, blockSelector } = options;

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const filename = `${label}-${viewport.name}.png`;
  const filePath = join(outputDir, filename);
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: captureConfig.timezone });
    await page.setExtraHTTPHeaders({ 'Accept-Language': captureConfig.locale });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });
    await stabilizePage(page, captureConfig);

    // Try to find the block and get its bounding box
    const box = await page.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const rect = el.getBoundingClientRect();
      const scrollY = window.scrollY || window.pageYOffset;
      return {
        x: Math.max(0, rect.left - 24),
        y: Math.max(0, rect.top + scrollY - 24),
        width: rect.width + 48,
        height: rect.height + 48,
      };
    }, blockSelector);

    if (box && box.width > 0 && box.height > 0) {
      await page.screenshot({
        path: filePath as `${string}.png`,
        clip: {
          x: box.x,
          y: box.y,
          width: Math.min(box.width, viewport.width),
          height: box.height,
        },
      });
      return {
        url, viewport: viewport.name, filePath,
        capturedAt: new Date().toISOString(),
        success: true, blockFound: true, clipBox: box,
      };
    }

    // Block not found — fall back to full-page screenshot
    await page.screenshot({ path: filePath as `${string}.png`, fullPage: true });
    return {
      url, viewport: viewport.name, filePath,
      capturedAt: new Date().toISOString(),
      success: true, blockFound: false,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      url, viewport: viewport.name, filePath: '',
      capturedAt: new Date().toISOString(),
      success: false, blockFound: false, error,
    };
  } finally {
    await page.close();
  }
}

/**
 * Poll a URL until it responds with a 200 or the timeout is reached.
 * Used to wait for EDS preview branches to become available.
 */
export async function waitForUrl(
  url: string,
  timeoutMs: number = 120_000,
  intervalMs: number = 5_000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) return true;
    } catch {
      // Not yet available
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Check whether a URL is reachable and returns a 2xx response.
 * Used to skip pages that are not published on preview/live.
 */
export async function pageExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}
