import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertDatabaseAccessibilityArtifactContract } from "../scripts/lib/database-accessibility-artifacts.mjs";

test("database accessibility artifact contract requires keyboard, recovery, responsive, and real viewport evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-database-accessibility-artifacts-"));
  try {
    const viewports = [];
    for (const [viewport, width, height] of [["desktop", 1440, 1000], ["compact", 1040, 820]]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport, width, height }, rect: { left: 0, width, height }, metadata: { phase: "recoverable-errors" } }));
      viewports.push({ viewport, keyboardMenus: true, focusReturn: true, layeredEscape: true, singleMenuLayer: true, overflowMenuKeyboard: true, shortcuts: true, sortAutoFocus: true, viewFailureRecovery: true, rowDeleteFailureRecovery: true, rowUndoFailureRecovery: true, dangerConfirmation: true, screenReaderNames: true, responsiveMenu: true, noHorizontalOverflow: true, snapshot: { imagePath, metadataPath } });
    }
    const contract = await assertDatabaseAccessibilityArtifactContract({ status: "passed", viewports });
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.imageBytesTotal, 1200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
