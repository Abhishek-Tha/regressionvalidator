import { BlockDependencyGraph } from './types.js';
/**
 * Build a dependency graph by scanning all block JS files for ES module imports.
 * Maps: blockName → imported modules, and module → blocks that import it.
 */
export declare function buildDependencyGraph(projectRoot: string): BlockDependencyGraph;
/**
 * Find all blocks that transitively depend on any of the given changed files.
 */
export declare function findTransitivelyAffectedBlocks(graph: BlockDependencyGraph, changedFiles: string[]): Map<string, string[]>;
//# sourceMappingURL=dependency-graph.d.ts.map