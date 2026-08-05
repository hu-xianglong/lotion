import type { NotionCollectionResolveContext } from "./notion-html-converter.js";
import { notionFullIdFromHref, notionShortIdFromHref } from "./notion-short-id.js";

export function resolveNotionCollectionRewrite(
  rewrites: Map<string, string>,
  hashNoDashes: string,
  title: string,
  context?: NotionCollectionResolveContext
): string | null {
  const directId = rewrites.get(`notion-db-id:${hashNoDashes}`);
  if (directId) return `lotion-db:${directId}`;
  const direct = rewrites.get(`notion-db:${hashNoDashes}`);
  if (direct) return direct;

  const dbIdsByRows = new Set<string>();
  for (const rowHash of context?.rowHashes ?? []) {
    const dbId = rewrites.get(`notion-row-db-id:${rowHash.toLowerCase()}`);
    if (dbId) dbIdsByRows.add(dbId);
  }
  if (dbIdsByRows.size === 1) {
    return `lotion-db:${Array.from(dbIdsByRows)[0]!}`;
  }
  if (dbIdsByRows.size > 1) return null;

  const dbIdsByHref = new Set<string>();
  for (const href of context?.rowHrefs ?? []) {
    const fullId = notionFullIdFromHref(href);
    if (fullId) {
      const dbId = rewrites.get(`notion-db-id:${fullId}`);
      if (dbId) dbIdsByHref.add(dbId);
    }
    const shortId = notionShortIdFromHref(href);
    if (!shortId) continue;
    const dbId = rewrites.get(`notion-db-short-id:${shortId}`);
    if (dbId) dbIdsByHref.add(dbId);
  }
  if (dbIdsByHref.size === 1) {
    return `lotion-db:${Array.from(dbIdsByHref)[0]!}`;
  }
  if (dbIdsByHref.size > 1) return null;

  if (!title) return null;
  const titleEnc = Buffer.from(title).toString("base64").replace(/=+$/, "");
  const titleId = rewrites.get(`notion-db-title-id:${titleEnc}`);
  if (titleId) return `lotion-db:${titleId}`;
  return rewrites.get(`notion-db-title:${titleEnc}`) ?? null;
}
