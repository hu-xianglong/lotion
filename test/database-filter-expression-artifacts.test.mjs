import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertDatabaseFilterExpressionArtifactContract } from "../scripts/lib/database-filter-expression-artifacts.mjs";

test("database filter expression artifact contract requires typed lanes and real viewport snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-filter-expression-artifacts-"));
  try {
    const viewports = [];
    for (const viewport of ["desktop", "compact"]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport }, metadata: { phase: "nested-filter-reload" } }));
      viewports.push({
        viewport, resultCount: 2, nestedExpression: true, selectEditor: true,
        multiSelectEditor: true, checkboxEditor: true, numberEditor: true,
        relativeDateEditor: true, textEditor: true, invalidBlocked: true,
        depthLimit: true, filterChips: true, explicitRemoval: true, clearAll: true,
        reloaded: true, noHorizontalOverflow: true, snapshot: { imagePath, metadataPath }
      });
    }
    const contract = await assertDatabaseFilterExpressionArtifactContract({ status: "passed", viewports });
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.imageBytesTotal, 1200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
