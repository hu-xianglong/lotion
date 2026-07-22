#!/usr/bin/env node
import { resolve } from "node:path";

import {
  TestReleaseGateError,
  collectGitInfo,
  createTestRelease,
  isDirectCliRun,
  runCommand,
  runReleaseGates
} from "./lib/test-release.mjs";
import { COMMIT_QUALITY_GATES, RELEASE_QUALITY_GATES } from "./lib/quality-gates.mjs";

if (isDirectCliRun(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const root = resolve(options.root);
  try {
    if (options.quick) {
      const gates = await runReleaseGates({
        cwd: root,
        gates: COMMIT_QUALITY_GATES,
        logger: (message) => console.log(`[gate:commit] ${message}`),
        runner: inheritedRunner
      });
      console.log(JSON.stringify({ gateCount: gates.length, mode: "commit", status: "passed" }, null, 2));
      process.exit(0);
    }

    const gitInfo = await collectGitInfo(root);
    if (gitInfo.dirty && !options.allowDirty) {
      throw new Error("release:gate requires a clean worktree. Commit the intended source or pass --allow-dirty for a local diagnostic run.");
    }
    const result = await createTestRelease({
      gates: RELEASE_QUALITY_GATES,
      gitInfo,
      outputRoot: options.outputRoot,
      prechecked: options.prechecked,
      root,
      logger: (message) => console.log(`[release:gate] ${message}`),
      runner: inheritedRunner
    });
    console.log(JSON.stringify({
      appPath: result.manifest.build.packagedApp?.path || null,
      gateCount: result.gateResults.length,
      manifestPath: result.manifestPath,
      packageVerification: result.manifest.build.verification?.status || "not-run",
      releaseDir: result.releaseDir,
      status: "passed"
    }, null, 2));
  } catch (error) {
    console.error(error?.message || String(error));
    if (error instanceof TestReleaseGateError || Array.isArray(error?.gateResults)) {
      console.error(JSON.stringify({ gateResults: error.gateResults || [] }, null, 2));
    }
    process.exitCode = 1;
  }
}

function inheritedRunner(command, args, runOptions) {
  return runCommand(command, args, { ...runOptions, stdio: "inherit" });
}

function parseArgs(args) {
  const options = {
    allowDirty: false,
    outputRoot: undefined,
    prechecked: false,
    quick: false,
    root: process.cwd()
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--allow-dirty") {
      options.allowDirty = true;
    } else if (arg === "--prechecked") {
      options.prechecked = true;
    } else if (arg === "--quick") {
      options.quick = true;
    } else if (arg === "--output-root") {
      options.outputRoot = args[index + 1];
      index += 1;
    } else if (arg === "--root") {
      options.root = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown release:gate argument: ${arg}`);
    }
  }
  return options;
}
