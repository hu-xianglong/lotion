#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(
  process.env.LOTION_REPO_ROOT ?? fileURLToPath(new URL("..", import.meta.url))
);
const manualRoot = resolve(
  process.env.LOTION_MANUAL_TEST_ROOT ?? join(homedir(), "Documents", "Lotion Manual Test")
);
const workspacePath = join(manualRoot, "workspace");
const userDataDir = join(manualRoot, "user-data");
const vitePort = process.env.LOTION_MANUAL_VITE_PORT ?? "5273";
const cdpPort = process.env.LOTION_MANUAL_CDP_PORT ?? "9322";
const devServerUrl = `http://localhost:${vitePort}`;
const children = new Set();

function requirePath(path, label) {
  if (!existsSync(path)) {
    console.error(`[manual-test] Missing ${label}: ${path}`);
    process.exit(1);
  }
}

function spawnChild(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
    env: {
      ...process.env,
      ...options.env
    }
  });

  children.add(child);
  child.once("exit", () => children.delete(child));
  child.once("error", (error) => {
    console.error(`[manual-test] Failed to start ${label}: ${error.message}`);
    stop(1);
  });
  return child;
}

function stop(exitCode = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(exitCode);
}

async function waitForVite() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(devServerUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still starting.
    }
    await delay(300);
  }
  console.error(`[manual-test] Vite did not become ready at ${devServerUrl}`);
  stop(1);
}

requirePath(repoRoot, "Lotion repo");
requirePath(workspacePath, "manual-test workspace");
requirePath(join(workspacePath, "lotion.json"), "manual-test workspace metadata");
requirePath(userDataDir, "manual-test user data directory");

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

console.log(`[manual-test] Workspace: ${workspacePath}`);
console.log(`[manual-test] User data: ${userDataDir}`);
console.log(`[manual-test] Vite: ${devServerUrl}`);
console.log(`[manual-test] CDP: http://127.0.0.1:${cdpPort}`);

spawnChild("Vite", "npx", ["vite", "--host", "localhost", "--port", vitePort, "--strictPort"]);
spawnChild("TypeScript watcher", "npx", [
  "tsc",
  "--watch",
  "--project",
  "tsconfig.main.json",
  "--preserveWatchOutput"
]);

await waitForVite();

const electron = spawnChild(
  "Electron",
  "npx",
  ["electron", `--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`, "."],
  {
    env: {
      VITE_DEV_SERVER_URL: devServerUrl
    }
  }
);

electron.once("exit", (code) => {
  stop(code ?? 0);
});
