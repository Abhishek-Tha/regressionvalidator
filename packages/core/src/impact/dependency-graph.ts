import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { BlockDependencyGraph } from './types.js';

/**
 * Build a dependency graph by scanning all block JS files for ES module imports.
 * Maps: blockName → imported modules, and module → blocks that import it.
 */
export function buildDependencyGraph(projectRoot: string): BlockDependencyGraph {
  const blocksDir = join(projectRoot, 'blocks');
  const blockToModules = new Map<string, Set<string>>();
  const moduleToBlocks = new Map<string, Set<string>>();

  if (!existsSync(blocksDir)) {
    return { blockToModules, moduleToBlocks };
  }

  const blockNames = readdirSync(blocksDir).filter((entry) => {
    const fullPath = join(blocksDir, entry);
    return statSync(fullPath).isDirectory();
  });

  for (const blockName of blockNames) {
    const blockDir = join(blocksDir, blockName);
    const jsFile = join(blockDir, `${blockName}.js`);

    if (!existsSync(jsFile)) continue;

    const imports = extractImports(jsFile, projectRoot);

    if (imports.length > 0) {
      blockToModules.set(blockName, new Set(imports));
      for (const imp of imports) {
        const existing = moduleToBlocks.get(imp) ?? new Set<string>();
        existing.add(blockName);
        moduleToBlocks.set(imp, existing);
      }
    }
  }

  return { blockToModules, moduleToBlocks };
}

/**
 * Extract all ES import paths from a JavaScript file.
 * Normalises paths relative to the project root.
 */
function extractImports(filePath: string, projectRoot: string): string[] {
  let source: string;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const imports: string[] = [];

  // Match: import ... from '...'  and  import('...')
  const staticImportRe = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const re of [staticImportRe, dynamicImportRe]) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith('.')) {
        // Resolve relative path to project-relative form
        const absoluteImport = join(filePath, '..', importPath).replace(/\\/g, '/');
        const projectRelative = relative(projectRoot, absoluteImport).replace(/\\/g, '/');
        imports.push(projectRelative);
      }
      // Ignore bare specifiers (npm packages)
    }
  }

  return [...new Set(imports)];
}

/**
 * Find all blocks that transitively depend on any of the given changed files.
 */
export function findTransitivelyAffectedBlocks(
  graph: BlockDependencyGraph,
  changedFiles: string[],
): Map<string, string[]> {
  const affectedBlocks = new Map<string, string[]>();

  for (const changedFile of changedFiles) {
    // Normalise to no leading slash and no .js extension variation
    const normalised = changedFile.replace(/^\//, '');
    const withoutExt = normalised.replace(/\.(js|ts|mjs)$/, '');

    for (const [module, blocks] of graph.moduleToBlocks) {
      const moduleName = module.replace(/\.(js|ts|mjs)$/, '');
      if (moduleName === withoutExt || module === normalised) {
        for (const block of blocks) {
          const existing = affectedBlocks.get(block) ?? [];
          existing.push(changedFile);
          affectedBlocks.set(block, existing);
        }
      }
    }
  }

  return affectedBlocks;
}
