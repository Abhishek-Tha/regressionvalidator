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
 *   .cards.body-highlight { ... }        ← compound (DA: "Cards (body-highlight)")
 *   .cards .body-highlight { ... }       ← descendant
 *   .body-highlight { ... }              ← inside blocks/cards/cards.css context
 *
 * Strategy (context-aware):
 *  Walk every line of the diff maintaining the "current CSS selector" context.
 *  A changed property line (+/-) inside a selector block means that selector's
 *  variation was modified — even if the selector line itself is unchanged context.
 *
 *  Additionally scan added/removed selector lines for inline variation references.
 *
 *  If no specific variation selectors are found → treat the entire block as changed.
 *
 * @param blockName   The block folder name, e.g. "cards"
 * @param diffContent Raw unified diff text for the block's CSS files
 */
export function extractChangedVariations(blockName: string, diffContent: string): string[] {
  if (!diffContent.trim()) return [];

  // Ignored utility/state classes that are not EDS variations
  const IGNORED = new Set([
    blockName.toLowerCase(),
    'block',
    'initialized',
    'loading',
    'loaded',
    'appear',
  ]);

  const variationSet = new Set<string>();

  /**
   * Given a CSS selector string, extract variation class names that belong to this block.
   * Handles:
   *   .cards.body-highlight         → body-highlight
   *   .cards .body-highlight        → body-highlight
   *   .body-highlight               → body-highlight  (file is already scoped to block)
   */
  function extractVariationsFromSelector(selector: string): string[] {
    const found: string[] = [];
    const bn = blockName.toLowerCase();

    // Pattern A: .blockname.variation (compound — no space)
    const compoundRe = new RegExp(`\\.${escapeForRegex(bn)}\\.([a-z][a-z0-9-]+)`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = compoundRe.exec(selector)) !== null) {
      const v = m[1].toLowerCase();
      if (!IGNORED.has(v)) found.push(v);
    }

    // Pattern B: .blockname followed by space then .variation (descendant)
    const descendantRe = new RegExp(`\\.${escapeForRegex(bn)}\\s+\\.([a-z][a-z0-9-]+)`, 'gi');
    while ((m = descendantRe.exec(selector)) !== null) {
      const v = m[1].toLowerCase();
      if (!IGNORED.has(v)) found.push(v);
    }

    // Pattern C: standalone .variation class (only non-block-name classes)
    // Only applies when the selector does NOT contain the block name at all,
    // i.e. the whole file is scoped to this block (blocks/cards/cards.css)
    if (!selector.includes(`.${bn}`)) {
      const standaloneRe = /\.([a-z][a-z0-9-]+)/g;
      while ((m = standaloneRe.exec(selector)) !== null) {
        const v = m[1].toLowerCase();
        if (!IGNORED.has(v)) found.push(v);
      }
    }

    return found;
  }

  /**
   * Parse a selector line that may contain multiple selectors (comma-separated)
   * and return all class tokens that match variations.
   */
  function parseSelector(line: string): string[] {
    // Strip the leading diff character (+/-/ ) and trailing {
    const stripped = line.replace(/^[+\- ]/, '').replace(/\{.*$/, '').trim();
    // Handle comma-separated selectors
    return stripped.split(',').flatMap((s) => extractVariationsFromSelector(s.trim()));
  }

  /**
   * Determine if a (stripped) line is a CSS selector line.
   * Selector lines end with { or , (multi-selector) and don't contain :
   * followed by a value (property lines look like "color: red;").
   */
  function isSelectorLine(stripped: string): boolean {
    if (!stripped) return false;
    // Must end with { or , (possibly followed by whitespace)
    if (!/[{,]\s*$/.test(stripped)) return false;
    // Shouldn't look like a property: "  color: red,"  — has word chars then colon then space+value
    if (/^\s*[\w-]+\s*:/.test(stripped)) return false;
    return true;
  }

  const lines = diffContent.split('\n');

  // Current active CSS selectors (the selector(s) whose rule-block we are inside).
  // We stack them because CSS can be nested (media queries wrapping rules).
  // For our purposes we only need the innermost rule's selector.
  let currentSelectors: string[] = [];
  let braceDepth = 0;
  // Track per-depth what selector was set (so we can pop correctly)
  const selectorStack: Array<{ depth: number; selectors: string[] }> = [];

  for (const rawLine of lines) {
    // Skip diff file headers
    if (rawLine.startsWith('+++') || rawLine.startsWith('---') || rawLine.startsWith('@@')) {
      continue;
    }

    const isAdded = rawLine.startsWith('+');
    const isRemoved = rawLine.startsWith('-');
    const isChanged = isAdded || isRemoved;

    // Strip the leading diff character for content analysis
    const stripped = rawLine.replace(/^[+\- ]/, '');

    // Count braces to track CSS rule nesting
    const openBraces = (stripped.match(/\{/g) ?? []).length;
    const closeBraces = (stripped.match(/\}/g) ?? []).length;

    // If this is a selector line (context OR added), update our selector tracking
    if (isSelectorLine(stripped)) {
      // Push the new selector scope
      selectorStack.push({ depth: braceDepth, selectors: currentSelectors });
      currentSelectors = parseSelector(rawLine);
    }

    // If it's a changed line (+ or -), record variations from the current selector context
    if (isChanged) {
      if (isSelectorLine(stripped)) {
        // The selector itself changed — extract variations from it directly
        for (const v of parseSelector(rawLine)) {
          variationSet.add(v);
        }
      } else {
        // A property/value changed — attribute it to the enclosing selector
        for (const v of currentSelectors) {
          variationSet.add(v);
        }
      }
    }

    // Update brace depth AFTER processing the line
    braceDepth += openBraces - closeBraces;

    // Pop selector stack when we close back to a previous depth
    while (selectorStack.length > 0 && braceDepth <= selectorStack[selectorStack.length - 1].depth) {
      const popped = selectorStack.pop()!;
      currentSelectors = popped.selectors;
    }
  }

  // Remove the block name itself if it snuck in
  variationSet.delete(blockName.toLowerCase());

  return Array.from(variationSet);
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
