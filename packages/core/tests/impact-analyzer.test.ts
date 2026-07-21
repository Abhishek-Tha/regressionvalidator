import { describe, it, expect } from 'vitest';
import {
  groupChangedFilesByBlock,
  getSharedChangedFiles,
  isSiteWideChange,
} from '../src/impact/git-diff.js';

describe('groupChangedFilesByBlock', () => {
  it('groups block files by block name', () => {
    const files = [
      'blocks/cards/cards.js',
      'blocks/cards/cards.css',
      'blocks/hero/hero.js',
    ];
    const result = groupChangedFilesByBlock(files);
    expect(result.get('cards')).toEqual([
      'blocks/cards/cards.js',
      'blocks/cards/cards.css',
    ]);
    expect(result.get('hero')).toEqual(['blocks/hero/hero.js']);
  });

  it('ignores files not under blocks/', () => {
    const files = ['scripts/aem.js', 'styles/styles.css'];
    const result = groupChangedFilesByBlock(files);
    expect(result.size).toBe(0);
  });

  it('handles deeply nested block files', () => {
    const files = ['blocks/product-grid/utils/helper.js'];
    const result = groupChangedFilesByBlock(files);
    expect(result.has('product-grid')).toBe(true);
  });
});

describe('getSharedChangedFiles', () => {
  it('returns only non-block files', () => {
    const files = [
      'blocks/cards/cards.js',
      'scripts/aem.js',
      'styles/styles.css',
    ];
    const shared = getSharedChangedFiles(files);
    expect(shared).toHaveLength(2);
    expect(shared).toContain('scripts/aem.js');
    expect(shared).toContain('styles/styles.css');
  });
});

describe('isSiteWideChange', () => {
  it('marks styles/ files as site-wide', () => {
    expect(isSiteWideChange('styles/styles.css')).toBe(true);
    expect(isSiteWideChange('styles/lazy-styles.css')).toBe(true);
  });

  it('marks scripts/aem.js as site-wide', () => {
    expect(isSiteWideChange('scripts/aem.js')).toBe(true);
  });

  it('marks head.html as site-wide', () => {
    expect(isSiteWideChange('head.html')).toBe(true);
  });

  it('does not mark block files as site-wide', () => {
    expect(isSiteWideChange('blocks/cards/cards.js')).toBe(false);
  });

  it('does not mark unrelated files as site-wide', () => {
    expect(isSiteWideChange('README.md')).toBe(false);
    expect(isSiteWideChange('package.json')).toBe(false);
  });
});
