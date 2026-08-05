#!/usr/bin/env node
import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";

const VERIFICATION_REQUIRED_FROM_ORDER = 614;

export async function validateTaskDocs(root) {
  const tasksRoot = join(root, "tasks");
  const markdownFiles = await collectMarkdownFiles(tasksRoot);
  const failures = [];
  const taskSources = new Map();
  let referenceCount = 0;

  for (const filePath of markdownFiles) {
    const source = await readFile(filePath, "utf8");
    const displayPath = relative(root, filePath);
    taskSources.set(displayPath, source);
    for (const match of source.matchAll(/tasks\/(?:todo|wip|done)\/[A-Za-z0-9._/-]+\.md/g)) {
      referenceCount += 1;
      const referencedPath = match[0];
      try {
        await access(join(root, referencedPath));
      } catch {
        failures.push(`${displayPath}: missing task reference ${referencedPath}`);
      }
    }

    if (displayPath.startsWith("tasks/todo/") && /^Status:\s*(?:done|fixed|reverted)\s*$/m.test(source)) {
      failures.push(`${displayPath}: completed/reverted status must be moved out of tasks/todo`);
    }
  }

  const queuePath = join(tasksRoot, "QUEUE.md");
  const queueSource = await readFile(queuePath, "utf8");
  const queueOrders = new Set();
  let previousOrder = 0;
  let queueItemCount = 0;
  for (const line of queueSource.split("\n")) {
    const match = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|[^`]*`(tasks\/(?:todo|wip|done)\/[^`]+\.md)`/.exec(line);
    if (!match) continue;
    queueItemCount += 1;
    const order = Number(match[1]);
    const status = match[2].trim();
    const taskPath = match[3];
    if (queueOrders.has(order) || order <= previousOrder) {
      failures.push(`tasks/QUEUE.md: order ${order} is duplicated or not strictly increasing`);
    }
    queueOrders.add(order);
    previousOrder = order;
    const expectedPrefix = status === "done" ? "tasks/done/" : status === "ready" ? "tasks/todo/" : status === "wip" ? "tasks/wip/" : null;
    if (expectedPrefix && !taskPath.startsWith(expectedPrefix)) {
      failures.push(`tasks/QUEUE.md: ${status} item ${order} must reference ${expectedPrefix}`);
    }
    if (status === "blocked" && taskPath.startsWith("tasks/done/")) {
      failures.push(`tasks/QUEUE.md: blocked item ${order} cannot reference tasks/done/`);
    }
    if (status === "done" && order >= VERIFICATION_REQUIRED_FROM_ORDER) {
      validateVerificationRecord({ failures, order, source: taskSources.get(taskPath), taskPath });
    }
  }

  if (failures.length > 0) {
    throw new Error(`Task documentation validation failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  }

  return { markdownFileCount: markdownFiles.length, queueItemCount, referenceCount };
}

function validateVerificationRecord({ failures, order, source, taskPath }) {
  if (!source) return;
  if (!/^Verification status:\s*verified\s*$/m.test(source)) {
    failures.push(`tasks/QUEUE.md: done item ${order} must declare Verification status: verified in ${taskPath}`);
  }

  const lines = source.split("\n");
  const headingIndex = lines.findIndex((line) => line.trim() === "## Verification");
  if (headingIndex < 0) {
    failures.push(`tasks/QUEUE.md: done item ${order} must record a ## Verification section in ${taskPath}`);
    return;
  }
  const nextHeadingIndex = lines.findIndex((line, index) => index > headingIndex && /^##\s+/.test(line));
  const section = lines.slice(headingIndex + 1, nextHeadingIndex < 0 ? undefined : nextHeadingIndex).join("\n").trim();
  if (!/`[^`]+`|\b(?:audit|inspection|manual(?:ly)?|smoke|suite|test|workflow)\b|检查|测试/i.test(section)) {
    failures.push(`tasks/QUEUE.md: done item ${order} must record how it was verified in ${taskPath}`);
  }
  if (!/\b(?:confirm(?:ed)?|pass(?:ed)?|success(?:ful(?:ly)?)?|verified|zero (?:console )?errors?)\b|通过|无错误/i.test(section)) {
    failures.push(`tasks/QUEUE.md: done item ${order} must record the verification result in ${taskPath}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] || process.cwd());
  const result = await validateTaskDocs(root);
  console.log(`Task documentation validation passed: ${result.markdownFileCount} files, ${result.referenceCount} task references, ${result.queueItemCount} queue items.`);
}

async function collectMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectMarkdownFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath);
  }
  return files.sort();
}
