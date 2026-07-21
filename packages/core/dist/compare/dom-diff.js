/**
 * Capture a full DOM snapshot of all blocks on a page.
 */
export async function captureDomSnapshot(page, url, viewport, blockDetection) {
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });
    page.on('requestfailed', (req) => {
        failedRequests.push(req.url());
    });
    const blocks = await page.evaluate((blockSel, ignoredClasses) => {
        const blockEls = document.querySelectorAll(blockSel);
        const result = [];
        for (const blockEl of Array.from(blockEls)) {
            const classes = Array.from(blockEl.classList).filter((c) => !ignoredClasses.includes(c));
            if (classes.length === 0)
                continue;
            const blockName = classes[0];
            const variations = classes.slice(1);
            const signature = `${blockName}:${variations.join('-') || 'default'}`;
            // Collect child elements
            const elements = [];
            for (const el of Array.from(blockEl.querySelectorAll('*')).slice(0, 100)) {
                const htmlEl = el;
                elements.push({
                    tag: el.tagName.toLowerCase(),
                    text: htmlEl.innerText?.slice(0, 100),
                    href: el.href || undefined,
                    src: el.src || undefined,
                    alt: el.alt || undefined,
                    role: el.getAttribute('role') || undefined,
                    ariaLabel: el.getAttribute('aria-label') || undefined,
                    classList: Array.from(el.classList),
                });
            }
            // Headings
            const headings = Array.from(blockEl.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => `${h.tagName.toLowerCase()}:${h.innerText?.trim().slice(0, 80)}`);
            // Links
            const links = Array.from(blockEl.querySelectorAll('a[href]')).map((a) => a.href);
            // Images
            const images = Array.from(blockEl.querySelectorAll('img')).map((img) => ({
                src: img.src,
                alt: img.alt || '',
            }));
            // Horizontal overflow detection
            const rect = blockEl.getBoundingClientRect();
            const hasHorizontalOverflow = blockEl.scrollWidth > blockEl.clientWidth;
            result.push({
                blockName,
                variations,
                signature,
                elements,
                headings,
                links,
                images,
                hasHorizontalOverflow,
                boundingBox: rect ? { width: rect.width, height: rect.height } : null,
            });
        }
        return result;
    }, blockDetection.selector, blockDetection.ignoredClasses);
    return {
        url,
        viewport,
        capturedAt: new Date().toISOString(),
        blocks: blocks,
        consoleErrors,
        failedRequests,
    };
}
/**
 * Diff two DOM snapshots and return structured change information.
 */
export function diffDomSnapshots(baseline, branch) {
    const results = [];
    for (const baseBlock of baseline.blocks) {
        const branchBlock = branch.blocks.find((b) => b.blockName === baseBlock.blockName);
        if (!branchBlock) {
            results.push({
                blockName: baseBlock.blockName,
                variations: baseBlock.variations,
                removedElements: baseBlock.elements,
                addedElements: [],
                headingChanges: { before: baseBlock.headings, after: [] },
                linkChanges: { added: [], removed: baseBlock.links },
                imageChanges: { added: [], removed: baseBlock.images },
                missingInBranch: true,
                hasHorizontalOverflow: false,
                overflowChanged: false,
            });
            continue;
        }
        // Heading changes
        const baseHeadingSet = new Set(baseBlock.headings);
        const branchHeadingSet = new Set(branchBlock.headings);
        const headingChanges = {
            before: baseBlock.headings.filter((h) => !branchHeadingSet.has(h)),
            after: branchBlock.headings.filter((h) => !baseHeadingSet.has(h)),
        };
        // Link drift
        const baseLinks = new Set(baseBlock.links);
        const branchLinks = new Set(branchBlock.links);
        const linkChanges = {
            added: branchBlock.links.filter((l) => !baseLinks.has(l)),
            removed: baseBlock.links.filter((l) => !branchLinks.has(l)),
        };
        // Image changes
        const baseSrcs = new Set(baseBlock.images.map((i) => i.src));
        const branchSrcs = new Set(branchBlock.images.map((i) => i.src));
        const imageChanges = {
            added: branchBlock.images.filter((i) => !baseSrcs.has(i.src)),
            removed: baseBlock.images.filter((i) => !branchSrcs.has(i.src)),
        };
        const overflowChanged = baseBlock.hasHorizontalOverflow !== branchBlock.hasHorizontalOverflow;
        results.push({
            blockName: baseBlock.blockName,
            variations: baseBlock.variations,
            removedElements: [],
            addedElements: [],
            headingChanges,
            linkChanges,
            imageChanges,
            missingInBranch: false,
            hasHorizontalOverflow: branchBlock.hasHorizontalOverflow,
            overflowChanged,
        });
    }
    return results;
}
//# sourceMappingURL=dom-diff.js.map