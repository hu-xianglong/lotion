import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertRealWorkspaceVisualArtifactContract } from "../scripts/lib/real-workspace-visual-artifacts.mjs";

test("real-workspace visual artifact contract verifies clone safety, stress evidence, and screenshots", async () => {
  const fixture = await createFixture();
  try {
    const contract = await assertRealWorkspaceVisualArtifactContract(fixture.summary, {
      minSourceBytes: 1,
      minSourceFiles: 1
    });
    assert.equal(contract.status, "passed");
    assert.equal(contract.reproduceCommand, "npm run smoke:real-demo-workspace-ui");
    assert.equal(contract.sourceUnchanged, true);
    assert.equal(contract.snapshotCount, 4);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("real-workspace visual artifact contract rejects source mutation and weak virtualization", async () => {
  const fixture = await createFixture();
  try {
    fixture.summary.sourceSafety.after.sha256 = "b".repeat(64);
    await assert.rejects(
      () => assertRealWorkspaceVisualArtifactContract(fixture.summary, { minSourceBytes: 1, minSourceFiles: 1 }),
      /source changed/
    );
    fixture.summary.sourceSafety.after.sha256 = fixture.summary.sourceSafety.before.sha256;
    fixture.summary.viewports[0].databaseState.renderedRowCount = 500000;
    await assert.rejects(
      () => assertRealWorkspaceVisualArtifactContract(fixture.summary, { minSourceBytes: 1, minSourceFiles: 1 }),
      /missing bounded virtualization/
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-real-workspace-visual-contract-"));
  const fingerprint = {
    kind: "lotion-real-workspace-fingerprint",
    workspaceName: "Lotion Demo Space",
    fileCount: 183,
    directoryCount: 36,
    totalBytes: 228505681,
    sha256: "a".repeat(64)
  };
  const viewports = [];
  for (const viewport of ["desktop", "compact"]) {
    const snapshots = {};
    for (const phase of ["home", "database500k"]) {
      const imagePath = join(root, `${viewport}-${phase}.png`);
      const metadataPath = join(root, `${viewport}-${phase}.json`);
      await writeFile(imagePath, `fake ${viewport} ${phase} screenshot`, "utf8");
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport }, metadata: { phase } }), "utf8");
      snapshots[phase] = { imagePath, metadataPath };
    }
    viewports.push({
      viewport,
      activeWorkspaceWasClone: true,
      workspaceName: "Lotion Demo Space",
      homeOpenMs: 120,
      databaseOpenMs: 2400,
      databaseState: {
        rowCountText: "50 of 500000 rows",
        virtualized: true,
        renderedRowCount: 32,
        documentHorizontalOverflowPx: 0
      },
      snapshots
    });
  }
  return {
    root,
    summary: {
      status: "passed",
      sourceIdentity: { workspaceName: "Lotion Demo Space", directoryName: "Lotion Demo Space" },
      sourceFingerprint: { ...fingerprint },
      cloneFingerprint: { ...fingerprint },
      isolation: { symlinksAllowed: false, byteIdenticalAtClone: true },
      sourceSafety: { unchanged: true, before: { ...fingerprint }, after: { ...fingerprint } },
      viewports
    }
  };
}
