import { BlockDetectionConfig } from '../config/schema.js';
import { BlockUsage, BlockSignature } from './types.js';
/**
 * Detect EDS blocks from a decorated HTML string.
 * Works with the standard EDS block structure:
 *   <div class="block-name variation1 variation2 initialized">
 */
export declare function detectBlocks(html: string, config: BlockDetectionConfig): BlockUsage[];
/**
 * Build rich block signatures with content hashing for DOM-based matching.
 */
export declare function buildBlockSignatures(blockName: string, variations: string[], textContent: string): BlockSignature;
//# sourceMappingURL=block-detector.d.ts.map