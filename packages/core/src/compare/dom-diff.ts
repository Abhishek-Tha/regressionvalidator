import { Page } from 'puppeteer';
import { BlockDetectionConfig } from '../config/schema.js';

export interface DomElement {
  tag: string;
  text?: string;
  href?: string;
  src?: string;
  alt?: string;
  role?: string;
  ariaLabel?: string;
  classList: string[];
}

export interface BlockDomSnapshot {
  blockName: string;
  variations: string[];
  signature: string;
  elements: DomElement[];
  headings: string[];
  links: string[];
  images: Array<{ src: string; alt: string }>;
  hasHorizontalOverflow: boolean;
  boundingBox: { width: number; height: number } | null;
}

export interface PageDomSnapshot {
  url: string;
  viewport: string;
  capturedAt: string;
  blocks: BlockDomSnapshot[];
  consoleErrors: string[];
  failedRequests: string[];
}

export interface DomDiffResult {
  blockName: string;
  variations: string[];
  /** Elements present in baseline but missing in branch */
  removedElements: DomElement[];
  /** Elements present in branch but not in baseline */
  addedElements: DomElement[];
  /** Heading changes */
  headingChanges: { before: string[]; after: string[] };
  /** Link drift */
  linkChanges: { added: string[]; removed: string[] };
  /** Image changes */
  imageChanges: { added: Array<{ src: string; alt: string }>; removed: Array<{ src: string; alt: string }> };
  /** Block rendering issues */
  missingInBranch: boolean;
  hasHorizontalOverflow: boolean;
  overflowChanged: boolean;
}

/**
 * Capture a full DOM snapshot of all blocks on a page.
 */
export async function captureDomSnapshot(
  page: Page,
  url: string,
  viewport: string,
  blockDetection: BlockDetectionConfig,
): Promise<PageDomSnapshot> {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('requestfailed', (req) => {
    failedRequests.push(req.url());
  });

  const blocks = await page.evaluate(
    (blockSel: string, ignoredClasses: string[]) => {
      const blockEls = document.querySelectorAll(blockSel);
      const result: BlockDomSnapshot[] = [];

      for (const blockEl of Array.from(blockEls)) {
        const classes = Array.from(blockEl.classList).filter(
          (c) => !ignoredClasses.includes(c),
        );
        if (classes.length === 0) continue;

        const blockName = classes[0];
        const variations = classes.slice(1);
        const signature = `${blockName}:${variations.join('-') || 'default'}`;

        // Collect child elements
        const elements: DomElement[] = [];
        for (const el of Array.from(blockEl.querySelectorAll('*')).slice(0, 100)) {
          const htmlEl = el as HTMLElement;
          elements.push({
            tag: el.tagName.toLowerCase(),
            text: htmlEl.innerText?.slice(0, 100),
            href: (el as HTMLAnchorElement).href || undefined,
            src: (el as HTMLImageElement).src || undefined,
            alt: (el as HTMLImageElement).alt || undefined,
            role: el.getAttribute('role') || undefined,
            ariaLabel: el.getAttribute('aria-label') || undefined,
            classList: Array.from(el.classList),
          });
        }

        // Headings
        const headings = Array.from(blockEl.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(
          (h) => `${h.tagName.toLowerCase()}:${(h as HTMLElement).innerText?.trim().slice(0, 80)}`,
        );

        // Links
        const links = Array.from(blockEl.querySelectorAll('a[href]')).map(
          (a) => (a as HTMLAnchorElement).href,
        );

        // Images
        const images = Array.from(blockEl.querySelectorAll('img')).map((img) => ({
          src: img.src,
          alt: img.alt || '',
        }));

        // Horizontal overflow detection
        const rect = blockEl.getBoundingClientRect();
        const hasHorizontalOverflow =
          (blockEl as HTMLElement).scrollWidth > (blockEl as HTMLElement).clientWidth;

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
    },
    blockDetection.selector,
    blockDetection.ignoredClasses,
  );

  return {
    url,
    viewport,
    capturedAt: new Date().toISOString(),
    blocks: blocks as BlockDomSnapshot[],
    consoleErrors,
    failedRequests,
  };
}

/**
 * Diff two DOM snapshots and return structured change information.
 */
export function diffDomSnapshots(
  baseline: PageDomSnapshot,
  branch: PageDomSnapshot,
): DomDiffResult[] {
  const results: DomDiffResult[] = [];

  for (const baseBlock of baseline.blocks) {
    const branchBlock = branch.blocks.find(
      (b) => b.blockName === baseBlock.blockName,
    );

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

    const overflowChanged =
      baseBlock.hasHorizontalOverflow !== branchBlock.hasHorizontalOverflow;

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
