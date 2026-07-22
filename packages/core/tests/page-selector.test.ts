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

  // ── Variation-scoped filtering: base-block pages must always be included ──

  it('includes pages that use the BASE block (no variations) when only a specific variation changed', () => {
    // Scenario: only "columns" CSS for the "stack-view" variation changed.
    // A page using the base "columns" block (no variation classes) must still be
    // selected — the base layout styles could be affected.
    const pages = [
      makePage('/', [{ name: 'columns', variations: [] }]),           // homepage: base columns
      makePage('/landing', [{ name: 'columns', variations: ['stack-view'] }]), // landing: specific variation
      makePage('/other', [{ name: 'hero', variations: [] }]),         // unrelated
    ];

    const affectedVariations = { columns: ['stack-view'] };
    const result = selectRegressionPages(pages, ['columns'], representativeConfig, affectedVariations);

    const selectedPaths = result.selected.map((s) => s.page.path);
    expect(selectedPaths).toContain('/');             // base block — must be included
    expect(selectedPaths).toContain('/landing');      // specific variation — must be included
    expect(selectedPaths).not.toContain('/other');    // unrelated block — must be excluded
    expect(result.totalAffected).toBe(2);
  });

  it('includes "columns" in affectedBlockNames for a base-block page when variation CSS changed', () => {
    // The block must appear in affectedBlockNames for the capture phase to
    // screenshot it and detect visual drift.
    const pages = [
      makePage('/', [{ name: 'columns', variations: [] }]),
    ];

    const affectedVariations = { columns: ['stack-view'] };
    const result = selectRegressionPages(pages, ['columns'], representativeConfig, affectedVariations);

    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].affectedBlockNames).toContain('columns');
  });

  it('does not include pages whose blocks do not match any affected block even when variations are empty', () => {
    const pages = [
      makePage('/page-a', [{ name: 'cards', variations: ['body-highlight'] }]),
      makePage('/page-b', [{ name: 'cards', variations: [] }]),          // base cards
      makePage('/page-c', [{ name: 'columns', variations: [] }]),        // different block — unrelated
    ];

    // Only "cards.body-highlight" variation changed
    const affectedVariations = { cards: ['body-highlight'] };
    const result = selectRegressionPages(pages, ['cards'], representativeConfig, affectedVariations);

    const selectedPaths = result.selected.map((s) => s.page.path);
    expect(selectedPaths).toContain('/page-a');  // uses the changed variation
    expect(selectedPaths).toContain('/page-b');  // base cards — always affected
    expect(selectedPaths).not.toContain('/page-c'); // unrelated block
  });
});
