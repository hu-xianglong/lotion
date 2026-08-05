import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertDatabaseViewMenuArtifactContract } from "../scripts/lib/database-view-menu-artifacts.mjs";

test("database view-menu artifact contract requires lifecycle, isolation, validation, and screenshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-view-menu-artifacts-"));
  try {
    const viewports = [];
    for (const viewport of ["desktop", "compact"]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport }, metadata: { phase: "view-menu-lifecycle" } }));
      viewports.push({
        viewport,
        inactiveRightClickIsolated: true,
        uniqueRenameValidated: true,
        renameEscapeStayedInMenu: true,
        renamed: true,
        duplicated: true,
        actionRecovery: {
          message: "Injected view menu failure",
          menuRemainedOpen: true,
          duplicateSubmitSuppressed: true,
          retryCreatedExactlyOne: true
        },
        deepLink: "lotion://database/db_tasks?view=view_default",
        defaultDeleteRecovered: true,
        noHorizontalOverflow: true,
        snapshot: { imagePath, metadataPath }
      });
    }
    const contract = await assertDatabaseViewMenuArtifactContract({ status: "passed", viewports });
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.imageBytesTotal, 1200);
    viewports[0].actionRecovery.duplicateSubmitSuppressed = false;
    await assert.rejects(
      assertDatabaseViewMenuArtifactContract({ status: "passed", viewports }),
      /duplicateSubmitSuppressed/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
