#!/usr/bin/env node
import { join, resolve } from "node:path";

import { createTestRelease, isDirectCliRun, runCommand } from "./lib/test-release.mjs";

if (isDirectCliRun(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const root = resolve(options.root);
  const outputRoot = resolve(options.outputRoot || join(root, "artifacts", "commit-apps"));
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  try {
    const result = await createTestRelease({
      gates: [
        { label: "npm run build", command: npmCommand, args: ["run", "build"] }
      ],
      outputRoot,
      prechecked: options.prechecked,
      root,
      logger: (message) => console.log(`[app:commit] ${message}`),
      runner: (command, args, runOptions) => runCommand(command, args, { ...runOptions, stdio: "inherit" })
    });
    const app = result.manifest.build.packagedApp;
    console.log(JSON.stringify({
      appPath: app ? join(result.releaseDir, app.path) : null,
      commit: result.manifest.git.sha,
      dirty: result.manifest.git.dirty,
      releaseDir: result.releaseDir,
      shortSha: result.manifest.git.shortSha
    }, null, 2));
  } catch (error) {
    console.error(error?.message || String(error));
    if (Array.isArray(error?.gateResults)) {
      console.error(JSON.stringify({ gateResults: error.gateResults }, null, 2));
    }
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  const options = {
    outputRoot: undefined,
    prechecked: false,
    root: process.cwd()
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--prechecked") {
      options.prechecked = true;
    } else if (arg === "--output-root") {
      options.outputRoot = args[index + 1];
      index += 1;
    } else if (arg === "--root") {
      options.root = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown app:commit argument: ${arg}`);
    }
  }
  return options;
}
