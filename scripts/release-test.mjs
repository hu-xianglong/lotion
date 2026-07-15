#!/usr/bin/env node
import { createTestRelease, isDirectCliRun, runCommand } from "./lib/test-release.mjs";

if (isDirectCliRun(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  try {
    const result = await createTestRelease({
      outputRoot: options.outputRoot,
      prechecked: options.prechecked,
      root: options.root,
      logger: (message) => console.log(`[release:test] ${message}`),
      runner: (command, args, runOptions) => runCommand(command, args, { ...runOptions, stdio: "inherit" })
    });
    console.log(JSON.stringify({
      releaseDir: result.releaseDir,
      manifestPath: result.manifestPath,
      testMode: result.manifest.test.mode,
      gateCount: result.gateResults.length,
      checksumCount: result.checksums.length
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
      throw new Error(`Unknown release:test argument: ${arg}`);
    }
  }
  return options;
}
