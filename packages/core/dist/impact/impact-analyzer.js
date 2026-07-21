import { getChangedFiles, groupChangedFilesByBlock, getSharedChangedFiles, isSiteWideChange, } from './git-diff.js';
import { buildDependencyGraph, findTransitivelyAffectedBlocks } from './dependency-graph.js';
/**
 * Full impact analysis: git diff → block grouping → dependency graph → risk classification.
 */
export async function analyzeImpact(options) {
    const { baseRef, headRef, projectRoot } = options;
    const { changedFiles } = getChangedFiles(baseRef, headRef, projectRoot);
    // 1. Direct block changes
    const directBlockMap = groupChangedFilesByBlock(changedFiles);
    const directlyChangedBlocks = [];
    for (const [name, files] of directBlockMap) {
        directlyChangedBlocks.push({ name, changedFiles: files, reason: 'direct' });
    }
    // 2. Shared/global file changes
    const sharedFilesChanged = getSharedChangedFiles(changedFiles);
    // 3. Build dependency graph and find transitively affected blocks
    const graph = buildDependencyGraph(projectRoot);
    const transitiveMap = findTransitivelyAffectedBlocks(graph, sharedFilesChanged);
    const transitivelyChangedBlocks = [];
    for (const [name, files] of transitiveMap) {
        // Don't double-count directly changed blocks
        if (!directBlockMap.has(name)) {
            transitivelyChangedBlocks.push({ name, changedFiles: files, reason: 'transitive' });
        }
    }
    // 4. Risk classification
    const risk = classifyRisk(directlyChangedBlocks, transitivelyChangedBlocks, sharedFilesChanged);
    const allAffectedBlocks = [
        ...directlyChangedBlocks.map((b) => b.name),
        ...transitivelyChangedBlocks.map((b) => b.name),
    ];
    return {
        baseRef,
        headRef,
        directlyChangedBlocks,
        transitivelyChangedBlocks,
        sharedFilesChanged,
        risk,
        allAffectedBlocks,
    };
}
function classifyRisk(direct, transitive, sharedFiles) {
    // Any site-wide file changes → site-wide risk
    if (sharedFiles.some(isSiteWideChange)) {
        return 'site-wide';
    }
    const totalBlocks = direct.length + transitive.length;
    if (totalBlocks === 0)
        return 'block-scoped';
    if (totalBlocks === 1)
        return 'block-scoped';
    if (totalBlocks <= 5)
        return 'multi-block';
    return 'site-wide';
}
//# sourceMappingURL=impact-analyzer.js.map