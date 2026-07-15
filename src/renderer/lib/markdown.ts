export type MarkdownPart =
  | { type: "html"; html: string }
  | { type: "view"; databaseId: string; viewId: string }
  | { type: "iframe"; url: string; height: number; title: string };

export function parseMarkdown(markdown: string): MarkdownPart[] {
  const parts: MarkdownPart[] = [];
  // Matches our Lotion-specific fenced blocks: lotion-view and lotion-iframe.
  const regex = /```(lotion-view|lotion-iframe)\n([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown))) {
    if (match.index > cursor) {
      parts.push({ type: "html", html: renderBasicMarkdown(markdown.slice(cursor, match.index)) });
    }
    const kind = match[1];
    const body = match[2];
    if (kind === "lotion-view") {
      const config = parseKeyValue(body);
      parts.push({ type: "view", databaseId: config.database || "", viewId: config.view || "view_default" });
    } else {
      const config = parseKeyValue(body);
      const height = Number(config.height);
      parts.push({
        type: "iframe",
        url: config.url || "",
        height: Number.isFinite(height) && height > 0 ? height : 360,
        title: config.title || config.url || "Embedded web page"
      });
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < markdown.length) {
    parts.push({ type: "html", html: renderBasicMarkdown(markdown.slice(cursor)) });
  }

  return parts;
}

function parseKeyValue(raw: string): Record<string, string> {
  const config: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    config[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return config;
}

function renderBasicMarkdown(markdown: string): string {
  const escaped = escapeHtml(markdown);
  return escaped
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
      if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith("### ")) return `<h3>${line.slice(4)}</h3>`;
      if (line.startsWith("- [ ] ")) return `<p><input type="checkbox" disabled /> ${line.slice(6)}</p>`;
      if (line.startsWith("- [x] ")) return `<p><input type="checkbox" disabled checked /> ${line.slice(6)}</p>`;
      if (line.startsWith("- ")) return `<li>${line.slice(2)}</li>`;
      if (!line.trim()) return "";
      return `<p>${line}</p>`;
    })
    .join("\n")
    // Inline replacements run after the line-level wrapping. Order matters:
    // image `![alt](url)` is matched before link `[text](url)` to avoid the
    // link rule eating image syntax.
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_match, alt, url, title) =>
      `<img class="md-image" src="${url}" alt="${alt}"${title ? ` title="${title}"` : ""} />`
    )
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_match, text, url, title) =>
      `<a class="md-link" href="${url}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ""}>${text}</a>`
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
