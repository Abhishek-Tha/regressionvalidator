import {
  getChangedFiles,
  getDiffContent,
  extractChangedVariations,
  groupChangedFilesByBlock,
  getSharedChangedFiles,
  isSiteWideChange,
} from './git-diff.js';
import { buildDependencyGraph, findTransitivelyAffectedBlocks } from './dependency-graph.js';
import { ImpactAnalysis, ChangedBlock, RiskLevel } from './types.js';

export interface AnalyzeOptions {
  baseRef: string;
  headRef: string;
  projectRoot: string;
}

/**
 * Full impact analysis: git diff → block grouping → variation extraction → dependency graph → risk classification.
 */
export async function analyzeImpact(options: AnalyzeOptions): Promise<ImpactAnalysis> {
  const { baseRef, headRef, projectRoot } = options;

  const { changedFiles } = getChangedFiles(baseRef, headRef, projectRoot);

  // 1. Direct block changes
  const directBlockMap = groupChangedFilesByBlock(changedFiles);
  const directlyChangedBlocks: ChangedBlock[] = [];

  for (const [name, files] of directBlockMap) {
    // Only look at CSS/SCSS files for variation detection — JS changes = whole block changed
    const cssFiles = files.filter((f) => /\.(css|scss)$/.test(f));
    const jsFiles = files.filter((f) => /\.(js|ts|jsx|tsx)$/.test(f));

    let changedVariations: string[] = [];

    if (jsFiles.length === 0 && cssFiles.length > 0) {
      // Only CSS changed — try to detect specific variations
      const diffContent = getDiffContent(baseRef, headRef, projectRoot, cssFiles);
      const detectedVariations = extractChangedVariations(name, diffContent);
      // If we found specific variation selectors, record them.
      // If the diff also modifies base block styles (not variation-specific), clear the list
      // so the entire block is treated as changed.
      changedVariations = detectedVariations;
    }
    // If JS changed (or both CSS+JS), treat the whole block as affected (changedVariations=[])

    directlyChangedBlocks.push({ name, changedFiles: files, reason: 'direct', changedVariations });
  }

  // 2. Shared/global file changes
  const sharedFilesChanged = getSharedChangedFiles(changedFiles);

  // 3. Build dependency graph and find transitively affected blocks
  const graph = buildDependencyGraph(projectRoot);
  const transitiveMap = findTransitivelyAffectedBlocks(graph, sharedFilesChanged);

  const transitivelyChangedBlocks: ChangedBlock[] = [];
  for (const [name, files] of transitiveMap) {
    // Don't double-count directly changed blocks
    if (!directBlockMap.has(name)) {
      transitivelyChangedBlocks.push({ name, changedFiles: files, reason: 'transitive', changedVariations: [] });
    }
  }

  // 4. Risk classification
  const risk = classifyRisk(
    directlyChangedBlocks,
    transitivelyChangedBlocks,
    sharedFilesChanged,
  );

  const allAffectedBlocks = [
    ...directlyChangedBlocks.map((b) => b.name),
    ...transitivelyChangedBlocks.map((b) => b.name),
  ];

  // 5. Build variation map: blockName → changed variation classes (empty = all variations)
  const allAffectedVariations: Record<string, string[]> = {};
  for (const block of [...directlyChangedBlocks, ...transitivelyChangedBlocks]) {
    allAffectedVariations[block.name] = block.changedVariations;
  }

  return {
    baseRef,
    headRef,
    directlyChangedBlocks,
    transitivelyChangedBlocks,
    sharedFilesChanged,
    risk,
    allAffectedBlocks,
    allAffectedVariations,
  };
}

function classifyRisk(
  direct: ChangedBlock[],
  transitive: ChangedBlock[],
  sharedFiles: string[],
): RiskLevel {
  // Any site-wide file changes → site-wide risk
  if (sharedFiles.some(isSiteWideChange)) {
    return 'site-wide';
  }

  const totalBlocks = direct.length + transitive.length;

  if (totalBlocks === 0) return 'block-scoped';
  if (totalBlocks === 1) return 'block-scoped';
  if (totalBlocks <= 5) return 'multi-block';
  return 'site-wide';
}
