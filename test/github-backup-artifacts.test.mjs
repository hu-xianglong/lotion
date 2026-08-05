import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertGitHubBackupArtifactContract } from "../scripts/lib/github-backup-artifacts.mjs";

test("GitHub Backup artifact contract accepts complete local-mock preview and restore evidence", async () => {
  const fixture = await artifactFixture();
  try {
    const contract = await assertGitHubBackupArtifactContract(fixture.summary, {
      expectedViewportNames: ["compact"]
    });
    assert.equal(contract.status, "passed");
    assert.equal(contract.snapshotCount, 1);
    assert.equal(contract.snapshots[0].historyCount, 2);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("GitHub Backup artifact contract rejects internal restore-preview paths", async () => {
  const fixture = await artifactFixture();
  try {
    fixture.summary.viewports[0].preview.previewLabel =
      "lotion-backups/pages/backup-history-page--pg_backup_history.md";
    fixture.summary.viewports[0].preview.storageLeakMatches = ["lotion-backups/"];
    await assert.rejects(
      () => assertGitHubBackupArtifactContract(fixture.summary, { expectedViewportNames: ["compact"] }),
      /storage identity leak|logical preview identity/
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("GitHub Backup artifact contract rejects transparent false-positive screenshots", async () => {
  const fixture = await artifactFixture({ snapshotOpacity: "0" });
  try {
    await assert.rejects(
      () => assertGitHubBackupArtifactContract(fixture.summary, { expectedViewportNames: ["compact"] }),
      /clipped or incomplete snapshot state/
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("GitHub Backup artifact contract rejects a missing required committed baseline", async () => {
  const fixture = await artifactFixture();
  try {
    await assert.rejects(
      () => assertGitHubBackupArtifactContract(fixture.summary, {
        expectedViewportNames: ["compact"],
        requiredPerceptualBaselineViewportNames: ["compact"]
      }),
      /missing committed restore-preview baseline/
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function artifactFixture({ snapshotOpacity = "1" } = {}) {
  const root = await mkdtemp(join(tmpdir(), "lotion-github-backup-artifacts-"));
  const imagePath = join(root, "github-backup-restore-preview-compact.png");
  const metadataPath = join(root, "github-backup-restore-preview-compact.json");
  const preview = previewState();
  const overlay = {
    title: "GitHub Backup",
    modalRole: "dialog",
    ariaModal: "true",
    backdropCoversViewport: true,
    centerInsideModal: true,
    modalContainsPageTitle: false,
    modalInsideViewport: true,
    bodyOwnsVerticalScroll: true
  };
  const completeSurface = {
    modalRect: usableRect(20, 20, 960, 900),
    panelRect: usableRect(40, 80, 922, 820),
    formRect: usableRect(40, 160, 540, 300),
    stateRect: usableRect(600, 160, 362, 300),
    historyRect: usableRect(40, 480, 922, 190),
    previewRect: usableRect(40, 690, 922, 200),
    panelInsideModal: true,
    formInsidePanel: true,
    stateInsidePanel: true,
    historyInsidePanel: true,
    previewInsidePanel: true,
    visibility: "visible",
    opacity: "1"
  };
  await writeFile(imagePath, "fake GitHub Backup screenshot", "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    viewport: { name: "compact", width: 1040, height: 820 },
    metadata: {
      phase: "github-backup-restore-preview",
      overlay,
      preview: { ...preview, opacity: snapshotOpacity },
      completeSurface
    }
  }, null, 2)}\n`, "utf8");
  return {
    root,
    summary: {
      status: "passed",
      viewports: [{
        viewport: "compact",
        initial: { status: "History empty", historyCount: 0 },
        backups: { status: "Backed up", commitCount: 2, historyCount: 2 },
        overlay,
        preview,
        restore: {
          confirmation: "Restore Backup History Page from 2026-06-11T12:00:00.000Z?",
          message: "Page restored from selected version.",
          persisted: true,
          previewCleared: true
        },
        notConfigured: { status: "Not configured" },
        noHorizontalOverflow: true,
        snapshot: { imagePath, metadataPath }
      }]
    }
  };
}

function previewState() {
  return {
    modalRect: usableRect(40, 50, 960, 720),
    panelRect: usableRect(60, -70, 922, 820),
    statusRect: usableRect(890, -70, 85, 26),
    selectedRect: usableRect(74, 466, 892, 51),
    previewRect: usableRect(60, 548, 922, 203),
    previewLabelRect: usableRect(74, 590, 272, 19),
    restoreButtonRect: usableRect(790, 563, 174, 35),
    diffRect: usableRect(74, 620, 892, 115),
    status: "Backed up",
    historyCount: 2,
    selectedCount: 1,
    previewLabel: "Page snapshot · Backup History Page",
    restoreButtonText: "Restore this version",
    diffLineCount: 5,
    addedLineCount: 1,
    removedLineCount: 1,
    storageLeakMatches: [],
    selectedInsideModal: true,
    previewInsideModal: true,
    previewLabelInsidePreview: true,
    restoreInsidePreview: true,
    diffInsidePreview: true,
    horizontalOverflow: 0,
    visibility: "visible",
    opacity: "1"
  };
}

function usableRect(left, top, width, height) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  };
}
