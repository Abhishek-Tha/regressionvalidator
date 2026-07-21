export interface VisualDiffResult {
    baselinePath: string;
    branchPath: string;
    diffPath: string;
    totalPixels: number;
    diffPixels: number;
    mismatchPercent: number;
    width: number;
    height: number;
}
/**
 * Perform a pixel-level comparison between two PNG screenshots.
 * Writes a highlighted diff image and returns the mismatch percentage.
 */
export declare function compareVisuals(baselinePath: string, branchPath: string, diffOutputPath: string, threshold?: number): VisualDiffResult;
//# sourceMappingURL=visual.d.ts.map