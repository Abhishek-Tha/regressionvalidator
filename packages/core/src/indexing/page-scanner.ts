import { Browser } from 'puppeteer';
import { BlockDetectionConfig } from '../config/schema.js';
import { BlockUsage } from './types.js';
import { IndexedPage } from './types.js';

/**
 * Scan a single page with Puppeteer and extract block usage data.
 */
export async function scanPage(
  browser: Browser,
  url: string,
  path: string,
  site: string,
  locale: string,
  blockDetection: BlockDetectionConfig,
): Promise<IndexedPage> {
  const page = await browser.newPage();

  try {
    // domcontentloaded is sufficient for block detection — we only need the DOM,
    // not analytics/beacon requests that keep networkidle2 waiting 15-25s.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Wait for EDS block decoration to complete (blocks shed the "loading" class).
    // 12s cap is generous — decoration typically finishes in 1-3s.
    await page
      .waitForFunction(() => !document.querySelector('.block.loading'), { timeout: 12_000 })
      .catch(() => {/* non-fatal — proceed even if loading class persists */});

    const blocks = await page.evaluate(
      (selector: string, ignoredClasses: string[]) => {
        const blockElements = Array.from(document.querySelectorAll(selector));
        const blockMap = new Map<string, {
          name: string;
          variations: string[];
          instances: number;
          signatures: string[];
        }>();

        for (const blockEl of blockElements) {
          const classes = Array.from(blockEl.classList).filter(
            (c: string) => !ignoredClasses.includes(c),
          );
          if (classes.length === 0) continue;

          const blockName = classes[0] as string;
          const variations = classes.slice(1) as string[];
          const key = blockName as string;
          const textContent = (blockEl as HTMLElement).innerText?.slice(0, 200) ?? '';
          const hash = String(
            Array.from(textContent).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0) >>> 0,
          ).slice(0, 6);
          const sig = `${blockName}:${variations.join('-') || 'default'}:${hash}`;

          if (blockMap.has(key)) {
            const entry = blockMap.get(key)!;
            entry.instances++;
            for (const v of variations) {
              if (!entry.variations.includes(v)) entry.variations.push(v);
            }
            if (!entry.signatures.includes(sig)) entry.signatures.push(sig);
          } else {
            blockMap.set(key, {
              name: blockName,
              variations,
              instances: 1,
              signatures: [sig],
            });
          }
        }

        return Array.from(blockMap.values());
      },
      blockDetection.selector,
      blockDetection.ignoredClasses,
    );

    const wordCount = await page
      .evaluate(() => document.body?.innerText?.split(/\s+/).length ?? 0)
      .catch(() => 0);

    return {
      path,
      url,
      site,
      locale,
      lastScanned: new Date().toISOString(),
      blocks: blocks as BlockUsage[],
      wordCount,
    };
  } finally {
    await page.close();
  }
}
