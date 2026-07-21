import { IndexedPage } from '../indexing/types.js';
import { SelectionConfig } from '../config/schema.js';

export interface SelectedPage {
  page: IndexedPage;
  /** Why this page was selected */
  reasons: string[];
  /** Which block names on this page are affected */
  affectedBlockNames: string[];
}

export interface SelectionResult {
  selected: SelectedPage[];
  skipped: number;
  totalAffected: number;
  mode: 'representative' | 'full';
}

/**
 * Select regression-test pages from the usage index based on the selection config.
 */
export function selectRegressionPages(
  pages: IndexedPage[],
  affectedBlockNames: string[],
  config: SelectionConfig,
): SelectionResult {
  // Filter to only pages that use at least one affected block
  const affectedPages = pages.filter((page) =>
    page.blocks.some((b) => affectedBlockNames.includes(b.name)),
  );

  if (config.mode === 'full') {
    return {
      selected: affectedPages.map((page) => ({
        page,
        reasons: ['full-mode'],
        affectedBlockNames: getAffectedBlocksOnPage(page, affectedBlockNames),
      })),
      skipped: 0,
      totalAffected: affectedPages.length,
      mode: 'full',
    };
  }

  // Representative mode
  const selected = selectRepresentativePages(affectedPages, affectedBlockNames, config);

  return {
    selected,
    skipped: affectedPages.length - selected.length,
    totalAffected: affectedPages.length,
    mode: 'representative',
  };
}

function selectRepresentativePages(
  affectedPages: IndexedPage[],
  affectedBlockNames: string[],
  config: SelectionConfig,
): SelectedPage[] {
  const selected: SelectedPage[] = [];
  const selectedPaths = new Set<string>();

  // Track which variations we've already covered
  const coveredVariations = new Map<string, number>(); // "blockName:variation" → count

  /**
   * Score a page for prioritisation (higher = more important to test).
   */
  function scorePage(page: IndexedPage): number {
    let score = 0;
    const prefs = config.prioritize;

    if (prefs.includes('traffic') && page.trafficRank !== undefined) {
      // Lower rank = higher traffic = higher score
      score += Math.max(0, 1000 - page.trafficRank) * 10;
    }

    if (prefs.includes('multiple-instances')) {
      const instances = page.blocks
        .filter((b) => affectedBlockNames.includes(b.name))
        .reduce((sum, b) => sum + b.instances, 0);
      score += instances * 50;
    }

    if (prefs.includes('longest-content') && page.wordCount !== undefined) {
      score += page.wordCount;
    }

    return score;
  }

  // Sort by score descending
  const sortedPages = [...affectedPages].sort((a, b) => scorePage(b) - scorePage(a));

  // Phase 1: Ensure every affected variation is covered (up to pagesPerVariation)
  if (config.includeEveryVariation) {
    for (const page of sortedPages) {
      if (selectedPaths.size >= config.maximumPages) break;

      const affectedOnPage = getAffectedBlocksOnPage(page, affectedBlockNames);
      const newVariations: string[] = [];

      for (const blockName of affectedOnPage) {
        const block = page.blocks.find((b) => b.name === blockName);
        if (!block) continue;

        const variations = block.variations.length > 0 ? block.variations : ['default'];
        for (const variation of variations) {
          const key = `${blockName}:${variation}`;
          const count = coveredVariations.get(key) ?? 0;
          if (count < config.pagesPerVariation) {
            newVariations.push(key);
          }
        }
      }

      if (newVariations.length === 0 && selectedPaths.has(page.path)) continue;

      if (newVariations.length > 0 || !selectedPaths.has(page.path)) {
        if (!selectedPaths.has(page.path)) {
          selectedPaths.add(page.path);
          const reasons = newVariations.length > 0
            ? newVariations.map((v) => `covers-variation:${v}`)
            : ['high-priority'];

          // Apply locale filter if configured
          if (config.includeLocales && !config.includeLocales.includes(page.locale)) {
            continue;
          }

          selected.push({ page, reasons, affectedBlockNames: affectedOnPage });
          for (const key of newVariations) {
            coveredVariations.set(key, (coveredVariations.get(key) ?? 0) + 1);
          }
        }
      }
    }
  }

  // Phase 2: Fill remaining slots with high-priority pages not yet included
  for (const page of sortedPages) {
    if (selectedPaths.size >= config.maximumPages) break;
    if (selectedPaths.has(page.path)) continue;

    if (config.includeLocales && !config.includeLocales.includes(page.locale)) continue;

    selectedPaths.add(page.path);
    selected.push({
      page,
      reasons: ['high-priority'],
      affectedBlockNames: getAffectedBlocksOnPage(page, affectedBlockNames),
    });
  }

  return selected;
}

function getAffectedBlocksOnPage(page: IndexedPage, affectedBlockNames: string[]): string[] {
  return page.blocks.filter((b) => affectedBlockNames.includes(b.name)).map((b) => b.name);
}
