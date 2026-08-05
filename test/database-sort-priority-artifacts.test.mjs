import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertDatabaseSortPriorityArtifactContract } from "../scripts/lib/database-sort-priority-artifacts.mjs";

test("database sort priority artifact contract requires reorder, type, and viewport evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-sort-priority-artifacts-"));
  try {
    const viewports = [];
    for (const viewport of ["desktop", "compact"]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport }, metadata: { phase: "reloaded-sort-priority" } }));
      viewports.push({
        viewport, typeLabels: true, keyboardPriority: true, dragPriority: true,
        moveControls: true, priorityChips: true, duplicatePrevented: true,
        clearAll: true, reloaded: true, optionOrderChangedResults: true,
        optionOrderPreservedCells: true, noHorizontalOverflow: true,
        before: ["row_task_2", "row_task_1", "row_task_3", "row_task_4"],
        after: ["row_task_4", "row_task_3", "row_task_2", "row_task_1"],
        snapshot: { imagePath, metadataPath }
      });
    }
    const contract = await assertDatabaseSortPriorityArtifactContract({ status: "passed", viewports });
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.imageBytesTotal, 1200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
