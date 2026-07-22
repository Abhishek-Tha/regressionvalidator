export type RiskLevel = 'block-scoped' | 'multi-block' | 'site-wide';

export interface ChangedBlock {
  name: string;
  changedFiles: string[];
  reason: 'direct' | 'transitive';
  /**
   * Specific CSS variation classes that were modified within this block.
   * Empty array means the base block changed (all variations affected).
   * e.g. ['body-highlight', 'dark'] means only those variants changed.
   */
  changedVariations: string[];
}

export interface ImpactAnalysis {
  baseRef: string;
  headRef: string;
  directlyChangedBlocks: ChangedBlock[];
  transitivelyChangedBlocks: ChangedBlock[];
  sharedFilesChanged: string[];
  risk: RiskLevel;
  /** All affected block names (direct + transitive) */
  allAffectedBlocks: string[];
  /**
   * Map of blockName → changed variation class names.
   * If a block's entry is empty, ALL variations are considered changed.
   * e.g. { cards: ['body-highlight'] }
   */
  allAffectedVariations: Record<string, string[]>;
}

export interface DependencyEdge {
  /** The file that has the import */
  importer: string;
  /** The module being imported */
  imported: string;
}

export interface BlockDependencyGraph {
  /** Map from block name → set of imported module paths */
  blockToModules: Map<string, Set<string>>;
  /** Map from module path → set of block names that import it */
  moduleToBlocks: Map<string, Set<string>>;
}
