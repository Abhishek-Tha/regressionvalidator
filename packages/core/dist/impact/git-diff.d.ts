export interface GitDiffResult {
    changedFiles: string[];
    baseRef: string;
    headRef: string;
}
/**
 * Run git diff between two refs and return the list of changed file paths.
 */
export declare function getChangedFiles(baseRef: string, headRef: string, projectRoot: string): GitDiffResult;
/**
 * Get the current HEAD commit SHA.
 */
export declare function getCurrentCommitSha(projectRoot: string): string;
/**
 * Check if a git ref exists in the repository.
 */
export declare function refExists(ref: string, projectRoot: string): boolean;
/**
 * Extract all block-related file paths from a list of changed files.
 * Returns a map of blockName → list of changed files.
 */
export declare function groupChangedFilesByBlock(changedFiles: string[]): Map<string, string[]>;
/**
 * Identify files that are NOT under blocks/ — these are shared/global changes.
 */
export declare function getSharedChangedFiles(changedFiles: string[]): string[];
/**
 * Classify whether shared file changes affect the entire site.
 */
export declare function isSiteWideChange(file: string): boolean;
//# sourceMappingURL=git-diff.d.ts.map