import { describe, it, expect } from 'vitest';
import { selectRegressionPages } from '../src/selection/page-selector.js';
import { IndexedPage } from '../src/indexing/types.js';
import { SelectionConfig } from '../src/config/schema.js';

function makePage(path: string, blocks: Array<{ name: string; variations: string[] }>, wordCount = 100): IndexedPage {
  return {
    path,
    url: `https://example.com${path}`,
    site: 'test',
    locale: 'en',
    lastScanned: new Date().toISOString(),
    blocks: blocks.map((b) => ({
      name: b.name,
      variations: b.variations,
      instances: 1,
      signatures: [`${b.name}:${b.variations.join('-') || 'default'}:1`],
    })),
    wordCount,
  };
}

const representativeConfig: SelectionConfig = {
  mode: 'representative',
  maximumPages: 10,
  includeEveryVariation: true,
  pagesPerVariation: 2,
  prioritize: ['multiple-instances', 'longest-content'],
};

describe('selectRegressionPages', () => {
  it('returns only pages that use affected blocks', () => {
    const pages = [
      makePage('/page-a', [{ name: 'cards', variations: ['featured'] }]),
      makePage('/page-b', [{ name: 'hero', variations: [] }]),
      makePage('/page-c', [{ name: 'footer', variations: [] }]),
    ];

    const result = selectRegressionPages(pages, ['cards'], representativeConfig);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].page.path).toBe('/page-a');
  });

  it('returns all pages in full mode', () => {
    const pages = [
      makePage('/page-a', [{ name: 'cards', variations: ['featured'] }]),
      makePage('/page-b', [{ name: 'cards', variations: ['compact'] }]),
      makePage('/page-c', [{ name: 'cards', variations: [] }]),
    ];

    const fullConfig: SelectionConfig = { ...representativeConfig, mode: 'full' };
    const result = selectRegressionPages(pages, ['cards'], fullConfig);
    expect(result.selected).toHaveLength(3);
    expect(result.mode).toBe('full');
  });

  it('respects maximumPages limit', () => {
    const pages = Array.from({ length: 50 }, (_, i) =>
      makePage(`/page-${i}`, [{ name: 'cards', variations: ['default'] }]),
    );

    const limitedConfig: SelectionConfig = { ...representativeConfig, maximumPages: 5 };
    const result = selectRegressionPages(pages, ['cards'], limitedConfig);
    expect(result.selected.length).toBeLessThanOrEqual(5);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it('reports totalAffected correctly', () => {
    const pages = [
      makePage('/a', [{ name: 'hero', variations: [] }]),
      makePage('/b', [{ name: 'hero', variations: [] }]),
      makePage('/c', [{ name: 'cards', variations: [] }]),
    ];

    const result = selectRegressionPages(pages, ['hero'], representativeConfig);
    expect(result.totalAffected).toBe(2);
  });

  it('returns empty when no pages use the affected blocks', () => {
    const pages = [
      makePage('/a', [{ name: 'footer', variations: [] }]),
    ];

    const result = selectRegressionPages(pages, ['cards'], representativeConfig);
    expect(result.selected).toHaveLength(0);
    expect(result.totalAffected).toBe(0);
  });

  it('includes affected block names in selection reasons', () => {
    const pages = [
      makePage('/a', [
        { name: 'cards', variations: ['featured'] },
        { name: 'hero', variations: [] },
      ]),
    ];

    const result = selectRegressionPages(pages, ['cards', 'hero'], representativeConfig);
    expect(result.selected[0].affectedBlockNames).toContain('cards');
    expect(result.selected[0].affectedBlockNames).toContain('hero');
  });
});
