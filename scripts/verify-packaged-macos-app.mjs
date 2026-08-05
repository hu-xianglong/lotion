#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { parseArgs, promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const {
  values: {
    arch = process.arch,
    output = join(root, "artifacts", "production-release")
  }
} = parseArgs({
  options: {
    arch: { type: "string" },
    output: { type: "string" }
  }
});

assert.ok(["arm64", "x64"].includes(arch), `Unsupported architecture: ${arch}`);

async function collectFiles(directory, predicate) {
  const matches = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...await collectFiles(path, predicate));
    } else if (predicate(path)) {
      matches.push(path);
    }
  }
  return matches;
}

const archives = await readdir(output);
const dmgName = archives.find((name) => name.endsWith(`-${arch}.dmg`));
const zipName = archives.find((name) => name.endsWith(`-${arch}.zip`));
assert.ok(dmgName, `Missing ${arch} DMG in ${output}`);
assert.ok(zipName, `Missing ${arch} ZIP in ${output}`);

await execFileAsync("hdiutil", ["verify", join(output, dmgName)]);
const extractedRoot = await mkdtemp(join(tmpdir(), "lotion-packaged-archive-"));
await execFileAsync("ditto", ["-x", "-k", join(output, zipName), extractedRoot]);

const appPath = join(extractedRoot, "Lotion.app");
const contents = join(appPath, "Contents");
const executable = join(contents, "MacOS", "Lotion");
const resources = join(contents, "Resources");
const appAsar = join(resources, "app.asar");
const infoPlist = join(contents, "Info.plist");
const { stdout: iconFileOutput } = await execFileAsync(
  "/usr/libexec/PlistBuddy",
  ["-c", "Print :CFBundleIconFile", infoPlist]
);
const iconFile = iconFileOutput.trim();

await Promise.all([
  stat(executable),
  stat(join(resources, iconFile)),
  stat(appAsar)
]);

const { stdout: fileDescription } = await execFileAsync("file", [executable]);
const expectedMachine = arch === "arm64" ? "arm64" : "x86_64";
assert.match(fileDescription, new RegExp(expectedMachine), `${basename(executable)} does not contain ${expectedMachine}`);

await execFileAsync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);

const nativeModules = await collectFiles(`${appAsar}.unpacked`, (path) => path.endsWith(".node"));
const ripgrepBinaries = await collectFiles(
  `${appAsar}.unpacked`,
  (path) => path.includes("@vscode/ripgrep-") && basename(path) === "rg"
);
const lanceDbPackageRoot = dirname(dirname(require.resolve("@lancedb/lancedb")));
const lanceDbPackage = JSON.parse(await readFile(join(lanceDbPackageRoot, "package.json"), "utf8"));
const lanceDbNativePackage = `@lancedb/lancedb-darwin-${arch}`;
const expectsNativeModules = Boolean(lanceDbPackage.optionalDependencies?.[lanceDbNativePackage]);
if (expectsNativeModules) {
  assert.ok(
    nativeModules.length > 0,
    `Packaged app is missing the declared ${lanceDbNativePackage} native module`
  );
}
assert.ok(ripgrepBinaries.length > 0, "Packaged app is missing the ripgrep executable");
const { stdout: ripgrepVersion } = await execFileAsync(ripgrepBinaries[0], ["--version"]);
assert.match(ripgrepVersion, /^ripgrep \d+/m, "Packaged ripgrep executable did not start");

const userData = await mkdtemp(join(tmpdir(), "lotion-packaged-smoke-"));
let stderr = "";
const child = spawn(executable, [], {
  env: {
    ...process.env,
    LOTION_USER_DATA_DIR: userData
  },
  stdio: ["ignore", "ignore", "pipe"]
});
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

try {
  const earlyExit = await Promise.race([
    new Promise((resolveExit) => child.once("exit", (code, signal) => resolveExit({ code, signal }))),
    new Promise((resolveWait) => setTimeout(() => resolveWait(null), 4000))
  ]);
  assert.equal(
    earlyExit,
    null,
    `Packaged Lotion exited during startup (${JSON.stringify(earlyExit)}):\n${stderr}`
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((resolveExit) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveExit();
      return;
    }
    const forceTimer = setTimeout(() => {
      child.kill("SIGKILL");
      resolveExit();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(forceTimer);
      resolveExit();
    });
  });
  await rm(userData, { recursive: true, force: true });
  await rm(extractedRoot, { recursive: true, force: true });
}

console.log(`Verified ${zipName} and ${dmgName}`);
console.log(`Architecture: ${arch}`);
console.log(
  `Native modules: ${nativeModules.length}${expectsNativeModules ? "" : ` (${lanceDbNativePackage} is not published by LanceDB)`}`
);
