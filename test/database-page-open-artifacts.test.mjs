import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertDatabasePageOpenArtifactContract } from "../scripts/lib/database-page-open-artifacts.mjs";

test("database page-open artifact contract requires every view, lifecycle invariant, and real viewport", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-open-artifacts-"));
  try {
    const viewports = [];
    for (const [viewport, width, height] of [["desktop", 1440, 1000], ["compact", 1040, 820]]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport, width, height }, rect: { width, height }, metadata: { phase: "center-peek" } }));
      viewports.push({
        viewport, sidePeek: true, centerPeek: true, fullPage: true, list: true,
        gallery: true, calendar: true, kanban: true, editShared: true,
        focusRestored: true, scrollPreserved: true, selectionPreserved: true,
        backClosesPeek: true, reloadTransientClear: true, deepLinkFullPage: true,
        snapshot: { imagePath, metadataPath }
      });
    }
    const contract = await assertDatabasePageOpenArtifactContract({ status: "passed", viewports });
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.imageBytesTotal, 1200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
