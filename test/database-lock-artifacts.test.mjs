import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertDatabaseLockArtifactContract } from "../scripts/lib/database-lock-artifacts.mjs";

test("database lock artifact contract requires backend, reload, editable rows, embedded unlock, and real viewports", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-database-lock-artifacts-"));
  try {
    const viewports = [];
    for (const [viewport, width, height] of [["desktop", 1440, 1000], ["compact", 1040, 820]]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport, width, height }, rect: { width, height }, metadata: { phase: "locked-embedded" } }));
      viewports.push({ viewport, backendStructuralBlocked: true, systemLockBlocked: true, rowCellEditable: true, rowCreateEditable: true, rowPageEditable: true, persistedAfterReload: true, fullViewLocked: true, embeddedViewLocked: true, embeddedRowEditable: true, embeddedUnlock: true, lockedReason: "Database is locked.", snapshot: { imagePath, metadataPath } });
    }
    const contract = await assertDatabaseLockArtifactContract({ status: "passed", viewports });
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.imageBytesTotal, 1200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
