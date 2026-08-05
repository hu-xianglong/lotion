import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertDatabaseGroupingArtifactContract } from "../scripts/lib/database-grouping-artifacts.mjs";

test("database grouping artifact contract requires nested interactions and real viewport evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-grouping-artifacts-"));
  try {
    async function snapshot(viewport, width, height, phase) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport, width, height }, rect: { width, height }, metadata: { phase } }));
      return { imagePath, metadataPath };
    }
    const summary = {
      status: "passed",
      groupedTable: true, subgroupedTable: true, subgroupLocalNew: true,
      groupedList: true, subgroupedList: true, kanbanShared: true, kanbanLocalNew: true, collapsedReloaded: true,
      saveRecovery: {
        message: "Injected grouping save failure",
        dialogRemainedOpen: true,
        duplicateSubmitSuppressed: true,
        failedStateRolledBack: true,
        draftRetained: true,
        retryPersistedExactlyOnce: true
      },
      rowCreationRecovery: {
        message: "Injected grouped row creation failure",
        failedStateRolledBack: true,
        duplicateSubmitSuppressed: true,
        competingControlsBlocked: true,
        retryPersistedExactlyOnce: true,
        initialValuesAtomic: true
      },
      viewports: [{ name: "desktop" }, { name: "compact" }],
      tableSnapshot: await snapshot("desktop", 1440, 1000, "grouped-table"),
      compactSnapshot: await snapshot("compact", 1040, 820, "shared-kanban")
    };
    const contract = await assertDatabaseGroupingArtifactContract(summary);
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.imageBytesTotal, 1200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database grouping artifact contract rejects incomplete save recovery evidence", async () => {
  await assert.rejects(
    assertDatabaseGroupingArtifactContract({
      status: "passed",
      groupedTable: true, subgroupedTable: true, subgroupLocalNew: true,
      groupedList: true, subgroupedList: true, kanbanShared: true, kanbanLocalNew: true, collapsedReloaded: true,
      saveRecovery: {
        message: "Injected grouping save failure",
        dialogRemainedOpen: true,
        duplicateSubmitSuppressed: true,
        failedStateRolledBack: false,
        draftRetained: true,
        retryPersistedExactlyOnce: true
      },
      rowCreationRecovery: {
        message: "Injected grouped row creation failure",
        failedStateRolledBack: true,
        duplicateSubmitSuppressed: true,
        competingControlsBlocked: true,
        retryPersistedExactlyOnce: true,
        initialValuesAtomic: true
      }
    }),
    /save recovery evidence is incomplete/
  );
});

test("database grouping artifact contract rejects partial grouped-row creation recovery", async () => {
  await assert.rejects(
    assertDatabaseGroupingArtifactContract({
      status: "passed",
      groupedTable: true, subgroupedTable: true, subgroupLocalNew: true,
      groupedList: true, subgroupedList: true, kanbanShared: true, kanbanLocalNew: true, collapsedReloaded: true,
      saveRecovery: {
        message: "Injected grouping save failure",
        dialogRemainedOpen: true,
        duplicateSubmitSuppressed: true,
        failedStateRolledBack: true,
        draftRetained: true,
        retryPersistedExactlyOnce: true
      },
      rowCreationRecovery: {
        message: "Injected grouped row creation failure",
        failedStateRolledBack: false,
        duplicateSubmitSuppressed: true,
        competingControlsBlocked: true,
        retryPersistedExactlyOnce: true,
        initialValuesAtomic: true
      }
    }),
    /grouped-row creation recovery evidence is incomplete/
  );
});
