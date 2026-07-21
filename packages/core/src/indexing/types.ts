export interface BlockSignature {
  /** e.g. "cards:featured:4d02af" */
  signature: string;
  blockName: string;
  variations: string[];
  /** Normalized text-content hash for matching */
  contentHash: string;
}

export interface BlockUsage {
  name: string;
  variations: string[];
  instances: number;
  signatures: string[];
}

export interface IndexedPage {
  path: string;
  url: string;
  site: string;
  locale: string;
  lastScanned: string;
  blocks: BlockUsage[];
  /** Total word count — used for longest-content prioritisation */
  wordCount?: number;
  /** Approximate traffic rank from RUM data (lower = higher traffic) */
  trafficRank?: number;
}

export interface UsageIndex {
  version: number;
  site: string;
  baseCommit: string;
  configHash: string;
  builtAt: string;
  pages: IndexedPage[];
}

export interface BlockUsageSummary {
  blockName: string;
  variation?: string;
  pages: IndexedPage[];
  totalInstances: number;
}
