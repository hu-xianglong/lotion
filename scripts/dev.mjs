import { spawn, spawnSync } from "node:child_process";

const cdpPort = process.env.LOTION_CDP_PORT || "9222";
const vitePort = process.env.LOTION_VITE_PORT || "5173";
const devServerUrl = `http://127.0.0.1:${vitePort}`;
const skipStrayKill = process.env.LOTION_DEV_SKIP_STRAY_KILL === "1";
const userDataDir = process.env.LOTION_ELECTRON_USER_DATA_DIR || "";

// Kill any stragglers from a previous `npm run dev` that wasn't shut
// down cleanly (e.g. terminal closed without Ctrl-C). Each pattern
// targets exactly one of our three child processes — we deliberately
// avoid pkill -f "Electron" alone because that would also kill VS Code
// or any other Electron app on the system.
const STRAY_PATTERNS = [
  `electron --remote-debugging-port=${cdpPort}`,
  `vite --host 127.0.0.1 --port ${vitePort}`,
  "tsc -p tsconfig.main.json --watch"
];
if (!skipStrayKill) {
  for (const pattern of STRAY_PATTERNS) {
    spawnSync("pkill", ["-9", "-f", pattern], { stdio: "ignore" });
  }
}

const vite = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", vitePort, "--strictPort"], {
  stdio: "inherit",
  shell: true
});

const tsc = spawn("npx", ["tsc", "-p", "tsconfig.main.json", "--watch", "--preserveWatchOutput"], {
  stdio: "inherit",
  shell: true
});

let electron;

setTimeout(() => {
  // --remote-debugging-port lets external tools (Playwright,
  // chrome-remote-interface) attach to the renderer's CDP — used by
  // scripts/snap.mjs for self-test screenshots.
  const electronArgs = ["electron", `--remote-debugging-port=${cdpPort}`];
  if (userDataDir) electronArgs.push(`--user-data-dir=${userDataDir}`);
  electronArgs.push(".");
  electron = spawn("npx", electronArgs, {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devServerUrl
    }
  });
}, 1800);

function stop() {
  vite.kill();
  tsc.kill();
  electron?.kill();
}

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
