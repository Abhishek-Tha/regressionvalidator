import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';
import { BlockGuardConfigSchema } from './schema.js';
/**
 * Load and validate a blockguard.config.yml from the given path.
 * Falls back to sensible defaults via the Zod schema.
 */
export function loadConfig(configPath) {
    const absolutePath = resolve(configPath);
    if (!existsSync(absolutePath)) {
        throw new Error(`BlockGuard config not found at: ${absolutePath}`);
    }
    const raw = readFileSync(absolutePath, 'utf8');
    const parsed = yaml.load(raw);
    const result = BlockGuardConfigSchema.safeParse(parsed);
    if (!result.success) {
        const issues = result.error.issues
            .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
            .join('\n');
        throw new Error(`Invalid blockguard.config.yml:\n${issues}`);
    }
    return result.data;
}
/**
 * Resolve the live origin URL for a given branch.
 * Pattern: "{branch}--{repo}--{owner}.aem.page"
 */
export function resolveLiveOrigin(config) {
    if (config.site.liveHost) {
        return `https://${config.site.liveHost}`;
    }
    return `https://${config.site.baseBranch}--${config.site.repo}--${config.site.owner}.aem.live`;
}
/**
 * Resolve the preview origin URL for a given branch.
 */
export function resolvePreviewOrigin(config, branch) {
    const pattern = config.site.previewHostPattern ??
        `{branch}--${config.site.repo}--${config.site.owner}.aem.page`;
    return `https://${pattern.replace('{branch}', branch)}`;
}
//# sourceMappingURL=loader.js.map