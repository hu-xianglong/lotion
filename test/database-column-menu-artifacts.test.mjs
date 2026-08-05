import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertDatabaseColumnMenuArtifactContract } from "../scripts/lib/database-column-menu-artifacts.mjs";

test("database column menu artifact contract requires every operation lane and viewport snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-column-menu-artifacts-"));
  try {
    const viewports = [];
    for (const viewport of ["desktop", "compact"]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport }, metadata: { phase: "frozen-column-menu" } }));
      viewports.push({
        viewport,
        menuActions: 13,
        frozenBodyCells: 4,
        keyboardNavigation: true,
        editOpened: true,
        renamed: true,
        sortTargeted: true,
        filterTargeted: true,
        calculationSet: true,
        wrapToggled: true,
        hiddenInView: true,
        duplicateReloaded: true,
        insertedBothSides: true,
        frozenDuringScroll: true,
        unfreezePersisted: true,
        deleteRecoverable: true,
        protectedTitle: true,
        resizeIsolation: true,
        dragIsolation: true,
        reloadPersisted: true,
        noHorizontalOverflow: true,
        actionRecovery: {
          message: "Injected column menu failure",
          menuRemainedOpen: true,
          duplicateSubmitSuppressed: true,
          failedStateRolledBack: true,
          retryCreatedExactlyOnce: true
        },
        snapshot: { imagePath, metadataPath }
      });
    }
    const contract = await assertDatabaseColumnMenuArtifactContract({ status: "passed", viewports });
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.imageBytesTotal, 1200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database column menu artifact contract rejects incomplete recovery proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-column-menu-recovery-artifacts-"));
  try {
    const viewports = [];
    for (const viewport of ["desktop", "compact"]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport }, metadata: { phase: "frozen-column-menu" } }));
      viewports.push({
        viewport,
        menuActions: 13,
        frozenBodyCells: 4,
        ...Object.fromEntries([
          "keyboardNavigation", "editOpened", "renamed", "sortTargeted", "filterTargeted",
          "calculationSet", "wrapToggled", "hiddenInView", "duplicateReloaded", "insertedBothSides",
          "frozenDuringScroll", "unfreezePersisted", "deleteRecoverable", "protectedTitle",
          "resizeIsolation", "dragIsolation", "reloadPersisted", "noHorizontalOverflow"
        ].map((flag) => [flag, true])),
        actionRecovery: {
          message: "Injected column menu failure",
          menuRemainedOpen: true,
          duplicateSubmitSuppressed: true,
          failedStateRolledBack: false,
          retryCreatedExactlyOnce: true
        },
        snapshot: { imagePath, metadataPath }
      });
    }
    await assert.rejects(
      assertDatabaseColumnMenuArtifactContract({ status: "passed", viewports }),
      /recovery evidence incomplete/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
