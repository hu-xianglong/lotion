#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { collectCoverage, run } from "./lib/v8-coverage.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const coverageDir = await mkdtemp(join(tmpdir(), "lotion-api-coverage-"));
const threshold = Number(process.env.LOTION_CUSTOMER_API_COVERAGE_THRESHOLD ?? "90");
const targets = [join(root, "dist-electron/main/customer-api.js")];

try {
  await run(process.execPath, ["--test", "test/customer-api.test.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_V8_COVERAGE: coverageDir
    }
  });

  const summary = await collectCoverage(root, coverageDir, targets);
  for (const item of summary) {
    console.log(
      `${item.label}: ${item.percent.toFixed(1)}% line coverage (${item.covered}/${item.total})`
    );
    assert.ok(
      item.percent >= threshold,
      `${item.label} coverage ${item.percent.toFixed(1)}% is below ${threshold}%`
    );
  }
} finally {
  await rm(coverageDir, { recursive: true, force: true });
}
