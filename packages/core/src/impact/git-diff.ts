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
 * Get the full unified diff content for a set of files between two refs.
 * Returns the raw diff text.
 */
export function getDiffContent(
  baseRef: string,
  headRef: string,
  projectRoot: string,
  files: string[],
): string {
  if (files.length === 0) return '';
  try {
    const fileArgs = files.map((f) => `"${f}"`).join(' ');
    return execSync(
      `git -C "${projectRoot}" diff "${baseRef}...${headRef}" -- ${fileArgs}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 },
    );
  } catch {
    return '';
  }
}

/**
 * Extract the specific CSS variation class names that were modified in a block's diff.
 *
 * EDS blocks use classes like:
 *   .cards.body-highlight { ... }
 *   .cards .body-highlight { ... }    ← descendant child
 *   .body-highlight { ... }           ← inside blocks/cards/cards.css context
 *
 * Strategy:
 *  1. Look at only changed lines (starting with + or -) in the diff.
 *  2. Extract class selectors that are NOT the block name itself.
 *  3. Deduplicate and normalise.
 *  4. If no specific variation selectors are found → treat the entire block as changed.
 *
 * @param blockName   The block folder name, e.g. "cards"
 * @param diffContent Raw unified diff text for the block's CSS files
 */
export function extractChangedVariations(blockName: string, diffContent: string): string[] {
  if (!diffContent.trim()) return [];

  const changedLines = diffContent
    .split('\n')
    .filter((line) => (line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---'));

  const variationSet = new Set<string>();

  const blockClass = blockName.replace(/-/g, '[\\-]');

  // Ignored utility/state classes that are not variations
  const ignored = new Set([
    blockName,
    'block',
    'initialized',
    'loading',
    'loaded',
    'appear',
    'dark',       // keep 'dark' as it could be a real variation — remove from ignored if needed
    'is-',
    'has-',
  ]);
  // Remove 'dark' from ignored — it can be a genuine variation
  ignored.delete('dark');

  for (const line of changedLines) {
    // Pattern 1: compound .blockname.variation
    let m: RegExpExecArray | null;
    const cp = new RegExp(`\\.${blockClass}[.\\s]+\\.([a-z][a-z0-9-]*)`, 'gi');
    while ((m = cp.exec(line)) !== null) {
      const v = m[1].toLowerCase();
      if (!ignored.has(v) && v.length > 1) variationSet.add(v);
    }

    // Pattern 2: sibling .blockname.variation
    const sp = new RegExp(`\\.${blockClass}\\.([a-z][a-z0-9-]+)`, 'gi');
    while ((m = sp.exec(line)) !== null) {
      const v = m[1].toLowerCase();
      if (!ignored.has(v) && v.length > 1) variationSet.add(v);
    }

    // Pattern 3: standalone class selectors — only if the line is a CSS selector line
    // (i.e. it contains { or , or > after the class name)
    if (/\.[a-z][a-z0-9-]+\s*[{,>~+]/.test(line)) {
      const stp = /\.([a-z][a-z0-9-]+)\s*[{,>~+\s]/g;
      while ((m = stp.exec(line)) !== null) {
        const v = m[1].toLowerCase();
        if (!ignored.has(v) && v !== blockName && v.length > 1) {
          variationSet.add(v);
        }
      }
    }
  }

  // Clean up: remove the block name itself if it snuck in
  variationSet.delete(blockName.toLowerCase());

  return Array.from(variationSet);
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
