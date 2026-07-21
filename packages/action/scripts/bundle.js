/**
 * Post-build bundle script for blockguard-action.
 * Uses @vercel/ncc to create a single self-contained dist-bundled/index.js
 * that GitHub Actions can run without a separate npm install.
 */

'use strict';

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

const root = join(__dirname, '..');
const distEntry = join(root, 'dist', 'index.js');

if (!existsSync(distEntry)) {
  console.error('dist/index.js not found — run tsc first');
  process.exit(1);
}

console.log('Bundling action with ncc...');

try {
  execSync(
    `npx ncc build "${distEntry}" --out "${join(root, 'dist-bundled')}" --minify --no-source-map-register`,
    { stdio: 'inherit', cwd: root },
  );
  console.log('Bundle written to dist-bundled/index.js');
} catch (err) {
  console.warn('ncc bundle skipped:', err.message);
}
