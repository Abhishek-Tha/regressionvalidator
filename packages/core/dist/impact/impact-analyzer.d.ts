import { ImpactAnalysis } from './types.js';
export interface AnalyzeOptions {
    baseRef: string;
    headRef: string;
    projectRoot: string;
}
/**
 * Full impact analysis: git diff → block grouping → dependency graph → risk classification.
 */
export declare function analyzeImpact(options: AnalyzeOptions): Promise<ImpactAnalysis>;
//# sourceMappingURL=impact-analyzer.d.ts.map