import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertDatabaseRowMenuArtifactContract } from "../scripts/lib/database-row-menu-artifacts.mjs";

test("database row menu artifact contract requires lifecycle, cross-view, and viewport evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-row-menu-artifacts-"));
  try {
    const viewports = [];
    for (const viewport of ["desktop", "compact"]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport }, metadata: { phase: "deleted-row" } }));
      viewports.push({
        viewport, menuActions: 7, keyboardMenu: true, rightClickIsolated: true,
        copyLink: true, rename: true, editProperties: true, crossView: true,
        focusHandles: true, duplicateBody: true, duplicateMetadata: true,
        duplicateIndependent: true, tombstoneReloaded: true, ghostPageRemoved: true,
        restoredBody: true, restoredMetadata: true, permanentDelete: true,
        menuRecovery: {
          message: "Injected row menu duplicate failure",
          menuRemainedOpen: true,
          duplicateSubmitSuppressed: true,
          failedStateRolledBack: true,
          retryCreatedExactlyOnce: true
        },
        restoreRecovery: {
          message: "Injected deleted row restore failure",
          dialogRemainedOpen: true,
          duplicateSubmitSuppressed: true,
          failedStateRolledBack: true,
          tombstoneRetained: true,
          retryRestoredExactlyOnce: true
        },
        noHorizontalOverflow: true, snapshot: { imagePath, metadataPath }
      });
    }
    const contract = await assertDatabaseRowMenuArtifactContract({ status: "passed", viewports });
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.imageBytesTotal, 1200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database row menu artifact contract rejects incomplete restore recovery proof", async () => {
  await assert.rejects(
    assertDatabaseRowMenuArtifactContract({
      status: "passed",
      viewports: ["desktop", "compact"].map((viewport) => ({
        viewport,
        menuActions: 7,
        ...Object.fromEntries([
          "keyboardMenu", "rightClickIsolated", "copyLink", "rename", "editProperties",
          "crossView", "focusHandles", "duplicateBody", "duplicateMetadata",
          "duplicateIndependent", "tombstoneReloaded", "ghostPageRemoved", "restoredBody",
          "restoredMetadata", "permanentDelete", "noHorizontalOverflow"
        ].map((flag) => [flag, true])),
        restoreRecovery: {
          message: "Injected deleted row restore failure",
          dialogRemainedOpen: true,
          duplicateSubmitSuppressed: true,
          failedStateRolledBack: false,
          tombstoneRetained: true,
          retryRestoredExactlyOnce: true
        },
        menuRecovery: {
          message: "Injected row menu duplicate failure",
          menuRemainedOpen: true,
          duplicateSubmitSuppressed: true,
          failedStateRolledBack: true,
          retryCreatedExactlyOnce: true
        }
      }))
    }),
    /restore recovery evidence incomplete/
  );
});

test("database row menu artifact contract rejects incomplete menu action recovery proof", async () => {
  await assert.rejects(
    assertDatabaseRowMenuArtifactContract({
      status: "passed",
      viewports: ["desktop", "compact"].map((viewport) => ({
        viewport,
        menuActions: 7,
        ...Object.fromEntries([
          "keyboardMenu", "rightClickIsolated", "copyLink", "rename", "editProperties",
          "crossView", "focusHandles", "duplicateBody", "duplicateMetadata",
          "duplicateIndependent", "tombstoneReloaded", "ghostPageRemoved", "restoredBody",
          "restoredMetadata", "permanentDelete", "noHorizontalOverflow"
        ].map((flag) => [flag, true])),
        menuRecovery: {
          message: "Injected row menu duplicate failure",
          menuRemainedOpen: true,
          duplicateSubmitSuppressed: true,
          failedStateRolledBack: false,
          retryCreatedExactlyOnce: true
        },
        restoreRecovery: {
          message: "Injected deleted row restore failure",
          dialogRemainedOpen: true,
          duplicateSubmitSuppressed: true,
          failedStateRolledBack: true,
          tombstoneRetained: true,
          retryRestoredExactlyOnce: true
        }
      }))
    }),
    /menu action recovery evidence incomplete/
  );
});
