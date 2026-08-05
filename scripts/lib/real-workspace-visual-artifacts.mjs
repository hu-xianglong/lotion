import { readFile, stat } from "node:fs/promises";

export async function assertRealWorkspaceVisualArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"],
  expectedWorkspaceName = "Lotion Demo Space",
  minSourceFiles = 100,
  minSourceBytes = 100_000_000,
  maxHomeOpenMs = 15_000,
  maxDatabaseOpenMs = 45_000
} = {}) {
  if (summary?.status !== "passed") throw new Error(`Real-workspace visual contract requires passed status, saw ${summary?.status ?? "missing"}`);
  if (summary.sourceIdentity?.workspaceName !== expectedWorkspaceName || summary.sourceIdentity?.directoryName !== expectedWorkspaceName) {
    throw new Error(`Real-workspace visual contract source identity mismatch: ${JSON.stringify(summary.sourceIdentity)}`);
  }
  if ("sourceRoot" in summary || "sourcePath" in summary.sourceIdentity) {
    throw new Error("Real-workspace visual contract must not expose the original workspace path.");
  }
  assertFingerprint(summary.sourceFingerprint, { expectedWorkspaceName, minSourceBytes, minSourceFiles });
  assertFingerprint(summary.cloneFingerprint, { expectedWorkspaceName, minSourceBytes, minSourceFiles });
  if (summary.sourceFingerprint.sha256 !== summary.cloneFingerprint.sha256) {
    throw new Error("Real-workspace visual contract clone fingerprint does not match source.");
  }
  if (summary.isolation?.symlinksAllowed !== false || summary.isolation?.byteIdenticalAtClone !== true) {
    throw new Error(`Real-workspace visual contract has weak clone isolation: ${JSON.stringify(summary.isolation)}`);
  }
  if (summary.sourceSafety?.unchanged !== true || summary.sourceSafety?.before?.sha256 !== summary.sourceSafety?.after?.sha256) {
    throw new Error(`Real-workspace visual contract source changed: ${JSON.stringify(summary.sourceSafety)}`);
  }

  const viewports = Array.isArray(summary.viewports) ? summary.viewports : [];
  const observedViewportNames = [...new Set(viewports.map((entry) => entry.viewport).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) throw new Error(`Real-workspace visual contract missing viewport(s): ${missing.join(", ")}`);
  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => candidate.viewport === viewportName);
    if (!entry?.activeWorkspaceWasClone || entry.workspaceName !== expectedWorkspaceName) {
      throw new Error(`Real-workspace visual contract did not open the isolated clone for ${viewportName}: ${JSON.stringify(entry)}`);
    }
    if (!Number.isFinite(entry.homeOpenMs) || entry.homeOpenMs < 0 || entry.homeOpenMs > maxHomeOpenMs) {
      throw new Error(`Real-workspace visual contract home latency exceeded for ${viewportName}: ${entry.homeOpenMs}ms`);
    }
    if (!Number.isFinite(entry.databaseOpenMs) || entry.databaseOpenMs <= 0 || entry.databaseOpenMs > maxDatabaseOpenMs) {
      throw new Error(`Real-workspace visual contract 500K database latency exceeded for ${viewportName}: ${entry.databaseOpenMs}ms`);
    }
    if (!String(entry.databaseState?.rowCountText || "").replaceAll(",", "").includes("500000")) {
      throw new Error(`Real-workspace visual contract missing 500K row evidence for ${viewportName}: ${JSON.stringify(entry.databaseState)}`);
    }
    if (entry.databaseState?.virtualized !== true || entry.databaseState.renderedRowCount <= 0 || entry.databaseState.renderedRowCount > 200) {
      throw new Error(`Real-workspace visual contract missing bounded virtualization for ${viewportName}: ${JSON.stringify(entry.databaseState)}`);
    }
    if (entry.databaseState.documentHorizontalOverflowPx > 0) {
      throw new Error(`Real-workspace visual contract has document overflow for ${viewportName}: ${entry.databaseState.documentHorizontalOverflowPx}px`);
    }
    for (const [phase, snapshot] of Object.entries(entry.snapshots || {})) {
      snapshots.push(await assertSnapshot(snapshot, viewportName, phase));
    }
    if (!entry.snapshots?.home || !entry.snapshots?.database500k) {
      throw new Error(`Real-workspace visual contract missing home/database snapshots for ${viewportName}.`);
    }
  }
  return {
    status: "passed",
    reproduceCommand: "npm run smoke:real-demo-workspace-ui",
    workspaceName: expectedWorkspaceName,
    sourceFingerprint: summary.sourceFingerprint,
    sourceUnchanged: true,
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertFingerprint(fingerprint, { expectedWorkspaceName, minSourceBytes, minSourceFiles }) {
  if (fingerprint?.kind !== "lotion-real-workspace-fingerprint" || fingerprint.workspaceName !== expectedWorkspaceName) {
    throw new Error(`Invalid real-workspace fingerprint: ${JSON.stringify(fingerprint)}`);
  }
  if (!Number.isInteger(fingerprint.fileCount) || fingerprint.fileCount < minSourceFiles) {
    throw new Error(`Real-workspace fingerprint has too few files: ${fingerprint.fileCount}`);
  }
  if (!Number.isInteger(fingerprint.totalBytes) || fingerprint.totalBytes < minSourceBytes) {
    throw new Error(`Real-workspace fingerprint has too few bytes: ${fingerprint.totalBytes}`);
  }
  if (!/^[a-f0-9]{64}$/.test(fingerprint.sha256 || "")) throw new Error("Real-workspace fingerprint is missing SHA-256 evidence.");
}

async function assertSnapshot(snapshot, viewportName, phase) {
  if (!snapshot?.imagePath || !snapshot?.metadataPath) throw new Error(`Real-workspace visual contract missing ${phase} snapshot paths for ${viewportName}`);
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) throw new Error(`Real-workspace visual contract found empty ${phase} screenshot for ${viewportName}`);
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  if (metadata.viewport?.name !== viewportName || metadata.metadata?.phase !== phase) {
    throw new Error(`Real-workspace visual contract ${phase} metadata mismatch for ${viewportName}: ${JSON.stringify(metadata)}`);
  }
  return { viewport: viewportName, phase, imageBytes: imageInfo.size, imagePath: snapshot.imagePath, metadataPath: snapshot.metadataPath };
}
