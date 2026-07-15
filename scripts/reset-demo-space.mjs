import { cp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const source = join(repoRoot, "samples", "demo-space");
const target = getDefaultSpacePath();

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });

console.log(`Reset Lotion demo space at ${target}`);

function getDefaultSpacePath() {
  const system = platform();
  if (system === "darwin") {
    return join(homedir(), "Library", "Application Support", "lotion", "default-space");
  }
  if (system === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "lotion", "default-space");
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "lotion", "default-space");
}
