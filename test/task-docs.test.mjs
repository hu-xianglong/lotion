import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateTaskDocs } from "../scripts/test-task-docs.mjs";

test("task documentation validator accepts aligned queue state and references", async () => {
  const root = await taskFixture();
  try {
    await writeTask(root, "tasks/done/shipped.md", "# Shipped\n\nStatus: done\n");
    await writeTask(root, "tasks/todo/next.md", "# Next\n\nStatus: todo\n\nDepends on `tasks/done/shipped.md`.\n");
    await writeTask(root, "tasks/QUEUE.md", [
      "| Order | Status | Item | Source | Required Gates |",
      "| --- | --- | --- | --- | --- |",
      "| 1 | done | Shipped | `tasks/done/shipped.md` | test |",
      "| 2 | ready | Next | `tasks/todo/next.md` | test |"
    ].join("\n"));
    const result = await validateTaskDocs(root);
    assert.equal(result.queueItemCount, 2);
    assert.equal(result.referenceCount, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("task documentation validator rejects broken references and queue state drift", async () => {
  const root = await taskFixture();
  try {
    await writeTask(root, "tasks/todo/stale.md", "# Stale\n\nStatus: fixed\n\nSee `tasks/done/missing.md`.\n");
    await writeTask(root, "tasks/QUEUE.md", [
      "| Order | Status | Item | Source | Required Gates |",
      "| --- | --- | --- | --- | --- |",
      "| 2 | done | Wrong folder | `tasks/todo/stale.md` | test |",
      "| 2 | blocked | Duplicate | `tasks/done/missing.md` | test |"
    ].join("\n"));
    await assert.rejects(
      () => validateTaskDocs(root),
      /missing task reference[\s\S]*completed\/reverted status[\s\S]*done item 2 must reference tasks\/done\/[\s\S]*duplicated or not strictly increasing[\s\S]*blocked item 2 cannot reference tasks\/done\//
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("task documentation validator requires verification records for newly completed features", async () => {
  const root = await taskFixture();
  try {
    await writeTask(root, "tasks/done/unverified.md", "# Unverified\n\nStatus: done\n");
    await writeTask(root, "tasks/QUEUE.md", [
      "| Order | Status | Item | Source | Required Gates |",
      "| --- | --- | --- | --- | --- |",
      "| 614 | done | Unverified | `tasks/done/unverified.md` | test |"
    ].join("\n"));
    await assert.rejects(
      () => validateTaskDocs(root),
      /done item 614 must declare Verification status: verified[\s\S]*must record a ## Verification section/
    );

    await writeTask(root, "tasks/done/unverified.md", [
      "# Incomplete verification",
      "",
      "Status: done",
      "",
      "Verification status: verified",
      "",
      "## Verification",
      "",
      "Notes pending."
    ].join("\n"));
    await assert.rejects(
      () => validateTaskDocs(root),
      /done item 614 must record how it was verified[\s\S]*must record the verification result/
    );

    await writeTask(root, "tasks/done/unverified.md", [
      "# Verified",
      "",
      "Status: done",
      "",
      "Verification status: verified",
      "",
      "## Verification",
      "",
      "- `npm test` passed."
    ].join("\n"));
    const result = await validateTaskDocs(root);
    assert.equal(result.queueItemCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function taskFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-task-docs-"));
  await Promise.all([
    mkdir(join(root, "tasks", "done"), { recursive: true }),
    mkdir(join(root, "tasks", "todo"), { recursive: true }),
    mkdir(join(root, "tasks", "wip"), { recursive: true })
  ]);
  return root;
}

async function writeTask(root, relativePath, source) {
  await writeFile(join(root, relativePath), source, "utf8");
}
