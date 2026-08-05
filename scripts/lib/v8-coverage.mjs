import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

export function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio ?? "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

export async function walkJavaScriptFiles(dir) {
  const out = [];
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkJavaScriptFiles(path));
    } else if (entry.isFile() && path.endsWith(".js")) {
      out.push(path);
    }
  }
  return out;
}

export async function collectCoverage(root, coverageDir, targetPaths) {
  const targetByUrl = new Map(targetPaths.map((target) => [pathToFileURL(target).href, target]));
  const coverageByUrl = new Map();

  for (const file of await readdir(coverageDir)) {
    if (!file.endsWith(".json")) continue;
    const payload = JSON.parse(await readFile(join(coverageDir, file), "utf8"));
    for (const result of payload.result ?? []) {
      if (!targetByUrl.has(result.url)) continue;
      const existing = coverageByUrl.get(result.url);
      coverageByUrl.set(result.url, mergeScriptCoverage(existing, result));
    }
  }

  const summary = [];
  for (const [url, path] of targetByUrl) {
    const source = await readFile(path, "utf8");
    const item = lineCoverage(root, path, source, coverageByUrl.get(url));
    summary.push(item);
  }
  return summary;
}

export function summarizeCoverage(summary) {
  const covered = summary.reduce((sum, item) => sum + item.covered, 0);
  const total = summary.reduce((sum, item) => sum + item.total, 0);
  return {
    covered,
    total,
    percent: total === 0 ? 100 : (covered / total) * 100
  };
}

export async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function mergeScriptCoverage(a, b) {
  if (!a) return b;
  const functions = [...(a.functions ?? [])];
  for (const incoming of b.functions ?? []) {
    const index = functions.findIndex((fn) => fn.functionName === incoming.functionName);
    if (index < 0) {
      functions.push(incoming);
      continue;
    }
    const existing = functions[index];
    const ranges = [...(existing.ranges ?? [])];
    for (const range of incoming.ranges ?? []) {
      const match = ranges.find((item) => item.startOffset === range.startOffset && item.endOffset === range.endOffset);
      if (match) match.count = Math.max(match.count, range.count);
      else ranges.push(range);
    }
    functions[index] = { ...existing, ranges };
  }
  return { ...a, functions };
}

function lineCoverage(root, path, source, scriptCoverage) {
  const executable = executableLines(source);
  const lineStarts = computeLineStarts(source);
  const ranges = [];
  for (const fn of scriptCoverage?.functions ?? []) {
    for (const range of fn.ranges ?? []) {
      ranges.push(range);
    }
  }

  let covered = 0;
  for (const line of executable) {
    if (isLineCovered(source, lineStarts, line, ranges)) covered += 1;
  }

  return {
    label: relative(root, path),
    covered,
    total: executable.length,
    percent: executable.length === 0 ? 100 : (covered / executable.length) * 100
  };
}

function executableLines(source) {
  const out = [];
  let inBlockComment = false;
  source.split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      return;
    }
    if (trimmed.startsWith("*")) return;
    if (trimmed === "{" || trimmed === "}" || trimmed === "};") return;
    if (trimmed.startsWith("//")) return;
    if (/^import\s/.test(trimmed)) return;
    if (/^export\s+(?:type\s+)?\{/.test(trimmed)) return;
    if (/^\}\s+from\s+/.test(trimmed)) return;
    out.push(index + 1);
  });
  return out;
}

function computeLineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function isLineCovered(source, lineStarts, line, ranges) {
  if (ranges.length === 0) return false;
  const lineStart = lineStarts[line - 1];
  const lineEnd = line < lineStarts.length ? lineStarts[line] : source.length;
  const text = source.slice(lineStart, lineEnd);
  const nonWhitespace = /\S/.exec(text);
  if (!nonWhitespace) return false;
  const offset = lineStart + nonWhitespace.index;
  const containing = ranges
    .filter((range) => range.startOffset <= offset && offset < range.endOffset)
    .sort((a, b) => rangeSize(a) - rangeSize(b));
  return containing.length > 0 && containing[0].count > 0;
}

function rangeSize(range) {
  return range.endOffset - range.startOffset;
}
