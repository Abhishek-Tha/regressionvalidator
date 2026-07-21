import { describe, it, expect } from 'vitest';
import { detectBlocks, buildBlockSignatures } from '../src/indexing/block-detector.js';
import { BlockDetectionConfig } from '../src/config/schema.js';

const defaultConfig: BlockDetectionConfig = {
  selector: '.block',
  nameStrategy: 'class',
  ignoredClasses: ['block', 'initialized', 'loading'],
  variationStrategy: 'remaining-classes',
};

describe('detectBlocks', () => {
  it('detects a single block with no variations', () => {
    const html = `<div class="hero block initialized"><h1>Hello</h1></div>`;
    const blocks = detectBlocks(html, defaultConfig);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe('hero');
    expect(blocks[0].variations).toHaveLength(0);
    expect(blocks[0].instances).toBe(1);
  });

  it('detects a block with variations', () => {
    const html = `<div class="cards featured three-column block initialized"></div>`;
    const blocks = detectBlocks(html, defaultConfig);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe('cards');
    expect(blocks[0].variations).toContain('featured');
    expect(blocks[0].variations).toContain('three-column');
  });

  it('merges multiple instances of the same block', () => {
    const html = `
      <div class="cards featured block initialized"></div>
      <div class="cards compact block initialized"></div>
    `;
    const blocks = detectBlocks(html, defaultConfig);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe('cards');
    expect(blocks[0].instances).toBe(2);
    expect(blocks[0].variations).toContain('featured');
    expect(blocks[0].variations).toContain('compact');
  });

  it('detects multiple different blocks', () => {
    const html = `
      <div class="hero block"></div>
      <div class="cards featured block"></div>
      <div class="carousel block"></div>
    `;
    const blocks = detectBlocks(html, defaultConfig);
    expect(blocks).toHaveLength(3);
    const names = blocks.map((b) => b.name);
    expect(names).toContain('hero');
    expect(names).toContain('cards');
    expect(names).toContain('carousel');
  });

  it('ignores divs with only ignored classes', () => {
    const html = `<div class="block initialized loading"></div>`;
    const blocks = detectBlocks(html, defaultConfig);
    expect(blocks).toHaveLength(0);
  });

  it('returns empty array for html with no blocks', () => {
    const html = `<main><p>Just text</p></main>`;
    const blocks = detectBlocks(html, defaultConfig);
    expect(blocks).toHaveLength(0);
  });
});

describe('buildBlockSignatures', () => {
  it('builds a signature with variation and content hash', () => {
    const sig = buildBlockSignatures('cards', ['featured'], 'Click here to learn more');
    expect(sig.blockName).toBe('cards');
    expect(sig.variations).toContain('featured');
    expect(sig.signature).toMatch(/^cards:featured:[a-f0-9]{1,6}$/);
    expect(sig.contentHash).toBeTruthy();
  });

  it('uses "default" for blocks with no variations', () => {
    const sig = buildBlockSignatures('hero', [], 'Welcome to our site');
    expect(sig.signature).toMatch(/^hero:default:[a-f0-9]{1,6}$/);
  });

  it('produces different hashes for different content', () => {
    const sig1 = buildBlockSignatures('cards', [], 'Welcome to our running shoes page with featured products');
    const sig2 = buildBlockSignatures('cards', [], 'Explore our hiking gear collection and outdoor accessories');
    expect(sig1.contentHash).not.toBe(sig2.contentHash);
  });
});
