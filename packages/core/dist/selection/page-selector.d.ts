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
export declare function selectRegressionPages(pages: IndexedPage[], affectedBlockNames: string[], config: SelectionConfig): SelectionResult;
//# sourceMappingURL=page-selector.d.ts.map