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
  return {
    meta: {
      id: "",
      title: firstMarkdownHeading(content) || "Untitled",
      created_time: "",
      updated_time: ""
    },
    markdown: content
  };
}

export async function readMarkdownBody(path: string): Promise<string> {
  return fileService.readText(path);
}

export async function writeMarkdownBody(path: string, markdown: string): Promise<void> {
  await writeTextFile(path, serializeMarkdownBody(markdown));
}

export function serializeMarkdownBody(markdown: string): string {
  const trimmed = markdown.trimEnd();
  return trimmed ? `${trimmed}\n` : "";
}

function firstMarkdownHeading(markdown: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match?.[1]?.trim() || undefined;
}
