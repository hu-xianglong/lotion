import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertDatabaseBulkSelectionArtifactContract } from "../scripts/lib/database-bulk-selection-artifacts.mjs";

test("database bulk selection artifact contract requires lifecycle, scope, virtualization, and viewport evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-bulk-selection-artifacts-"));
  try {
    const viewports = [];
    for (const viewport of ["desktop", "compact"]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport }, metadata: { phase: "bulk-deleted" } }));
      viewports.push({
        viewport, virtualRange: 120, atomicEdit: true, modifierToggle: true,
        escapeClear: true, viewScopeClear: true, typedEditors: true, duplicate: true,
        duplicateBody: true, duplicateMetadata: true, recoverableDelete: true,
        ghostPageRemoved: true, restoredBody: true, restoredMetadata: true,
        mutationRecovery: {
          message: "Could not persist database: Injected bulk row persistence failure",
          selectionRetained: true,
          failedMutationRolledBack: true,
          duplicateSubmitSuppressed: true,
          retryCreatedExactlyOnce: true
        },
        noHorizontalOverflow: true, snapshot: { imagePath, metadataPath }
      });
    }
    const contract = await assertDatabaseBulkSelectionArtifactContract({ status: "passed", viewports });
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.imageBytesTotal, 1200);
    viewports[0].mutationRecovery.failedMutationRolledBack = false;
    await assert.rejects(
      () => assertDatabaseBulkSelectionArtifactContract({ status: "passed", viewports }),
      /bulk row mutation recovery evidence incomplete for desktop/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
