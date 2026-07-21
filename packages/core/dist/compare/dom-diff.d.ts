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
    images: Array<{
        src: string;
        alt: string;
    }>;
    hasHorizontalOverflow: boolean;
    boundingBox: {
        width: number;
        height: number;
    } | null;
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
    headingChanges: {
        before: string[];
        after: string[];
    };
    /** Link drift */
    linkChanges: {
        added: string[];
        removed: string[];
    };
    /** Image changes */
    imageChanges: {
        added: Array<{
            src: string;
            alt: string;
        }>;
        removed: Array<{
            src: string;
            alt: string;
        }>;
    };
    /** Block rendering issues */
    missingInBranch: boolean;
    hasHorizontalOverflow: boolean;
    overflowChanged: boolean;
}
/**
 * Capture a full DOM snapshot of all blocks on a page.
 */
export declare function captureDomSnapshot(page: Page, url: string, viewport: string, blockDetection: BlockDetectionConfig): Promise<PageDomSnapshot>;
/**
 * Diff two DOM snapshots and return structured change information.
 */
export declare function diffDomSnapshots(baseline: PageDomSnapshot, branch: PageDomSnapshot): DomDiffResult[];
//# sourceMappingURL=dom-diff.d.ts.map