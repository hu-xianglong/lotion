import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertDatabaseMultiViewArtifactContract } from "../scripts/lib/database-multi-view-artifacts.mjs";

test("database multi-view artifact contract requires lifecycle, focus, sidebar, and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-multi-view-artifacts-"));
  try {
    const viewports = [];
    for (const viewport of ["desktop", "compact"]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport }, metadata: { phase: "multi-view-overflow" } }));
      viewports.push({
        viewport,
        viewCount: 10,
        orderPersisted: true,
        keyboardFocusFollowed: true,
        sidebarViewsVerified: true,
        createViewFailureRecovery: {
          message: "Injected create view failure",
          dialogRemainedOpen: true,
          duplicateSubmitSuppressed: true,
          retryCreatedExactlyOne: true
        },
        viewOrderFailureRecovery: {
          message: "Injected view reorder failure",
          controlsBlockedUntilResolution: true,
          rollbackPreservedOrder: true,
          rollbackPreservedRevisions: true,
          duplicateDropSuppressed: true,
          retryPersistedExactlyOnce: true
        },
        snapshot: { imagePath, metadataPath }
      });
    }
    const contract = await assertDatabaseMultiViewArtifactContract({ status: "passed", viewports });
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.imageBytesTotal, 1200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database multi-view artifact contract rejects incomplete view-order recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-multi-view-order-artifacts-"));
  try {
    const viewports = [];
    for (const viewport of ["desktop", "compact"]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(600));
      await writeFile(metadataPath, JSON.stringify({ viewport: { name: viewport }, metadata: { phase: "multi-view-overflow" } }));
      viewports.push({
        viewport,
        viewCount: 10,
        orderPersisted: true,
        keyboardFocusFollowed: true,
        sidebarViewsVerified: true,
        createViewFailureRecovery: {
          message: "Injected create view failure",
          dialogRemainedOpen: true,
          duplicateSubmitSuppressed: true,
          retryCreatedExactlyOne: true
        },
        viewOrderFailureRecovery: {
          message: "Injected view reorder failure",
          controlsBlockedUntilResolution: true,
          rollbackPreservedOrder: true,
          rollbackPreservedRevisions: false,
          duplicateDropSuppressed: true,
          retryPersistedExactlyOnce: true
        },
        snapshot: { imagePath, metadataPath }
      });
    }
    await assert.rejects(
      () => assertDatabaseMultiViewArtifactContract({ status: "passed", viewports }),
      /view-order failure recovery evidence incomplete for desktop/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
