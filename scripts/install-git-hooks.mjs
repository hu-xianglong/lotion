#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  encoding: "utf8",
  stdio: "pipe"
});

if (result.status !== 0) {
  const message = result.stderr.trim() || result.stdout.trim() || "git config failed";
  throw new Error(`Unable to install Git hooks: ${message}`);
}

console.log("Installed Lotion Git hooks: core.hooksPath=.githooks");
