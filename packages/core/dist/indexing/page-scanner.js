/**
 * Scan a single page with Puppeteer and extract block usage data.
 */
export async function scanPage(browser, url, path, site, locale, blockDetection) {
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
        // Wait for EDS block decoration
        await page
            .waitForFunction(() => !document.querySelector('.block.loading'), { timeout: 15_000 })
            .catch(() => {
            // Non-fatal — proceed even if loading class persists
        });
        const blocks = await page.evaluate((selector, ignoredClasses) => {
            const blockElements = Array.from(document.querySelectorAll(selector));
            const blockMap = new Map();
            for (const blockEl of blockElements) {
                const classes = Array.from(blockEl.classList).filter((c) => !ignoredClasses.includes(c));
                if (classes.length === 0)
                    continue;
                const blockName = classes[0];
                const variations = classes.slice(1);
                const key = blockName;
                const textContent = blockEl.innerText?.slice(0, 200) ?? '';
                const hash = String(Array.from(textContent).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0) >>> 0).slice(0, 6);
                const sig = `${blockName}:${variations.join('-') || 'default'}:${hash}`;
                if (blockMap.has(key)) {
                    const entry = blockMap.get(key);
                    entry.instances++;
                    for (const v of variations) {
                        if (!entry.variations.includes(v))
                            entry.variations.push(v);
                    }
                    if (!entry.signatures.includes(sig))
                        entry.signatures.push(sig);
                }
                else {
                    blockMap.set(key, {
                        name: blockName,
                        variations,
                        instances: 1,
                        signatures: [sig],
                    });
                }
            }
            return Array.from(blockMap.values());
        }, blockDetection.selector, blockDetection.ignoredClasses);
        const wordCount = await page
            .evaluate(() => document.body?.innerText?.split(/\s+/).length ?? 0)
            .catch(() => 0);
        return {
            path,
            url,
            site,
            locale,
            lastScanned: new Date().toISOString(),
            blocks: blocks,
            wordCount,
        };
    }
    finally {
        await page.close();
    }
}
//# sourceMappingURL=page-scanner.js.map