import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface VisualDiffResult {
  baselinePath: string;
  branchPath: string;
  diffPath: string;
  totalPixels: number;
  diffPixels: number;
  mismatchPercent: number;
  width: number;
  height: number;
}

/**
 * Perform a pixel-level comparison between two PNG screenshots.
 * Writes a highlighted diff image and returns the mismatch percentage.
 */
export function compareVisuals(
  baselinePath: string,
  branchPath: string,
  diffOutputPath: string,
  threshold: number = 0.1,
): VisualDiffResult {
  const baseline = PNG.sync.read(readFileSync(baselinePath));
  const branch = PNG.sync.read(readFileSync(branchPath));

  // Normalize dimensions — pad the smaller image to match the larger
  const width = Math.max(baseline.width, branch.width);
  const height = Math.max(baseline.height, branch.height);

  const baselineData = padImage(baseline, width, height);
  const branchData = padImage(branch, width, height);

  const diff = new PNG({ width, height });

  const diffPixels = pixelmatch(baselineData, branchData, diff.data, width, height, {
    threshold,
    includeAA: false, // ignore anti-aliasing differences
    alpha: 0.1,
    diffColor: [255, 0, 0],     // red for changed pixels
    diffColorAlt: [0, 255, 0],  // green for added pixels
  });

  const totalPixels = width * height;
  const mismatchPercent = (diffPixels / totalPixels) * 100;

  // Ensure output directory exists
  const diffDir = dirname(diffOutputPath);
  if (!existsSync(diffDir)) {
    mkdirSync(diffDir, { recursive: true });
  }

  writeFileSync(diffOutputPath, PNG.sync.write(diff));

  return {
    baselinePath,
    branchPath,
    diffPath: diffOutputPath,
    totalPixels,
    diffPixels,
    mismatchPercent: Math.round(mismatchPercent * 100) / 100,
    width,
    height,
  };
}

/**
 * Pad a PNG image to the target dimensions, filling with white.
 */
function padImage(png: PNG, targetWidth: number, targetHeight: number): Buffer {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png.data as unknown as Buffer;
  }

  const padded = new PNG({ width: targetWidth, height: targetHeight });
  // Fill with white
  padded.data.fill(255);

  PNG.bitblt(png, padded, 0, 0, png.width, png.height, 0, 0);
  return padded.data as unknown as Buffer;
}
