import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = join(repoRoot, "scripts", "validate-workspace-smoke.mjs");

test("workspace smoke ignores empty scaffolds but rejects partial databases", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-workspace-validator-"));
  const scaffold = join(root, "databases", "user", "Draft--db_draft");
  try {
    await Promise.all([
      mkdir(join(scaffold, "views"), { recursive: true }),
      mkdir(join(root, "databases", "system"), { recursive: true })
    ]);
    await writeFile(join(root, "lotion.json"), JSON.stringify({
      version: 1,
      spaceId: "sp_test",
      name: "Validator fixture",
      pages: [],
      databases: [],
      systemDatabases: []
    }), "utf8");

    const accepted = await execFileAsync(process.execPath, [validatorPath, root]);
    assert.match(accepted.stdout, /0 databases/);
    assert.match(accepted.stdout, /1 empty database scaffolds ignored/);

    const orphanedView = join(scaffold, "views", "view.json");
    await writeFile(orphanedView, "{}", "utf8");
    await assert.rejects(
      () => execFileAsync(process.execPath, [validatorPath, root]),
      (error) => {
        assert.match(error.stderr, /Draft--db_draft\/schema\.json exists/);
        assert.match(error.stderr, /Draft--db_draft\/data\.csv exists/);
        return true;
      }
    );
    await rm(orphanedView);

    await writeFile(join(scaffold, "schema.json"), JSON.stringify({
      id: "db_draft",
      name: "Draft",
      fields: []
    }), "utf8");
    await writeFile(join(root, "lotion.json"), JSON.stringify({
      version: 1,
      spaceId: "sp_test",
      name: "Validator fixture",
      pages: [],
      databases: ["db_draft"],
      systemDatabases: []
    }), "utf8");
    await assert.rejects(
      () => execFileAsync(process.execPath, [validatorPath, root]),
      (error) => {
        assert.match(error.stderr, /Draft--db_draft\/data\.csv exists/);
        return true;
      }
    );

    const acceptedGeneratedDatabase = await execFileAsync(process.execPath, [
      validatorPath,
      root,
      "--allow-missing-generated-data",
      "db_draft"
    ]);
    assert.match(acceptedGeneratedDatabase.stdout, /1 generated data files omitted/);

    await assert.rejects(
      () => execFileAsync(process.execPath, [
        validatorPath,
        root,
        "--allow-missing-generated-data",
        "db_other"
      ]),
      (error) => {
        assert.match(error.stderr, /Draft--db_draft\/data\.csv exists/);
        return true;
      }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
