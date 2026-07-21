import { BlockDetectionConfig } from '../config/schema.js';
import { BlockUsage, BlockSignature } from './types.js';

/**
 * Detect EDS blocks from a decorated HTML string.
 * Works with the standard EDS block structure:
 *   <div class="block-name variation1 variation2 initialized">
 */
export function detectBlocks(html: string, config: BlockDetectionConfig): BlockUsage[] {
  // Parse block elements using regex (no DOM available in Node context)
  const blockPattern = new RegExp(
    `<div[^>]+class=["']([^"']*?)["'][^>]*>`,
    'gi',
  );

  const blockMap = new Map<string, BlockUsage>();
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(html)) !== null) {
    const classString = match[1];
    const classes = classString.split(/\s+/).filter(Boolean);

    const blockInfo = extractBlockInfo(classes, config);
    if (!blockInfo) continue;

    const { name, variations } = blockInfo;
    const key = name;

    if (blockMap.has(key)) {
      const existing = blockMap.get(key)!;
      existing.instances++;
      // Merge any new variations
      for (const v of variations) {
        if (!existing.variations.includes(v)) {
          existing.variations.push(v);
        }
      }
      // Generate a new signature for this instance
      const sig = buildSignature(name, variations, existing.instances);
      existing.signatures.push(sig);
    } else {
      const sig = buildSignature(name, variations, 1);
      blockMap.set(key, {
        name,
        variations,
        instances: 1,
        signatures: [sig],
      });
    }
  }

  return Array.from(blockMap.values());
}

/**
 * Extract block name and variations from an array of CSS classes.
 */
function extractBlockInfo(
  classes: string[],
  config: BlockDetectionConfig,
): { name: string; variations: string[] } | null {
  if (classes.length === 0) return null;

  // With class-based strategy, the first non-ignored class is the block name
  if (config.nameStrategy === 'class') {
    // Filter out ignored utility classes
    const meaningful = classes.filter((c) => !config.ignoredClasses.includes(c));
    if (meaningful.length === 0) return null;

    const name = meaningful[0];

    // Variations are all remaining classes after the block name
    const variations =
      config.variationStrategy === 'remaining-classes'
        ? meaningful.slice(1)
        : [];

    return { name, variations };
  }

  return null;
}

/**
 * Build a deterministic signature for a block instance.
 * Format: "blockName:variation1-variation2:instanceIndex"
 */
function buildSignature(name: string, variations: string[], instance: number): string {
  const varPart = variations.length > 0 ? variations.join('-') : 'default';
  return `${name}:${varPart}:${instance}`;
}

/**
 * Build rich block signatures with content hashing for DOM-based matching.
 */
export function buildBlockSignatures(
  blockName: string,
  variations: string[],
  textContent: string,
): BlockSignature {
  const contentHash = simpleHash(textContent.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200));
  const varPart = variations.length > 0 ? variations.join('-') : 'default';
  return {
    signature: `${blockName}:${varPart}:${contentHash}`,
    blockName,
    variations,
    contentHash,
  };
}

/**
 * Simple non-cryptographic hash for content fingerprinting.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit int
  }
  return Math.abs(hash).toString(16).slice(0, 6);
}
