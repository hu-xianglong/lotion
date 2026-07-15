import { ExternalLink } from "lucide-react";

import { useLotionActions } from "../../context/lotion-actions";
import { tryNavigateWorkspaceLink } from "./workspace-link-routing";

export interface ParsedMarkdownLink {
  label: string;
  href: string;
}

export function WorkspaceLinkButton({ href, label }: { href: string; label?: string }) {
  const actions = useLotionActions();
  return (
    <button
      type="button"
      className="page-property-link"
      title={href}
      aria-label={`Open link: ${label || href}`}
      onClick={() => {
        if (tryNavigateWorkspaceLink(href, actions)) return;
        void window.lotion.shell.openLink(href).then((message) => {
          if (message) console.warn("[lotion] failed to open property link:", message);
        });
      }}
    >
      <span className="page-property-link-text">{label || href}</span>
      <span className="page-property-link-open" title="Open link">
        <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
      </span>
    </button>
  );
}

export function MarkdownPropertyLinks({ links }: { links: ParsedMarkdownLink[] }) {
  return (
    <span className="page-property-link-list">
      {links.map((link, index) => (
        <WorkspaceLinkButton
          key={`${link.href}-${index}`}
          href={link.href}
          label={link.label || link.href}
        />
      ))}
    </span>
  );
}

export function parseStandaloneMarkdownLinks(value: string): ParsedMarkdownLink[] {
  const raw = value.trim();
  if (!raw) return [];
  const links = parseMarkdownLinks(raw);
  if (links.length === 0) return [];
  let remainder = raw;
  for (const link of links) {
    remainder = remainder.replace(link.source, "");
  }
  return /^[\s,;，；]*$/.test(remainder) ? links.map(({ source: _source, ...link }) => link) : [];
}

function parseMarkdownLinks(value: string): Array<ParsedMarkdownLink & { source: string }> {
  const links: Array<ParsedMarkdownLink & { source: string }> = [];
  let cursor = 0;
  while (cursor < value.length) {
    const open = value.indexOf("[", cursor);
    if (open < 0) break;
    const close = findUnescaped(value, "]", open + 1);
    if (close < 0 || value[close + 1] !== "(") {
      cursor = open + 1;
      continue;
    }
    const end = findUnescaped(value, ")", close + 2);
    if (end < 0) break;
    const source = value.slice(open, end + 1);
    links.push({
      source,
      label: unescapeMarkdown(value.slice(open + 1, close)),
      href: unescapeMarkdown(value.slice(close + 2, end))
    });
    cursor = end + 1;
  }
  return links;
}

function findUnescaped(value: string, needle: string, start: number): number {
  for (let i = start; i < value.length; i += 1) {
    if (value[i] !== needle) continue;
    let slashCount = 0;
    for (let j = i - 1; j >= 0 && value[j] === "\\"; j -= 1) slashCount += 1;
    if (slashCount % 2 === 0) return i;
  }
  return -1;
}

function unescapeMarkdown(value: string): string {
  return value.replace(/\\([\\[\]()])/g, "$1");
}
