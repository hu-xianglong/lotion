import { dirname, resolve } from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import {
  hasNotionPageBodyContent,
  parseNotionHtmlBody,
  parseNotionHtmlMetadata
} from "./notion-html-converter.js";
import type { NotionLinkResolver, ParsedNotionHtmlPage } from "./notion-html-converter.js";
import { fileService } from "./file-service.js";

interface WorkerInit {
  rewrites: Array<[string, string]>;
}

interface BodyJob {
  id: number;
  sourcePath: string;
  parsed?: ParsedNotionHtmlPage;
  hasBodyHint?: boolean;
  sourceSize?: number;
}

interface BodyResult {
  id: number;
  sourcePath: string;
  bodyMarkdown: string;
  sourceSize: number;
  elapsedMs: number;
  stage: "body" | "body-empty" | "body-skip";
}

interface BodyError {
  id: number;
  sourcePath: string;
  error: string;
}

const init = workerData as WorkerInit;
const rewrites = new Map(init.rewrites);

function normalizeAbs(absPath: string): string {
  return resolve(absPath);
}

function makeResolveLink(sourcePath: string): NotionLinkResolver {
  const sourceDir = dirname(sourcePath);
  return (decoded) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return null;
    const absSource = resolve(sourceDir, decoded);
    const direct = rewrites.get(normalizeAbs(absSource));
    if (direct) return direct;
    const byExportRelativePath = rewrites.get(exportRelativeRewriteKey(absSource));
    if (byExportRelativePath) return byExportRelativePath;
    const hashMatch = /\s([0-9a-f]{32})(?:_all)?\.(?:html|md|csv)$/i.exec(decoded);
    if (hashMatch) {
      const hash = hashMatch[1].toLowerCase();
      const internal = rewrites.get(`notion-hash:${hash}`);
      if (internal) return internal;
      return `https://www.notion.so/${hash}`;
    }
    return null;
  };
}

function exportRelativeRewriteKey(sourcePath: string): string {
  const normalized = normalizeAbs(sourcePath).replace(/\\/g, "/");
  const parts = normalized.split("/");
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (/^Export-[0-9a-f-]+$/i.test(parts[index] ?? "")) {
      return `notion-path:${parts.slice(index + 1).join("/")}`;
    }
  }
  return `notion-path:${normalized}`;
}

function resolveCollection(hashNoDashes: string, title: string): string | null {
  const directId = rewrites.get(`notion-db-id:${hashNoDashes}`);
  if (directId) return `lotion-db:${directId}`;
  const direct = rewrites.get(`notion-db:${hashNoDashes}`);
  if (direct) return direct;
  if (!title) return null;
  const titleEnc = Buffer.from(title).toString("base64").replace(/=+$/, "");
  const titleId = rewrites.get(`notion-db-title-id:${titleEnc}`);
  if (titleId) return `lotion-db:${titleId}`;
  return rewrites.get(`notion-db-title:${titleEnc}`) ?? null;
}

async function convert(job: BodyJob): Promise<BodyResult> {
  const startedAt = Date.now();
  if (job.hasBodyHint === false) {
    return {
      id: job.id,
      sourcePath: job.sourcePath,
      bodyMarkdown: "",
      sourceSize: job.sourceSize ?? 0,
      elapsedMs: Date.now() - startedAt,
      stage: "body-skip"
    };
  }

  const raw = await fileService.readText(job.sourcePath);
  const sourceSize = job.sourceSize ?? Buffer.byteLength(raw);
  if (!hasNotionPageBodyContent(raw)) {
    return {
      id: job.id,
      sourcePath: job.sourcePath,
      bodyMarkdown: "",
      sourceSize,
      elapsedMs: Date.now() - startedAt,
      stage: "body-empty"
    };
  }

  const metadata = job.parsed ?? parseNotionHtmlMetadata(raw);
  const parsedBody = parseNotionHtmlBody(raw, metadata, {
    resolveLink: makeResolveLink(job.sourcePath),
    resolveCollection,
    collectCollectionRows: false
  });
  return {
    id: job.id,
    sourcePath: job.sourcePath,
    bodyMarkdown: parsedBody.bodyMarkdown,
    sourceSize,
    elapsedMs: Date.now() - startedAt,
    stage: "body"
  };
}

if (!parentPort) throw new Error("notion body worker requires parentPort");

parentPort.on("message", (job: BodyJob) => {
  convert(job)
    .then((result) => parentPort!.postMessage(result))
    .catch((error: unknown) => {
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
      const out: BodyError = { id: job.id, sourcePath: job.sourcePath, error: message };
      parentPort!.postMessage(out);
    });
});
