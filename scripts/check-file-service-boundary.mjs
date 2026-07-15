import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const mainRoot = join(root, "src", "main");
const builtinPluginsRoot = join(root, "src", "builtin-plugins");
const allowed = new Set([
  join("src", "main", "services", "file-service.ts")
]);

const violations = [];

for (const file of await listSourceFiles(mainRoot)) {
  const rel = relative(root, file).split("\\").join("/");
  if (allowed.has(rel)) continue;
  const text = await readFile(file, "utf8");
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/from\s+["']node:fs(?:\/promises)?["']/.test(line) || /require\(["'](?:node:)?fs(?:\/promises)?["']\)/.test(line)) {
      violations.push(`${rel}:${index + 1}: use fileService instead of direct fs import`);
    }
  }
}

for (const file of await listSourceFiles(builtinPluginsRoot)) {
  const rel = relative(root, file).split("\\").join("/");
  const text = await readFile(file, "utf8");
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/from\s+["'][^"']*renderer\/features\//.test(line)) {
      violations.push(`${rel}:${index + 1}: built-in plugins must not import renderer/features`);
    }
  }
}

if (violations.length > 0) {
  console.error("Boundary violations:");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

async function listSourceFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await listSourceFiles(full));
      continue;
    }
    if (entry.isFile() && /\.(?:ts|tsx|cts|mts)$/.test(entry.name)) out.push(full);
  }
  return out;
}
