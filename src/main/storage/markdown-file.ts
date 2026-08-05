import { writeTextFile } from "./json-file.js";
import type { PageDocument } from "../../shared/types.js";
import { fileService } from "../services/file-service.js";

export function serializePage(page: PageDocument): string {
  return serializeMarkdownBody(page.markdown);
}

export async function readPageFile(path: string): Promise<PageDocument> {
  const content = await fileService.readText(path);
  return parsePage(content);
}

export async function writePageFile(path: string, page: PageDocument): Promise<void> {
  await writeTextFile(path, serializePage(page));
}

export function parsePage(content: string): PageDocument {
  const legacy = splitLegacyFrontMatter(content);
  const markdown = legacy.markdown;
  return {
    meta: {
      id: legacy.values.id || "",
      title: legacy.values.title || firstMarkdownHeading(markdown) || "Untitled",
      created_time: legacy.values.created_time || "",
      updated_time: legacy.values.updated_time || "",
      ...(legacy.values.icon ? { icon: legacy.values.icon } : {}),
      ...(legacy.values.cover ? { cover: legacy.values.cover } : {}),
      ...(finiteNumber(legacy.values.cover_offset) !== undefined
        ? { coverOffset: finiteNumber(legacy.values.cover_offset) }
        : {})
    },
    markdown
  };
}

export async function readMarkdownBody(path: string): Promise<string> {
  return fileService.readText(path);
}

export async function writeMarkdownBody(path: string, markdown: string): Promise<void> {
  await writeTextFile(path, serializeMarkdownBody(markdown));
}

export function serializeMarkdownBody(markdown: string): string {
  return `${markdown.trimEnd()}\n`;
}

function firstMarkdownHeading(markdown: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match?.[1]?.trim() || undefined;
}

function splitLegacyFrontMatter(content: string): { markdown: string; values: Record<string, string> } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) return { markdown: content, values: {} };
  const values: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key && value) values[key] = unquote(value);
  }
  return { markdown: content.slice(match[0].length), values };
}

function unquote(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

function finiteNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
