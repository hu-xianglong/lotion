import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertRealWorkspaceSourceUnchanged,
  cleanupRealWorkspaceClone,
  cloneRealWorkspaceForSmoke,
  fingerprintWorkspace
} from "../scripts/lib/real-workspace-clone.mjs";

test("real workspace clone is byte-identical and clone writes remain isolated", async () => {
  const sourceRoot = await createWorkspace("isolated");
  let clone;
  try {
    clone = await cloneRealWorkspaceForSmoke(sourceRoot, { prefix: "lotion-clone-test-" });
    assert.equal(clone.sourceBefore.sha256, clone.cloneFingerprint.sha256);
    assert.equal(clone.isolation.byteIdenticalAtClone, true);
    await writeFile(join(clone.cloneRoot, "pages", "home.md"), "# Changed only in clone\n", "utf8");
    assert.equal(await readFile(join(sourceRoot, "pages", "home.md"), "utf8"), "# Home\n\nOriginal bytes.\n");
    const sourceSafety = await assertRealWorkspaceSourceUnchanged(clone);
    assert.equal(sourceSafety.unchanged, true);
    assert.notEqual((await fingerprintWorkspace(clone.cloneRoot)).sha256, clone.sourceBefore.sha256);
  } finally {
    await cleanupRealWorkspaceClone(clone);
    await rm(sourceRoot, { recursive: true, force: true });
  }
});

test("real workspace safety check detects source mutation", async () => {
  const sourceRoot = await createWorkspace("source-mutation");
  let clone;
  try {
    clone = await cloneRealWorkspaceForSmoke(sourceRoot);
    await writeFile(join(sourceRoot, "pages", "home.md"), "# Mutated source\n", "utf8");
    await assert.rejects(() => assertRealWorkspaceSourceUnchanged(clone), /source changed.*mismatch/i);
  } finally {
    await cleanupRealWorkspaceClone(clone);
    await rm(sourceRoot, { recursive: true, force: true });
  }
});

test("real workspace clone rejects missing manifests", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-invalid-workspace-"));
  try {
    await assert.rejects(() => cloneRealWorkspaceForSmoke(root), /missing lotion\.json/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("real workspace clone rejects symlinks instead of preserving external write paths", async () => {
  const sourceRoot = await createWorkspace("symlink");
  const externalRoot = await mkdtemp(join(tmpdir(), "lotion-external-target-"));
  try {
    await writeFile(join(externalRoot, "outside.md"), "outside", "utf8");
    await symlink(join(externalRoot, "outside.md"), join(sourceRoot, "pages", "outside.md"));
    await assert.rejects(() => cloneRealWorkspaceForSmoke(sourceRoot), /refuses symbolic link: pages\/outside\.md/);
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(externalRoot, { recursive: true, force: true });
  }
});

async function createWorkspace(name) {
  const root = await mkdtemp(join(tmpdir(), `lotion-real-workspace-${name}-`));
  await mkdir(join(root, "pages"), { recursive: true });
  await mkdir(join(root, "attachments"), { recursive: true });
  await writeFile(join(root, "lotion.json"), `${JSON.stringify({ version: 1, spaceId: `sp_${name}`, name: `Workspace ${name}`, pages: ["pg_home"], databases: [] }, null, 2)}\n`, "utf8");
  await writeFile(join(root, "pages", "home.md"), "# Home\n\nOriginal bytes.\n", "utf8");
  await writeFile(join(root, "attachments", "sample.bin"), Buffer.from([0, 1, 2, 3, 255]));
  return root;
}
