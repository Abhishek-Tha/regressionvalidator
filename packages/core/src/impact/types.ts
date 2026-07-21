export type RiskLevel = 'block-scoped' | 'multi-block' | 'site-wide';

export interface ChangedBlock {
  name: string;
  changedFiles: string[];
  reason: 'direct' | 'transitive';
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
