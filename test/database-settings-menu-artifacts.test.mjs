import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertDatabaseSettingsMenuArtifactContract } from "../scripts/lib/database-settings-menu-artifacts.mjs";

test("database settings menu artifact contract validates interaction and snapshot evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-settings-menu-artifacts-"));
  try {
    const viewports = [];
    for (const viewport of ["desktop", "compact"]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport }, metadata: { phase: "view-settings-menu" } }));
      viewports.push({
        viewport,
        sheetFallback: viewport === "compact",
        keyboardNavigation: true,
        escapeLevels: 2,
        outsideDismissal: true,
        scopeLabelsVerified: true,
        pageOpenModePersisted: true,
        actionRecovery: {
          message: "Injected database settings failure",
          menuRemainedOpen: true,
          duplicateSubmitSuppressed: true,
          failedStateRolledBack: true,
          retryLockedExactlyOnce: true
        },
        systemDisabledReason: viewport === "desktop" ? "System database structure is managed by Lotion." : "not-run",
        noHorizontalOverflow: true,
        snapshot: { imagePath, metadataPath }
      });
    }
    const contract = await assertDatabaseSettingsMenuArtifactContract({ status: "passed", viewports });
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.imageBytesTotal, 1200);
    viewports[0].actionRecovery.failedStateRolledBack = false;
    await assert.rejects(
      assertDatabaseSettingsMenuArtifactContract({ status: "passed", viewports }),
      /failedStateRolledBack/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
