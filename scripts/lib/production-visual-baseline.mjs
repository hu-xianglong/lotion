import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

import { assertPngVisualBaseline } from "./visual-diff.mjs";

export async function assertProductionVisualBaseline({
  actualPath,
  artifactRoot,
  policyPath,
  root = process.cwd()
}) {
  if (!actualPath || !artifactRoot || !policyPath) {
    throw new Error("Production visual baseline requires actualPath, artifactRoot, and policyPath.");
  }
  const absolutePolicyPath = resolve(root, policyPath);
  assertInsideRoot(root, absolutePolicyPath, "policy");
  const policy = validatePolicy(JSON.parse(await readFile(absolutePolicyPath, "utf8")));
  const expectedPath = resolve(root, policy.image.path);
  assertInsideRoot(root, expectedPath, "expected image");
  const expectedBytes = await readFile(expectedPath);
  const expectedSha256 = createHash("sha256").update(expectedBytes).digest("hex");
  if (expectedSha256 !== policy.image.sha256) {
    throw new Error(`Production visual baseline checksum mismatch for ${policy.image.path}: expected ${policy.image.sha256}, got ${expectedSha256}`);
  }

  const stem = `${safeName(policy.surface)}-${safeName(policy.viewport.name)}`;
  const diffPath = join(artifactRoot, "visual-diff", `${stem}-diff.png`);
  const metadataPath = join(artifactRoot, "visual-diff", `${stem}-diff.json`);
  const result = await assertPngVisualBaseline({
    actualPath,
    expectedPath,
    diffPath,
    metadataPath,
    ...policy.comparison
  });
  if (result.expected.width !== policy.image.width || result.expected.height !== policy.image.height) {
    throw new Error(`Production visual baseline policy dimensions do not match ${policy.image.path}: ${result.expected.width}x${result.expected.height} versus ${policy.image.width}x${policy.image.height}`);
  }
  return {
    ...result,
    policyPath: relative(root, absolutePolicyPath).replaceAll("\\", "/"),
    policy: {
      surface: policy.surface,
      theme: policy.theme,
      viewport: policy.viewport,
      imageSha256: policy.image.sha256,
      verifiedAt: policy.verifiedAt,
      sourceTask: policy.sourceTask
    }
  };
}

export function validateProductionVisualBaselinePolicy(policy) {
  return validatePolicy(policy);
}

function validatePolicy(policy) {
  if (policy?.kind !== "lotion-production-visual-baseline-policy") {
    throw new Error(`Invalid production visual baseline policy kind: ${policy?.kind ?? "missing"}`);
  }
  for (const [label, value] of Object.entries({
    surface: policy.surface,
    theme: policy.theme,
    viewportName: policy.viewport?.name,
    imagePath: policy.image?.path,
    imageSha256: policy.image?.sha256,
    verifiedAt: policy.verifiedAt,
    sourceTask: policy.sourceTask
  })) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Production visual baseline policy requires ${label}.`);
    }
  }
  if (!/^[a-f0-9]{64}$/.test(policy.image.sha256)) {
    throw new Error(`Invalid production visual baseline SHA-256: ${policy.image.sha256}`);
  }
  for (const [label, value] of Object.entries({
    viewportWidth: policy.viewport?.width,
    viewportHeight: policy.viewport?.height,
    imageWidth: policy.image?.width,
    imageHeight: policy.image?.height
  })) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Invalid production visual baseline ${label}: ${value ?? "missing"}`);
    }
  }
  const comparison = policy.comparison || {};
  if (!Number.isFinite(comparison.threshold) || comparison.threshold < 0 || comparison.threshold > 1) {
    throw new Error(`Invalid production visual baseline threshold: ${comparison.threshold ?? "missing"}`);
  }
  if (!Number.isInteger(comparison.maxDiffPixels) || comparison.maxDiffPixels < 0) {
    throw new Error(`Invalid production visual baseline maxDiffPixels: ${comparison.maxDiffPixels ?? "missing"}`);
  }
  if (!Number.isFinite(comparison.maxDiffRatio) || comparison.maxDiffRatio < 0 || comparison.maxDiffRatio > 1) {
    throw new Error(`Invalid production visual baseline maxDiffRatio: ${comparison.maxDiffRatio ?? "missing"}`);
  }
  if (typeof comparison.includeAA !== "boolean") {
    throw new Error(`Invalid production visual baseline includeAA: ${comparison.includeAA ?? "missing"}`);
  }
  return policy;
}

function assertInsideRoot(root, path, label) {
  const rel = relative(resolve(root), path);
  if (rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) return;
  throw new Error(`Production visual baseline ${label} must stay inside the repository: ${path}`);
}

function safeName(value) {
  return basename(String(value)).replace(/[^a-z0-9_-]+/gi, "-");
}
