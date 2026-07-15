export interface MarkdownTextChangeSummary {
  lineCountChanged: boolean;
  beforeLines: string[];
  afterLines: string[];
}

export function shouldRebuildMarkdownBlockDecorationsForTextChange(change: MarkdownTextChangeSummary): boolean {
  if (change.lineCountChanged) return true;
  for (const line of [...change.beforeLines, ...change.afterLines]) {
    if (isMarkdownBlockDecorationCandidateLine(line)) return true;
  }
  return false;
}

export function isMarkdownBlockDecorationCandidateLine(line: string): boolean {
  const trimmed = line.trimStart();
  if (!trimmed) return false;

  // Line-level styling or block widgets.
  if (/^(#{1,6}\s|>\s?|`{3,}|~{3,})/.test(trimmed)) return true;
  if (/^[-*_]{3,}\s*$/.test(trimmed)) return true;

  // Lists and tasks affect marker replacement and checkbox rendering.
  if (/^(?:[-*+]|\d+\.)\s+/.test(trimmed)) return true;

  // GFM tables, standalone images, attachment links, and web previews can
  // change line height through block widgets.
  if (trimmed.includes("|")) return true;
  if (trimmed.includes("![") || trimmed.includes("](")) return true;
  if (/https?:\/\//i.test(trimmed)) return true;

  return false;
}
