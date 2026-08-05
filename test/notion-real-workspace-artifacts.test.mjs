import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertNotionRealWorkspaceArtifactContract } from "../scripts/lib/notion-real-workspace-artifacts.mjs";

test("Notion real-workspace contract verifies native, seeded, modal, and source-safety evidence", async () => {
  const fixture = await createFixture();
  try {
    const contract = await assertNotionRealWorkspaceArtifactContract(fixture.summary, { minSourceBytes: 1, minSourceFiles: 1 });
    assert.equal(contract.status, "passed");
    assert.equal(contract.reproduceCommand, "npm run smoke:real-notion-import-ui");
    assert.equal(contract.staleToggleTargetMissing, true);
    assert.equal(contract.snapshotCount, 6);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Notion real-workspace contract rejects source mutation and unproven seeded media", async () => {
  const fixture = await createFixture();
  try {
    fixture.summary.sourceSafety.after.sha256 = "b".repeat(64);
    await assert.rejects(
      () => assertNotionRealWorkspaceArtifactContract(fixture.summary, { minSourceBytes: 1, minSourceFiles: 1 }),
      /source changed/
    );
    fixture.summary.sourceSafety.after.sha256 = fixture.summary.sourceSafety.before.sha256;
    fixture.summary.viewports[0].seededToggle.loadedImageCount = 0;
    await assert.rejects(
      () => assertNotionRealWorkspaceArtifactContract(fixture.summary, { minSourceBytes: 1, minSourceFiles: 1 }),
      /seeded toggle\/media evidence is incomplete/
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-notion-real-contract-"));
  const fingerprint = {
    kind: "lotion-real-workspace-fingerprint",
    workspaceName: "Notion Import",
    fileCount: 13_394,
    directoryCount: 456,
    totalBytes: 1_218_388_572,
    sha256: "a".repeat(64)
  };
  const viewports = [];
  for (const viewport of ["desktop", "compact"]) {
    const nativeVision = await stateWithSnapshot(root, viewport, "native-vision", {
      title: "2022敦促爸妈视力检查",
      provenance: "native-real-workspace",
      statusText: "状态: 完成",
      logHeadingVisible: true,
      openMs: 120,
      documentHorizontalOverflowPx: 0
    });
    const seededToggle = await stateWithSnapshot(root, viewport, "seeded-toggle-media", {
      title: "2022 爸妈视力检查",
      provenance: "clone-seeded-exact-importer-regression",
      summary: "收据",
      bodyText: "在美团上买了视力检查",
      toggleCount: 1,
      loadedImageCount: 1,
      summaryEditable: true,
      collapsed: true,
      reexpanded: true,
      postToggleLogVisible: true,
      openMs: 130,
      documentHorizontalOverflowPx: 0
    });
    const importModal = await stateWithSnapshot(root, viewport, "import-modal", {
      provenance: "native-real-workspace-plugin",
      documentHorizontalOverflowPx: 0,
      overlay: {
        title: "Import from Notion",
        modalRole: "dialog",
        ariaModal: "true",
        backdropCoversViewport: true,
        centerInsideModal: true,
        modalContainsPageTitle: false
      }
    });
    viewports.push({ viewport, workspaceName: "Notion Import", activeWorkspaceWasClone: true, nativeVision, seededToggle, importModal });
  }
  return {
    root,
    summary: {
      status: "passed",
      sourceIdentity: { workspaceName: "Notion Import", directoryName: "Notion Import" },
      sourceFingerprint: { ...fingerprint },
      cloneFingerprint: { ...fingerprint },
      isolation: { symlinksAllowed: false, byteIdenticalAtClone: true },
      sourceSafety: { unchanged: true, before: { ...fingerprint }, after: { ...fingerprint } },
      staleSource: { toggleTargetMissing: true, nativeVisionTitle: "2022敦促爸妈视力检查" },
      seededRegression: { title: "2022 爸妈视力检查", provenance: "clone-seeded-exact-importer-regression", seededInClone: true },
      viewports
    }
  };
}

async function stateWithSnapshot(root, viewport, phase, state) {
  const imagePath = join(root, `${viewport}-${phase}.png`);
  const metadataPath = join(root, `${viewport}-${phase}.json`);
  await writeFile(imagePath, `fake ${viewport} ${phase}`, "utf8");
  await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport }, metadata: { phase } }), "utf8");
  return { ...state, snapshot: { imagePath, metadataPath } };
}
