import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export class VisualBaselineMismatchError extends Error {
  constructor(result) {
    super(`Visual baseline mismatch: ${result.diffPixels} pixels (${formatPercent(result.diffRatio)}) differ; allowed ${result.maxDiffPixels} pixels / ${formatPercent(result.maxDiffRatio)}`);
    this.name = "VisualBaselineMismatchError";
    this.result = result;
  }
}

export async function assertPngVisualBaseline({
  actualPath,
  expectedPath,
  diffPath,
  metadataPath = `${diffPath}.json`,
  threshold = 0.1,
  maxDiffPixels = 0,
  maxDiffRatio = 0,
  includeAA = false,
  ignoredRegions = []
}) {
  validateOptions({ actualPath, expectedPath, diffPath, metadataPath, threshold, maxDiffPixels, maxDiffRatio, ignoredRegions });
  const [actual, expected] = await Promise.all([
    readPng(actualPath, "actual"),
    readPng(expectedPath, "expected")
  ]);
  const dimensionsMatch = actual.width === expected.width && actual.height === expected.height;
  const width = Math.max(actual.width, expected.width);
  const height = Math.max(actual.height, expected.height);
  const diff = new PNG({ width, height });
  let diffPixels;

  if (dimensionsMatch) {
    applyIgnoredRegions(actual, expected, ignoredRegions);
    diffPixels = pixelmatch(expected.data, actual.data, diff.data, width, height, {
      threshold,
      includeAA,
      alpha: 0.45,
      diffColor: [220, 38, 38],
      aaColor: [245, 158, 11]
    });
  } else {
    diffPixels = width * height;
    fillDimensionMismatch(diff);
  }

  const totalPixels = width * height;
  const diffRatio = totalPixels === 0 ? 0 : diffPixels / totalPixels;
  const passed = dimensionsMatch && diffPixels <= maxDiffPixels && diffRatio <= maxDiffRatio;
  const result = {
    kind: "lotion-png-visual-diff",
    status: passed ? "passed" : "failed",
    actualPath,
    expectedPath,
    diffPath,
    metadataPath,
    actual: { width: actual.width, height: actual.height },
    expected: { width: expected.width, height: expected.height },
    dimensionsMatch,
    totalPixels,
    diffPixels,
    diffRatio: Number(diffRatio.toFixed(8)),
    threshold,
    includeAA,
    maxDiffPixels,
    maxDiffRatio,
    ignoredRegions
  };

  await Promise.all([mkdir(dirname(diffPath), { recursive: true }), mkdir(dirname(metadataPath), { recursive: true })]);
  await Promise.all([
    writeFile(diffPath, PNG.sync.write(diff)),
    writeFile(metadataPath, `${JSON.stringify(result, null, 2)}\n`, "utf8")
  ]);

  if (!passed) throw new VisualBaselineMismatchError(result);
  return result;
}

async function readPng(path, label) {
  try {
    return PNG.sync.read(await readFile(path));
  } catch (error) {
    throw new Error(`Unable to decode ${label} PNG at ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

function fillDimensionMismatch(png) {
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = 220;
    png.data[offset + 1] = 38;
    png.data[offset + 2] = 38;
    png.data[offset + 3] = 255;
  }
}

function applyIgnoredRegions(actual, expected, regions) {
  for (const region of regions) {
    const right = Math.min(actual.width, region.x + region.width);
    const bottom = Math.min(actual.height, region.y + region.height);
    for (let y = region.y; y < bottom; y += 1) {
      for (let x = region.x; x < right; x += 1) {
        const offset = (y * actual.width + x) * 4;
        expected.data.copy(actual.data, offset, offset, offset + 4);
      }
    }
  }
}

function validateOptions({ actualPath, expectedPath, diffPath, metadataPath, threshold, maxDiffPixels, maxDiffRatio, ignoredRegions }) {
  for (const [label, value] of Object.entries({ actualPath, expectedPath, diffPath, metadataPath })) {
    if (!value) throw new Error(`assertPngVisualBaseline requires ${label}`);
  }
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`Visual diff threshold must be between 0 and 1, saw ${threshold}`);
  }
  if (!Number.isInteger(maxDiffPixels) || maxDiffPixels < 0) {
    throw new Error(`Visual diff maxDiffPixels must be a non-negative integer, saw ${maxDiffPixels}`);
  }
  if (!Number.isFinite(maxDiffRatio) || maxDiffRatio < 0 || maxDiffRatio > 1) {
    throw new Error(`Visual diff maxDiffRatio must be between 0 and 1, saw ${maxDiffRatio}`);
  }
  if (!Array.isArray(ignoredRegions)) throw new Error("Visual diff ignoredRegions must be an array");
  for (const [index, region] of ignoredRegions.entries()) {
    for (const key of ["x", "y", "width", "height"]) {
      const value = region?.[key];
      const minimum = key === "width" || key === "height" ? 1 : 0;
      if (!Number.isInteger(value) || value < minimum) {
        throw new Error(`Visual diff ignoredRegions[${index}].${key} must be an integer >= ${minimum}, saw ${value ?? "missing"}`);
      }
    }
  }
}

function formatPercent(value) {
  return `${(Number(value) * 100).toFixed(3)}%`;
}
