import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertDatabasePropertyManagerArtifactContract,
  assertFieldSettingsRecoveryEvidence
} from "../scripts/lib/database-property-manager-artifacts.mjs";

test("database property manager artifact contract requires scoped creation, reorder, editor, and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-property-manager-artifacts-"));
  try {
    const viewports = [];
    for (const viewport of ["desktop", "compact"]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport }, metadata: { phase: "property-manager" } }));
      viewports.push({
        viewport,
        search: true,
        currentVisibility: true,
        allVisibility: true,
        hiddenVisibility: true,
        reordered: true,
        focusedEditor: true,
        noHorizontalOverflow: true,
        mutationRecovery: {
          message: "Could not persist database: Injected property manager failure",
          dialogRemainedOpen: true,
          duplicateSubmitSuppressed: true,
          retryCreatedExactlyOne: true
        },
        fieldSettingsRecovery: {
          message: "Could not persist database: Injected field settings persistence failure",
          dialogRemainedOpen: true,
          failedMutationRolledBack: true,
          draftRetained: true,
          duplicateSubmitSuppressed: true,
          pendingDismissalBlocked: true,
          retryDismissalBlocked: true,
          retryCommittedExactlyOnce: true,
          competingHideSuppressed: true
        },
        snapshot: { imagePath, metadataPath }
      });
    }
    const contract = await assertDatabasePropertyManagerArtifactContract({ status: "passed", viewports });
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.imageBytesTotal, 1200);

    viewports[0].mutationRecovery.duplicateSubmitSuppressed = false;
    await assert.rejects(
      () => assertDatabasePropertyManagerArtifactContract({ status: "passed", viewports }),
      /mutation recovery evidence incomplete for desktop/
    );

    viewports[0].mutationRecovery.duplicateSubmitSuppressed = true;
    viewports[0].fieldSettingsRecovery.failedMutationRolledBack = false;
    await assert.rejects(
      () => assertDatabasePropertyManagerArtifactContract({ status: "passed", viewports }),
      /field settings recovery evidence incomplete for desktop/
    );
    assert.throws(
      () => assertFieldSettingsRecoveryEvidence({
        ...viewports[1].fieldSettingsRecovery,
        retryCommittedExactlyOnce: false
      }, "compact"),
      /field settings recovery evidence incomplete for compact/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
