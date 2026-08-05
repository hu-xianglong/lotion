import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertDatabasePropertyRestoreArtifactContract } from "../scripts/lib/database-property-restore-artifacts.mjs";

test("database property restore artifact contract requires recovery, dependency, permanent-delete, and snapshot evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-property-restore-artifacts-"));
  try {
    const viewports = [];
    for (const viewport of ["desktop", "compact"]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport }, metadata: { phase: "deleted-property" } }));
      viewports.push({
        viewport,
        tombstoneReloaded: true,
        valueRestored: true,
        positionRestored: true,
        viewStateRestored: true,
        dependencyProtected: true,
        permanentDeleteConfirmed: true,
        permanentDeleted: true,
        systemProtected: true,
        noHorizontalOverflow: true,
        snapshot: { imagePath, metadataPath }
      });
    }
    const contract = await assertDatabasePropertyRestoreArtifactContract({ status: "passed", viewports });
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.imageBytesTotal, 1200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
