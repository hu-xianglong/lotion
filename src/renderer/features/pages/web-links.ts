import type { Text } from "@codemirror/state";

export interface UrlMatch {
  url: string;
  from: number;
  to: number;
}

export interface WebPreviewConfig {
  url: string;
  height: number;
  title: string;
}

const BARE_URL_RE = /https?:\/\/[^\s<>"'`]+/g;

export function findBareUrls(text: string, base = 0): UrlMatch[] {
  const out: UrlMatch[] = [];
  for (const match of text.matchAll(BARE_URL_RE)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const trimmed = trimTrailingPunctuation(raw);
    if (!trimmed) continue;
    out.push({
      url: trimmed,
      from: base + index,
      to: base + index + trimmed.length
    });
  }
  return out;
}

export function bareUrlAt(doc: Text, pos: number): string | null {
  const line = doc.lineAt(pos);
  for (const match of findBareUrls(line.text, line.from)) {
    if (pos >= match.from && pos <= match.to) return match.url;
  }
  return null;
}

export function standaloneBareUrl(text: string): string | null {
  const trimmed = text.trim();
  const matches = findBareUrls(trimmed);
  return matches.length === 1 && matches[0].from === 0 && matches[0].to === trimmed.length
    ? matches[0].url
    : null;
}

export function webPreviewForUrl(url: string): WebPreviewConfig | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "indify.co") return null;
  if (!parsed.pathname.startsWith("/widgets/")) return null;

  const isProgress = parsed.pathname.includes("/progressBar/");
  return {
    url,
    height: isProgress ? 180 : 300,
    title: isProgress ? "Indify progress" : "Indify countdown"
  };
}

export function visibleLines(doc: Text, from: number, to: number): Array<{ from: number; to: number; text: string }> {
  const lines: Array<{ from: number; to: number; text: string }> = [];
  let line = doc.lineAt(from);
  while (line.from <= to) {
    lines.push({ from: line.from, to: line.to, text: line.text });
    if (line.to >= doc.length) break;
    line = doc.line(line.number + 1);
  }
  return lines;
}

function trimTrailingPunctuation(value: string): string {
  let end = value.length;
  while (end > 0 && /[.,;:!?]/.test(value[end - 1])) end -= 1;
  return value.slice(0, end);
}
