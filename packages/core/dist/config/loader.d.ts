import { BlockGuardConfig } from './schema.js';
/**
 * Load and validate a blockguard.config.yml from the given path.
 * Falls back to sensible defaults via the Zod schema.
 */
export declare function loadConfig(configPath: string): BlockGuardConfig;
/**
 * Resolve the live origin URL for a given branch.
 * Pattern: "{branch}--{repo}--{owner}.aem.page"
 */
export declare function resolveLiveOrigin(config: BlockGuardConfig): string;
/**
 * Resolve the preview origin URL for a given branch.
 */
export declare function resolvePreviewOrigin(config: BlockGuardConfig, branch: string): string;
//# sourceMappingURL=loader.d.ts.map