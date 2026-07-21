/**
 * Post-build bundle script for blockguard-action.
 * Uses @vercel/ncc to create a single self-contained dist/index.js
 * that GitHub Actions can run without a separate `npm install`.
 *
 * Usage: node scripts/bundle.js
 *
 * Note: ncc bundles the compiled dist/index.js (from tsc) into a
 * single file. The output replaces dist/index.js in-place.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const distEntry = join(root, 'dist', 'index.js');

if (!existsSync(distEntry)) {
  console.error('dist/index.js not found — run tsc first');
  process.exit(1);
}

console.log('Bundling action with ncc...');

try {
  execSync(
    `npx ncc build ${distEntry} --out ${join(root, 'dist-bundled')} --minify --no-source-map-register`,
    { stdio: 'inherit', cwd: root },
  );
  console.log('Bundle written to dist-bundled/index.js');
  console.log('To deploy as a GitHub Action, copy dist-bundled/index.js to dist/index.js');
} catch (err) {
  // ncc bundling is optional during development — warn but don't fail
  console.warn('ncc bundle skipped (ncc not available or failed):', err.message);
}
