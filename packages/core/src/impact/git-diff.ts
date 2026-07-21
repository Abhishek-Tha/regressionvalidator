import { execSync } from 'child_process';

export interface GitDiffResult {
  changedFiles: string[];
  baseRef: string;
  headRef: string;
}

/**
 * Run git diff between two refs and return the list of changed file paths.
 */
export function getChangedFiles(
  baseRef: string,
  headRef: string,
  projectRoot: string,
): GitDiffResult {
  try {
    const output = execSync(
      `git -C "${projectRoot}" diff --name-only "${baseRef}...${headRef}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const changedFiles = output
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

    return { changedFiles, baseRef, headRef };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`git diff failed between ${baseRef} and ${headRef}: ${message}`);
  }
}

/**
 * Get the current HEAD commit SHA.
 */
export function getCurrentCommitSha(projectRoot: string): string {
  return execSync(`git -C "${projectRoot}" rev-parse HEAD`, {
    encoding: 'utf8',
  }).trim();
}

/**
 * Check if a git ref exists in the repository.
 */
export function refExists(ref: string, projectRoot: string): boolean {
  try {
    execSync(`git -C "${projectRoot}" rev-parse --verify "${ref}"`, {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract all block-related file paths from a list of changed files.
 * Returns a map of blockName → list of changed files.
 */
export function groupChangedFilesByBlock(changedFiles: string[]): Map<string, string[]> {
  const blockMap = new Map<string, string[]>();

  for (const file of changedFiles) {
    // Match blocks/<block-name>/... pattern
    const blockMatch = file.match(/^blocks\/([^/]+)\//);
    if (blockMatch) {
      const blockName = blockMatch[1];
      const existing = blockMap.get(blockName) ?? [];
      existing.push(file);
      blockMap.set(blockName, existing);
    }
  }

  return blockMap;
}

/**
 * Identify files that are NOT under blocks/ — these are shared/global changes.
 */
export function getSharedChangedFiles(changedFiles: string[]): string[] {
  return changedFiles.filter((f) => !f.startsWith('blocks/'));
}

/**
 * Classify whether shared file changes affect the entire site.
 */
export function isSiteWideChange(file: string): boolean {
  const siteWidePatterns = [
    /^styles\//,
    /^scripts\/scripts\./,
    /^scripts\/aem\./,
    /^scripts\/lib-franklin\./,
    /^scripts\/delayed\./,
    /^head\.html$/,
    /^scripts\/fonts\./,
  ];
  return siteWidePatterns.some((p) => p.test(file));
}
