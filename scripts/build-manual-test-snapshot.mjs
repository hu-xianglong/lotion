#!/usr/bin/env node
import { spawn } from "node:child_process";
import { chmod, cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(
  process.env.LOTION_SNAPSHOT_SOURCE_DIR ?? fileURLToPath(new URL("..", import.meta.url))
);
const sourceLabel = process.env.LOTION_SNAPSHOT_SOURCE_LABEL ?? sourceRoot;
const nodeModulesPath = resolve(
  process.env.LOTION_NODE_MODULES_DIR ?? findNodeModules(sourceRoot)
);
const electronBinary = join(nodeModulesPath, "electron/dist/Electron.app/Contents/MacOS/Electron");
const manualRoot = resolve(
  process.env.LOTION_MANUAL_TEST_ROOT ?? join(homedir(), "Documents", "Lotion Manual Test")
);
const workspacePath = join(manualRoot, "workspace");
const userDataDir = join(manualRoot, "user-data");
const snapshotRoot = join(manualRoot, "app-snapshot");
const nextRoot = join(manualRoot, "app-snapshot-next");
const launcherPath = join(manualRoot, "open-lotion-manual-test-snapshot.sh");
const appBundle = join(manualRoot, "Lotion Manual Test Snapshot.app");
const appletSourcePath = join(manualRoot, ".open-lotion-manual-test-snapshot.applescript");

function findNodeModules(start) {
  let current = start;
  while (true) {
    const candidate = join(current, "node_modules");
    if (existsSync(join(candidate, "electron"))) return candidate;
    const parent = dirname(current);
    if (parent === current) return candidate;
    current = parent;
  }
}

function requirePath(path, label) {
  if (!existsSync(path)) {
    console.error(`[snapshot] Missing ${label}: ${path}`);
    process.exit(1);
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`[snapshot] ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
    cwd: sourceRoot,
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function appleScriptString(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

async function writeExecutable(path, body) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, "utf8");
  await chmod(path, 0o755);
}

requirePath(sourceRoot, "Lotion source");
requirePath(join(sourceRoot, "package.json"), "package.json");
requirePath(join(workspacePath, "lotion.json"), "manual-test workspace");
requirePath(userDataDir, "manual-test user data");
requirePath(nodeModulesPath, "node_modules");
requirePath(electronBinary, "Electron binary");

await rm(nextRoot, { recursive: true, force: true });
await mkdir(nextRoot, { recursive: true });

console.log(`[snapshot] Source: ${sourceLabel}`);

await run("npx", ["tsc", "-p", "tsconfig.main.json", "--outDir", join(nextRoot, "dist-electron")]);
await run("npx", ["vite", "build", "--outDir", join(nextRoot, "dist/renderer"), "--emptyOutDir"]);

const packageJson = JSON.parse(await readFile(join(sourceRoot, "package.json"), "utf8"));
await writeFile(
  join(nextRoot, "package.json"),
  `${JSON.stringify({
    name: `${packageJson.name}-manual-test-snapshot`,
    version: packageJson.version,
    private: true,
    type: packageJson.type,
    main: packageJson.main
  }, null, 2)}\n`,
  "utf8"
);
await symlink(nodeModulesPath, join(nextRoot, "node_modules"), "dir");

await writeFile(
  join(nextRoot, "snapshot-info.json"),
  `${JSON.stringify({
    createdAt: new Date().toISOString(),
    source: sourceLabel,
    sourceRoot,
    workspace: workspacePath,
    userDataDir,
    electronBinary
  }, null, 2)}\n`,
  "utf8"
);

await rm(snapshotRoot, { recursive: true, force: true });
await cp(nextRoot, snapshotRoot, { recursive: true, force: true, dereference: false });
await rm(nextRoot, { recursive: true, force: true });

await writeExecutable(
  launcherPath,
  `#!/usr/bin/env bash
set -euo pipefail

APP=${shellQuote(snapshotRoot)}
USER_DATA=${shellQuote(userDataDir)}
ELECTRON=${shellQuote(electronBinary)}

cd "$APP"
exec "$ELECTRON" --user-data-dir="$USER_DATA" "$APP"
`
);

await rm(appBundle, { recursive: true, force: true });
await writeFile(
  appletSourcePath,
  `do shell script ${appleScriptString(`${shellQuote(launcherPath)} >/tmp/lotion-manual-test-open.log 2>&1 &`)}\n`,
  "utf8"
);
await run("/usr/bin/osacompile", ["-o", appBundle, appletSourcePath]);
await rm(appletSourcePath, { force: true });

console.log(`[snapshot] Created ${snapshotRoot}`);
console.log(`[snapshot] Launcher ${launcherPath}`);
console.log(`[snapshot] App ${appBundle}`);
