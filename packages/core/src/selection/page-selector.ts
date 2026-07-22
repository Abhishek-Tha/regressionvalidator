import { IndexedPage } from '../indexing/types.js';
import { SelectionConfig } from '../config/schema.js';

export interface SelectedPage {
  page: IndexedPage;
  /** Why this page was selected */
  reasons: string[];
  /** Which block names on this page are affected */
  affectedBlockNames: string[];
  /**
   * For each affected block, which variation(s) on this page are affected.
   * Empty array means all variations are affected.
   */
  affectedVariations: Record<string, string[]>;
}

export interface SelectionResult {
  selected: SelectedPage[];
  skipped: number;
  totalAffected: number;
  mode: 'representative' | 'full';
}

/**
 * Select regression-test pages from the usage index based on the selection config.
 *
 * @param affectedVariations  Optional map of blockName → changed variation class names.
 *   When provided, a page is only included if it actually uses the specified variation.
 *   An empty array for a block means all variations of that block are affected.
 */
export function selectRegressionPages(
  pages: IndexedPage[],
  affectedBlockNames: string[],
  config: SelectionConfig,
  affectedVariations: Record<string, string[]> = {},
): SelectionResult {
  // Filter to only pages that use at least one affected block (and, if known, the specific variation)
  const affectedPages = pages.filter((page) =>
    page.blocks.some((b) => {
      if (!affectedBlockNames.includes(b.name)) return false;
      const changedVars = affectedVariations[b.name] ?? [];
      // If no specific variations are tracked, any page using this block qualifies
      if (changedVars.length === 0) return true;
      // Otherwise require the page to actually use one of the changed variations
      const pageVars = b.variations.map((v) => v.toLowerCase());
      return changedVars.some((cv) => pageVars.includes(cv.toLowerCase()));
    }),
  );

  if (config.mode === 'full') {
    return {
      selected: affectedPages.map((page) => ({
        page,
        reasons: ['full-mode'],
        affectedBlockNames: getAffectedBlocksOnPage(page, affectedBlockNames),
        affectedVariations: getAffectedVariationsOnPage(page, affectedBlockNames, affectedVariations),
      })),
      skipped: 0,
      totalAffected: affectedPages.length,
      mode: 'full',
    };
  }

  // Representative mode
  const selected = selectRepresentativePages(affectedPages, affectedBlockNames, config, affectedVariations);

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
  affectedVariations: Record<string, string[]> = {},
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

          selected.push({
            page,
            reasons,
            affectedBlockNames: affectedOnPage,
            affectedVariations: getAffectedVariationsOnPage(page, affectedBlockNames, affectedVariations),
          });
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
      affectedVariations: getAffectedVariationsOnPage(page, affectedBlockNames, affectedVariations),
    });
  }

  return selected;
}

function getAffectedBlocksOnPage(page: IndexedPage, affectedBlockNames: string[]): string[] {
  return page.blocks.filter((b) => affectedBlockNames.includes(b.name)).map((b) => b.name);
}

/**
 * For each affected block on a page, return which of the changed variations are present.
 */
function getAffectedVariationsOnPage(
  page: IndexedPage,
  affectedBlockNames: string[],
  affectedVariations: Record<string, string[]>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const block of page.blocks) {
    if (!affectedBlockNames.includes(block.name)) continue;
    const changedVars = affectedVariations[block.name] ?? [];
    if (changedVars.length === 0) {
      result[block.name] = [];
    } else {
      const pageVars = block.variations.map((v) => v.toLowerCase());
      result[block.name] = changedVars.filter((cv) => pageVars.includes(cv.toLowerCase()));
    }
  }
  return result;
}
