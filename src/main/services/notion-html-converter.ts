import { parse } from "node-html-parser";
import type { HTMLElement as NhpElement } from "node-html-parser";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

/**
 * Parsed view of a single Notion HTML export page.
 *
 * The MD/CSV exporter Notion offers is lossy — it drops callout blocks,
 * date formatting, embedded collection views, the page icon reference,
 * etc. The HTML export keeps all of it, but the file body is HTML rather
 * than Markdown. We convert here.
 */
/**
 * Resolver passed to `parseNotionHtml` to rewrite `<a>` / `<img>`
 * references at the DOM level (before turndown converts to markdown).
 * Returns the workspace-relative path the link should point at, or
 * `null` if it can't be resolved.
 *
 * `decodedTarget` is the URL after `decodeURIComponent`. `kind`
 * distinguishes anchor links from images so the resolver can apply
 * different heuristics (e.g. only resolve `notion-db:<hash>` for
 * anchors).
 */
export type NotionLinkResolver = (
  decodedTarget: string,
  kind: "anchor" | "image"
) => string | null;

export interface ParseNotionHtmlOptions {
  /** Called for every `<a href>` and `<img src>` that isn't an
   *  external URL (http:, mailto:, etc.). If it returns a string, the
   *  href/src is replaced before turndown sees the DOM. */
  resolveLink?: NotionLinkResolver;
  /** Called for every `<div class="collection-content">` (and its
   *  table/wrapper variants). Receives the block's UUID hash (no
   *  dashes) and its `<h4>` title. Should return either
   *  `lotion-db:<id>` or the workspace path for the corresponding
   *  database (e.g. `databases/<database-folder>`), or null if the block can't
   *  be resolved. */
  resolveCollection?: (
    hashNoDashes: string,
    title: string,
    context?: NotionCollectionResolveContext
  ) => string | null;
  /** When false, skip turning the body into markdown. The caller gets
   *  metadata (title, iconSrc/iconEmoji, properties, propertyTypes,
   *  isCollectionWrapperOnly) only and `bodyMarkdown` is "". Used by
   *  the import service's pass A — row matching only needs metadata,
   *  so it can defer the expensive body conversion until pass C
   *  (when the link-resolver is also available). Default true. */
  convertBody?: boolean;
  /** When false, collection-content snapshots keep only view metadata
   *  (hash/title/field names/row count) and skip per-row cell extraction.
   *  This is important in importer metadata passes: large Notion pages
   *  can embed whole database snapshots, and materializing all cells
   *  there makes memory scale with unrelated tables. Default true. */
  collectCollectionRows?: boolean;
}

export interface NotionCollectionResolveContext {
  rowHashes: string[];
  rowHrefs: string[];
}

export interface NotionCollectionView {
  hash: string;
  title: string;
  fieldNames: string[];
  rowCount: number;
  rowHashes?: string[];
  rowHrefs?: string[];
  rows?: NotionCollectionRow[];
}

export interface NotionCollectionRow {
  hash: string;
  title: string;
  href: string;
  values: Record<string, string>;
}

export interface NotionPropertyOption {
  name: string;
  color?: string;
}

export interface ParsedNotionHtmlPage {
  /** The cleaned page title from `<h1 class="page-title">`. */
  title: string;
  /** Workspace-relative `src` of the page icon image if Notion shipped
   *  one in the header. Empty when the page has no icon. */
  iconSrc: string;
  /** Emoji text from `<span class="icon">…</span>` page headers. Empty
   *  when the icon is an image or unset. */
  iconEmoji: string;
  /** Workspace-relative `src` of the page cover image if Notion shipped
   *  one in the header. Empty when the page has no cover. */
  coverSrc: string;
  /** Vertical focal point parsed from Notion's cover `object-position`
   *  style. Undefined when Notion did not export a cover offset. */
  coverOffset?: number;
  /** Notion's `<table class="properties">` flattened into a key-value
   *  map, e.g. `{ "标签": "约会, 日记", "日期": "2026-05-19" }`. Link-like
   *  properties preserve internal Notion page links as markdown links
   *  with `notion-hash:<hash>` placeholders when no resolver is
   *  available yet. Empty on top-level pages — Notion only emits it on
   *  database rows. */
  properties: Record<string, string>;
  /** Notion field type per property key, parsed from the `<tr>` class
   *  `property-row property-row-<TYPE>` (multi_select / date / formula
   *  / status / url / relation / person / rollup / number / checkbox /
   *  created_time / last_edited_time / text). Lets the importer build
   *  a typed schema instead of treating every column as text. */
  propertyTypes: Record<string, string>;
  /** Select/status options visible in this row's property table, with
   *  Notion's exported color class when present. The full Notion option
   *  schema is not present in HTML exports, so the importer unions
   *  these row-level observations across all rows. */
  propertyOptions: Record<string, NotionPropertyOption[]>;
  /** GFM-flavored Markdown for the page body. ToC nav blocks, hidden
   *  Notion bookkeeping, and `<img class="icon">` references inside
   *  link labels are stripped during conversion. */
  bodyMarkdown: string;
  /** True when the page's entire body was just a `collection-content`
   *  (inline database) wrapper. These pages are Notion's "standalone
   *  database page" — visually identical to the DB itself, so callers
   *  typically want to skip emitting them. */
  isCollectionWrapperOnly: boolean;
  /** Inline database views embedded in the page body. Used by the
   *  importer to preserve empty Notion views that do not have a CSV. */
  collectionViews: NotionCollectionView[];
}

type ParsedNotionHtmlMetadata = Pick<
  ParsedNotionHtmlPage,
  "title" | "iconSrc" | "iconEmoji" | "coverSrc" | "coverOffset" | "properties" | "propertyTypes" | "propertyOptions"
>;

/**
 * Convert one Notion-exported HTML file into the pieces Lotion's
 * import pipeline expects (title, body markdown, page icon, row
 * properties). Notion-specific quirks handled inline:
 *
 *   - `<nav class="table_of_contents">` becomes a `lotion-toc` marker
 *     so Lotion can render a live TOC from the imported headings.
 *   - `<span class="selected-value select-value-color-*">` collapses
 *     to its text content (we lose the color, which Lotion doesn't
 *     have anyway).
 *   - `<time>` collapses to its text content; otherwise turndown
 *     would render `<time>...</time>` HTML literally.
 *   - Notion underline is preserved as inline `<u>...</u>` because
 *     Markdown has no native underline syntax.
 *   - `<img class="icon">` appearing inside an `<a>` (a row-link
 *     icon) is dropped, since the same image would otherwise sit
 *     directly next to the link text and read as visual noise.
 */
export function parseNotionHtml(html: string, options: ParseNotionHtmlOptions = {}): ParsedNotionHtmlPage {
  const headerHtml = extractHeaderHtml(html);
  if (headerHtml) {
    const root = parse(headerHtml, { lowerCaseTagName: true });
    const metadata = parseHeaderMetadata(root, options.resolveLink);
    const metadataPage = completeParsedNotionHtml(metadata, "", false, []);
    return parseNotionHtmlBody(html, metadataPage, options);
  }

  const root = parse(html, { lowerCaseTagName: true });
  const article = root.querySelector("article.page");
  if (!article) {
    return emptyParsedNotionHtml();
  }

  const metadata = parseHeaderMetadata(article, options.resolveLink);

  const body = article.querySelector("div.page-body");
  if (!body) {
    return completeParsedNotionHtml(metadata, "", false, []);
  }

  return parseBodyElement(body as NhpElement, metadata, options);
}

export function parseNotionHtmlMetadata(html: string, options: ParseNotionHtmlOptions = {}): ParsedNotionHtmlPage {
  const headerHtml = extractHeaderHtml(html);
  if (!headerHtml) return parseNotionHtml(html, { ...options, convertBody: false });
  const root = parse(headerHtml, { lowerCaseTagName: true });
  const metadata = parseHeaderMetadata(root, options.resolveLink);
  return completeParsedNotionHtml(metadata, "", false, []);
}

export function hasNotionPageBodyContent(html: string): boolean {
  const bodyHtml = extractPageBodyOuterHtml(html);
  if (!bodyHtml) return false;
  const openEnd = bodyHtml.indexOf(">");
  if (openEnd < 0) return false;
  const inner = bodyHtml.slice(openEnd + 1).replace(/<\/div>\s*$/i, "");
  if (!inner.trim()) return false;
  const withoutNoise = inner
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  if (/<(?:img|video|audio|iframe|object|embed|source|canvas|svg|table|ul|ol|li|h[1-6]|blockquote|pre|code|figure)\b/i.test(withoutNoise)) {
    return true;
  }
  const cheapText = withoutNoise
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, "")
    .replace(/&#(?:160|x0*a0);/gi, "")
    .replace(/[\s\u200b\u200c\u200d\ufeff]+/g, "")
    .trim();
  return cheapText.length > 0;
}

export function notionHtmlBodyTextFingerprint(html: string): string {
  const bodyHtml = extractPageBodyOuterHtml(html);
  if (!bodyHtml) return "";
  const openEnd = bodyHtml.indexOf(">");
  if (openEnd < 0) return "";
  const inner = bodyHtml.slice(openEnd + 1).replace(/<\/div>\s*$/i, "");
  return cleanRawHtmlText(inner).replace(/\s+/g, " ").trim();
}

export function parseNotionHtmlBody(
  html: string,
  metadata: ParsedNotionHtmlPage,
  options: ParseNotionHtmlOptions = {}
): ParsedNotionHtmlPage {
  const bodyHtml = extractPageBodyOuterHtml(html);
  if (!bodyHtml) return completeParsedNotionHtml(metadata, "", false, []);
  const strippedBody = stripRawCollectionContentBlocks(bodyHtml, options);
  const root = parse(strippedBody.html, { lowerCaseTagName: true });
  const body = root.querySelector("div.page-body") ?? (root.tagName?.toLowerCase() === "div" ? root : null);
  if (!body) return completeParsedNotionHtml(metadata, "", false, []);
  return parseBodyElement(body as NhpElement, metadata, options, strippedBody.collectionViews);
}

function parseBodyElement(
  body: NhpElement,
  metadata: ParsedNotionHtmlMetadata,
  options: ParseNotionHtmlOptions,
  precomputedCollectionViews: NotionCollectionView[] = []
): ParsedNotionHtmlPage {

  // Detect "this page is just an inline-DB wrapper" BEFORE we strip
  // anything else — if the page-body has nothing but the collection
  // table/wrapper (possibly padded with empty `<br>` or whitespace),
  // the caller will want to skip emitting this page at all (the DB
  // itself already shows up in the sidebar).
  const isIgnorableChild = (n: unknown): boolean => {
    const tag = (n as { tagName?: string }).tagName?.toLowerCase();
    const raw = (n as { rawText?: string }).rawText ?? "";
    if (!tag) return raw.trim().length === 0; // text node with only whitespace
    return tag === "br";
  };
  const isCollectionChild = (n: unknown): boolean => {
    const tag = (n as { tagName?: string }).tagName?.toLowerCase();
    const cls = ((n as { classList?: { value?: string[] } }).classList?.value ?? []).join(" ");
    if (!tag) return false;
    if (tag === "p" && (n as NhpElement).getAttribute?.("data-lotion-collection-placeholder") === "true") {
      return true;
    }
    return cls.includes("collection-content") || cls.includes("collection-content-wrapper");
  };
  const meaningfulChildren = body.childNodes.filter((n) => !isIgnorableChild(n));
  const isCollectionWrapperOnly =
    meaningfulChildren.length > 0 && meaningfulChildren.every(isCollectionChild);
  const collectionViews = mergeCollectionViews(precomputedCollectionViews, collectCollectionViews(body));

  // Metadata-only mode: the import service's pass A calls us here just
  // to get title, iconSrc/iconEmoji, properties, propertyTypes, and the phantom-
  // page flag. It re-invokes us in pass C with a resolver once the
  // rewrites map is built, and that second call does the body→markdown
  // work. Skipping the strip/rewrite/turndown chain here saves ~20 ms
  // per row × thousands of rows.
  if (options.convertBody === false) {
    return completeParsedNotionHtml(metadata, "", isCollectionWrapperOnly, collectionViews);
  }
  for (const tocNav of body.querySelectorAll("nav.table_of_contents")) {
    tocNav.replaceWith("<p>{{LOTIONTOC}}</p>");
  }
  // Notion exports a tiny PDF-print bookkeeping link on every page.
  for (const ind of body.querySelectorAll(".pdf-relative-link-path")) {
    ind.remove();
  }
  // Drop the small icon image that prefixes every row link inside an
  // embedded collection table — it's a duplicate of the row's icon
  // and clutters the markdown output.
  for (const a of body.querySelectorAll("a img.icon")) {
    a.remove();
  }
  // Notion-hosted icon CDN refs (https://www.notion.so/icons/*.svg) —
  // these would 404 offline and clutter cell text otherwise.
  for (const img of body.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? "";
    if (src.startsWith("https://www.notion.so/icons/")) {
      img.remove();
    }
  }
  // Notion HTML pages sometimes embed third-party CDN script/link tags
  // (Prism for code highlighting, etc.). They're useless inside Lotion
  // and turndown otherwise leaves them as literal HTML.
  for (const noise of body.querySelectorAll("script, link, style")) {
    noise.remove();
  }
  wrapNotionColoredBlockContent(body, "p, h1, h2, h3, h4, h5, h6, blockquote");
  for (const equation of outermostEquationNodes(body as NhpElement)) {
    const latex = equationLatexFromNode(equation);
    if (!latex) {
      equation.remove();
      continue;
    }
    equation.replaceWith(
      `<pre><code class="language-lotion-equation">${escapeHtml(latex)}</code></pre>`
    );
  }
  // Notion exports some embeds as source-only figures:
  //
  //   <figure><div class="source"><a href="https://indify.co/...">...</a></div></figure>
  //
  // A plain URL relies on renderer heuristics and is easy to miss when
  // the cursor sits on that line. Preserve known embeddable widgets as
  // an explicit Lotion iframe block instead.
  for (const figure of body.querySelectorAll("figure")) {
    const preview = iframePreviewFromSourceFigure(figure as NhpElement);
    if (!preview) continue;
    figure.replaceWith(
      `<pre><code class="language-lotion-iframe">url: ${escapeHtml(preview.url)}\n` +
      `height: ${preview.height}\n` +
      `title: ${escapeHtml(preview.title)}</code></pre>`
    );
  }
  // Embedded "collection-content" views (inline database table dumps)
  // visually duplicate the actual database the user already sees in the
  // sidebar, plus they bloat huge pages — a top-level inbox page can be
  // 800+ rows. Replace every one with a one-line clickable link so the
  // user can still navigate to the real database. The block's `id`
  // (UUID with dashes) maps to the corresponding CSV filename
  // `<title> <hash-no-dashes>.csv`; `cleanNotionBody` will rewrite that
  // path through the same rewrites map that handles every other link.
  //
  // Notion uses three flavors:
  //   <div class="collection-content">                    ← board-style
  //   <table class="collection-content">                  ← table-style
  //   <div class="collection-content-wrapper">…<table>…</div> ← wrapper-style
  for (const collection of body.querySelectorAll(
    "div.collection-content, table.collection-content, div.collection-content-wrapper"
  )) {
    const titleText =
      collection.querySelector("h4.collection-title")?.text.trim() ??
      collection.querySelector("th .cell-title")?.text.trim() ??
      "Embedded database";
    const id = collection.getAttribute("id") ?? "";
    const hashNoDashes = id.replace(/-/g, "").toLowerCase();
    // Ask the caller's resolver to map (hash, title) → workspace
    // database path. The resolver internally tries hash-direct first
    // and falls back on the title (for Notion's "linked database"
    // views whose hash has no CSV but whose title matches a kept DB).
    // Emit a pre-resolved sentinel `{{LOTIONVIEW:db_<id>}}`;
    // `cleanNotionBody` expands these to `lotion-view` fenced blocks.
    let target: string | null = null;
    if (options.resolveCollection) {
      target = options.resolveCollection(hashNoDashes, titleText, collectionResolveContext(collection));
    }
    if (target) {
      const dbId = collectionTargetDatabaseId(target);
      collection.replaceWith(`<p>{{LOTIONVIEW:${dbId}}}</p>`);
    } else {
      collection.replaceWith(`<p><em>📂 ${escapeHtml(titleText)} (database not found)</em></p>`);
    }
  }
  // Notion wraps every embedded image in `<a href="X"><img src="Y"></a>`
  // so the user can click to view full-screen. The href is the original
  // image path (often relative to a sub-page that isn't in the export
  // root) and just clutters the markdown output. Strip the link
  // wrapper whenever its only meaningful child is the image — we keep
  // the `<img>`, which has the rewritable src.
  for (const link of body.querySelectorAll("a")) {
    const img = link.querySelector("img");
    if (!img) continue;
    // Only strip when the link contains nothing else (allow tiny
    // text-node siblings that are whitespace).
    const hasOtherContent = link.childNodes.some((node) => {
      const tag = (node as unknown as { tagName?: string }).tagName?.toLowerCase();
      if (tag === "img") return false;
      const rawText = (node as unknown as { rawText?: string }).rawText ?? "";
      return rawText.trim().length > 0;
    });
    if (!hasOtherContent) link.replaceWith(img.outerHTML);
  }
  // Empty `<div class="indented"></div>` sits next to every Notion
  // to-do item and bullet — it's a slot for nested content that wasn't
  // used. Removing it BEFORE the unwrap pass below avoids leaving each
  // `<li>` with two children (text + empty div), which would force
  // turndown into "loose list" mode (extra blank lines between items).
  for (const indented of body.querySelectorAll("div.indented")) {
    if (indented.innerHTML.trim() === "") indented.remove();
  }
  // Notion's `<ul class="to-do-list">` items use a fake `<div class=
  // "checkbox">` instead of a real `<input type="checkbox">`, which the
  // GFM plugin needs to detect task lists. Rewrite each li so turndown
  // emits the GFM `- [ ]` / `- [x]` syntax.
  for (const todo of body.querySelectorAll("ul.to-do-list li")) {
    const checkbox = todo.querySelector(".checkbox");
    const checked = checkbox?.classList.contains("checkbox-on") ?? false;
    if (checkbox) checkbox.remove();
    const inputHtml = `<input type="checkbox"${checked ? " checked" : ""} disabled>`;
    todo.set_content(inputHtml + " " + todo.innerHTML);
  }
  // `<ul class="toggle"><li><details><summary>X</summary>...</details>
  // </li></ul>` — unwrap the redundant `<ul><li>` so `<details>` is a
  // top-level block. Then convert `<details>` to a markdown-friendly
  // form (bold summary + indented body) via a turndown rule below.
  for (const toggleUl of body.querySelectorAll("ul.toggle")) {
    const out: string[] = [];
    for (const li of toggleUl.childNodes) {
      const liEl = (li as unknown as { tagName?: string }).tagName === "LI" ? (li as unknown as NhpElement) : null;
      if (liEl) out.push(liEl.innerHTML);
      else if ((li as unknown as { rawText?: string }).rawText) out.push((li as unknown as { rawText: string }).rawText);
    }
    toggleUl.replaceWith(out.join(""));
  }
  // `<div class="indented">...</div>` — Notion uses this as a sub-bullet
  // continuation marker. The wrapping div carries no semantics in MD,
  // so unwrap (keep children).
  for (const indented of body.querySelectorAll("div.indented")) {
    indented.replaceWith(indented.innerHTML);
  }
  // `<div class="column-list">` lays out children side-by-side in
  // Notion. Markdown is single-column, so render columns sequentially
  // by unwrapping the column-list and each column div.
  for (const col of body.querySelectorAll("div.column-list, div.column")) {
    col.replaceWith(col.innerHTML);
  }
  // Notion wraps every block in `<div style="display:contents" dir="auto">`
  // — the inline styles are layout hacks for the browser, but they
  // confuse turndown's table-detection plugin (which expects `<tbody>`
  // to contain `<tr>` directly, not div-wrapped rows). Unwrap them.
  for (const wrapper of body.querySelectorAll("div[style^='display:contents'], tbody div[style*='display:contents']")) {
    wrapper.replaceWith(wrapper.innerHTML);
  }
  // `<table class="simple-table">` ships without a `<thead>`; the GFM
  // plugin in turndown won't convert a header-less table, so the whole
  // thing falls through as literal HTML. Promote the first `<tr>` to a
  // `<thead><tr>...</tr></thead>` and convert its `<td>` cells to
  // `<th>` so turndown emits a real markdown table.
  for (const table of body.querySelectorAll("table.simple-table")) {
      const tbody = table.querySelector("tbody");
      const rows = (tbody ?? table).querySelectorAll("tr");
      if (rows.length === 0) {
        table.remove();
        continue;
      }
    const headerRow = rows[0];
    // Replace `<td>` with `<th>` inside the header row.
    let headerHtml = headerRow.outerHTML.replace(/<td(\s|>)/g, "<th$1").replace(/<\/td>/g, "</th>");
    // Remove the original header row from tbody, wrap in thead.
    headerRow.remove();
    const thead = `<thead>${headerHtml}</thead>`;
      if (tbody) {
        tbody.insertAdjacentHTML?.("beforebegin", thead);
      } else {
        table.set_content(`${thead}<tbody>${table.innerHTML}</tbody>`);
      }
  }
  // After unwrapping `display:contents` divs, list items may now have a
  // bare `<p>` wrapping the text. Turndown emits a blank line for each
  // `<p>` inside an `<li>`, which renders as ugly double-spaced lists.
  // Unwrap any `<p>` that's the sole child of an `<li>`.
  for (const li of body.querySelectorAll("li")) {
    const onlyP = li.querySelector("p");
    if (onlyP && li.childNodes.length === 1) {
      li.set_content(onlyP.innerHTML);
    }
  }
  wrapNotionColoredListItemContent(body as NhpElement);
  // Notion exports each bullet/numbered item as its OWN `<ul>` or
  // `<ol>`, so a 12-item list becomes 12 separate one-item lists in a
  // row. Turndown emits a blank line between separate lists, producing
  // ugly double-spaced output. Merge adjacent same-class lists so they
  // turn into one tight list.
  mergeAdjacentLists(body as NhpElement);

  // Link/image rewriting at the DOM level — the caller passes a
  // resolver that maps decoded Notion paths to workspace URLs. Doing
  // this here (instead of regex-on-markdown later) sidesteps a class
  // of bugs from turndown's emitter escaping `\]`, `\(`, `\)` inside
  // link labels/URLs. node-html-parser's `getAttribute` is the
  // ground truth; whatever it returns is what was in the source HTML.
  if (options.resolveLink) {
    rewriteLinks(body as NhpElement, options.resolveLink);
  }

  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    fence: "```",
    hr: "---"
  });
  turndown.use(gfm);

  // Notion-specific collapses — strip the wrapping HTML, keep the
  // text content.
  turndown.addRule("notion-selected-value", {
    filter: (node) =>
      node.nodeName === "SPAN" &&
      typeof node.getAttribute === "function" &&
      (node.getAttribute("class") ?? "").includes("selected-value"),
    replacement: (content) => content
  });
  turndown.addRule("notion-time", {
    filter: "time",
    replacement: (content) => content
  });
  // Turndown's GFM plugin emits `<s>text</s>` as `~text~`, but
  // CodeMirror's GFM parser expects the standard double-tilde form for
  // strikethrough. Keep the importer output aligned with the editor.
  turndown.addRule("notion-strikethrough", {
    filter: (node) => isStrikethroughNode(node),
    replacement: (content) => {
      const text = content.trim();
      return text ? `~~${text}~~` : "";
    }
  });
  turndown.addRule("notion-underline", {
    filter: (node) => isUnderlineNode(node),
    replacement: (content) => {
      const text = content.trim();
      return text ? `<u>${text}</u>` : "";
    }
  });
  turndown.addRule("notion-highlight", {
    filter: (node) => isHighlightNode(node),
    replacement: (content, node) => {
      const text = content.trim();
      if (!text) return "";
      const color = notionHighlightColorFromNode(node);
      return color ? `<span data-lotion-bg="${color}">${text}</span>` : `<mark>${text}</mark>`;
    }
  });
  turndown.addRule("notion-inline-color", {
    filter: (node) => notionInlineColorFromNode(node) !== null,
    replacement: (content, node) => {
      const color = notionInlineColorFromNode(node);
      const text = content.trim();
      if (!color || !text) return "";
      const attr = color.kind === "background" ? "data-lotion-bg" : "data-lotion-color";
      return `<span ${attr}="${color.name}">${text}</span>`;
    }
  });
  // Notion equation blocks ship rendered KaTeX HTML plus the original
  // TeX in either `data-expression` or an annotation node. Keep the
  // source TeX as an explicit Lotion block; rendered HTML is brittle
  // and noisy in Markdown.
  turndown.addRule("notion-equation", {
    filter: (node) => isEquationNode(node),
    replacement: (_content, node) => {
      const latex = equationLatexFromNode(node);
      return latex ? fencedEquationMarkdown(latex) : "";
    }
  });
  // Notion exports a bare URL paste as `<a href="X">X</a>`, sometimes
  // with a partially decoded label (`%20` as spaces, `%2C` still
  // escaped). Keep the href exact for navigation, but normalize the
  // visible label so imported pages don't show URL-encoding noise.
  turndown.addRule("notion-bare-url-link", {
    filter: (node) => {
      if (node.nodeName !== "A") return false;
      const href = (node as unknown as { getAttribute?: (n: string) => string | null }).getAttribute?.("href") ?? "";
      const text = (node as unknown as { textContent?: string }).textContent ?? "";
      if (!href || !/^https?:\/\//i.test(href)) return false;
      return areEquivalentUrlLabels(text, href);
    },
    replacement: (_content, node) => {
      const href = (node as unknown as { getAttribute?: (n: string) => string | null }).getAttribute?.("href") ?? "";
      const text = (node as unknown as { textContent?: string }).textContent ?? "";
      const label = prettifyUrlLabel(text || href);
      // Emit simple URL pastes as plain text so GFM linkify can handle
      // them. If the visible Notion text was a partially decoded URL
      // (`%20` → space but `%2C` left behind), keep href exact and use
      // a decoded markdown label.
      return label === href && !/\s/.test(label) ? href : markdownLink(label, href);
    }
  });
  turndown.addRule("notion-icon-img-strip", {
    filter: (node) => {
      if (node.nodeName !== "IMG") return false;
      const cls = (node as unknown as { getAttribute?: (n: string) => string | null }).getAttribute?.("class");
      return typeof cls === "string" && cls.includes("icon");
    },
    replacement: () => ""
  });
  // Notion callouts are exported as a flex `<figure class="... callout">`
  // with the icon in the first child and the body in the second. Plain
  // turndown flattens that into a standalone emoji line, so preserve the
  // block boundary explicitly for the renderer.
  turndown.addRule("notion-callout", {
    filter: (node) =>
      node.nodeName === "FIGURE" &&
      typeof node.getAttribute === "function" &&
      /\bcallout\b/.test(node.getAttribute("class") ?? ""),
    replacement: (_content, node) => {
      const icon = calloutIconFromNode(node) || "💡";
      const color = notionColorFromClass(
        (node as unknown as { getAttribute?: (name: string) => string | null }).getAttribute?.("class") ?? ""
      );
      const bodyHtml = calloutBodyHtmlFromNode(node);
      const innerMd = turndown.turndown(bodyHtml).trim();
      return fencedCalloutMarkdown(icon, innerMd, color?.kind === "background" ? color.name : "");
    }
  });
  // <details><summary>X</summary>Y</details> → stable Lotion fenced
  // block. Markdown has no native disclosure widget, so keep the
  // toggle semantics explicit for the live-preview renderer.
  turndown.addRule("notion-details", {
    filter: "details",
    replacement: (_content, node) => {
      const el = node as unknown as { querySelector?: (sel: string) => unknown };
      const summary = (el.querySelector?.("summary") as { textContent?: string } | null);
      const summaryText = summary?.textContent?.trim() ?? "";
      // Re-render body sans the summary
      const clone = (node as unknown as { cloneNode?: (deep: boolean) => unknown }).cloneNode?.(true);
      const cloneSummary = (clone as { querySelector?: (sel: string) => { remove?: () => void } | null })?.querySelector?.("summary");
      cloneSummary?.remove?.();
      const innerHtml = (clone as { innerHTML?: string })?.innerHTML ?? "";
      const innerMd = turndown.turndown(innerHtml).trim();
      return fencedToggleMarkdown(summaryText, innerMd, isDetailsOpen(node));
    }
  });
  // <summary> outside a turndown-handled <details> (shouldn't happen
  // post-rule, but defensive): collapse to text. Without this, turndown
  // would render literal `<summary>...</summary>` HTML.
  turndown.addRule("notion-summary-fallback", {
    filter: "summary",
    replacement: (content) => `**${content.trim()}**`
  });

  let bodyMarkdown = turndown.turndown((body as NhpElement).outerHTML);
  // Turndown formats nested lists with a blank-whitespace line between
  // the parent item and its first child (and between siblings), which
  // renders as a loose list with extra vertical gaps. Collapse those
  // whitespace-only separator lines when they sit between two list
  // items so the output reads as a tight list.
  bodyMarkdown = bodyMarkdown.replace(/\n[ \t]+\n([ \t]*(?:-|\d+\.)\s)/g, "\n$1");
  bodyMarkdown = bodyMarkdown.replace(/^([ \t]*[-*+][ \t]+\[[ xX]\])[ \t]{2,}(?=<span data-lotion-)/gm, "$1 ");
  bodyMarkdown = normalizeAttachmentMarkdown(bodyMarkdown);
  bodyMarkdown = normalizePlainTextBracketEscapes(bodyMarkdown);
  // Notion preserves whitespace via `white-space: pre-wrap`; that
  // leaks blank-only lines into MD. Collapse runs of 3+ newlines so
  // the result reads naturally.
  bodyMarkdown = bodyMarkdown.replace(/\n{3,}/g, "\n\n").trim();

  return completeParsedNotionHtml(metadata, bodyMarkdown, isCollectionWrapperOnly, collectionViews);
}

function isStrikethroughNode(node: unknown): boolean {
  const element = node as {
    nodeName?: string;
    getAttribute?: (name: string) => string | null;
  };
  const nodeName = (element.nodeName ?? "").toUpperCase();
  if (nodeName === "S" || nodeName === "DEL") return true;
  const style = element.getAttribute?.("style") ?? "";
  const cls = element.getAttribute?.("class") ?? "";
  return /\bline-through\b/i.test(cls) ||
    /(?:^|;)\s*text-decoration(?:-line)?\s*:[^;]*\bline-through\b/i.test(style);
}

function isUnderlineNode(node: unknown): boolean {
  const element = node as {
    nodeName?: string;
    getAttribute?: (name: string) => string | null;
  };
  const nodeName = (element.nodeName ?? "").toUpperCase();
  if (nodeName === "U" || nodeName === "INS") return true;
  const style = element.getAttribute?.("style") ?? "";
  const cls = element.getAttribute?.("class") ?? "";
  return /\bunderline\b/i.test(cls) ||
    /(?:^|;)\s*text-decoration(?:-line)?\s*:[^;]*\bunderline\b/i.test(style);
}

function isHighlightNode(node: unknown): boolean {
  const element = node as {
    nodeName?: string;
    getAttribute?: (name: string) => string | null;
  };
  const nodeName = (element.nodeName ?? "").toUpperCase();
  if (nodeName === "MARK") return true;
  const cls = element.getAttribute?.("class") ?? "";
  return /\bhighlight-[a-z_]+\b/i.test(cls);
}

function notionHighlightColorFromNode(node: unknown): string | null {
  const element = node as {
    getAttribute?: (name: string) => string | null;
  };
  const cls = element.getAttribute?.("class") ?? "";
  const match = /\bhighlight-(gray|brown|orange|yellow|green|blue|purple|pink|red)(?:_background)?\b/i.exec(cls);
  return match ? match[1].toLowerCase() : null;
}

function notionInlineColorFromNode(node: unknown): { kind: "foreground" | "background"; name: string } | null {
  const element = node as {
    nodeName?: string;
    getAttribute?: (name: string) => string | null;
  };
  if ((element.nodeName ?? "").toUpperCase() !== "SPAN") return null;
  return notionColorFromClass(element.getAttribute?.("class") ?? "");
}

function notionColorFromClass(className: string): { kind: "foreground" | "background"; name: string } | null {
  const match = /\bblock-color-(gray|brown|orange|yellow|green|blue|purple|pink|red)(?:_background)?\b/i.exec(className);
  if (!match) return null;
  return {
    kind: /_background\b/i.test(match[0]) ? "background" : "foreground",
    name: match[1].toLowerCase()
  };
}

function wrapNotionColoredBlockContent(root: NhpElement, selector: string): void {
  for (const block of root.querySelectorAll(selector)) {
    const color = notionColorFromClass(block.getAttribute("class") ?? "");
    if (!color || !block.innerHTML.trim()) continue;
    const className = `block-color-${color.name}${color.kind === "background" ? "_background" : ""}`;
    block.set_content(`<span class="${className}">${block.innerHTML}</span>`);
  }
}

function wrapNotionColoredListItemContent(root: NhpElement): void {
  for (const li of root.querySelectorAll("li")) {
    const color = notionColorFromClass(li.getAttribute("class") ?? "");
    if (!color || !li.innerHTML.trim()) continue;
    const className = `block-color-${color.name}${color.kind === "background" ? "_background" : ""}`;
    const children = [...li.childNodes];
    const prefix: string[] = [];
    let cursor = 0;
    const firstTag = nodeTagName(children[0]);
    if (firstTag === "input") {
      prefix.push(nodeHtml(children[0]));
      cursor = 1;
      if (children[1] !== undefined && !nodeTagName(children[1]) && /^\s*$/.test(nodeRawText(children[1]))) {
        cursor = 2;
      }
    }

    const bodyParts: string[] = [];
    const suffixParts: string[] = [];
    let suffixStarted = false;
    for (const child of children.slice(cursor)) {
      const tag = nodeTagName(child);
      if (tag === "ul" || tag === "ol") suffixStarted = true;
      if (suffixStarted) suffixParts.push(nodeHtml(child));
      else bodyParts.push(nodeHtml(child));
    }

    const bodyHtml = bodyParts.join("");
    if (!bodyHtml.trim()) continue;
    li.set_content(`${prefix.join("")}<span class="${className}">${bodyHtml}</span>${suffixParts.join("")}`);
  }
}

function nodeTagName(node: unknown): string {
  return ((node as { tagName?: string } | undefined)?.tagName ?? "").toLowerCase();
}

function nodeRawText(node: unknown): string {
  return (node as { rawText?: string } | undefined)?.rawText ?? "";
}

function nodeHtml(node: unknown): string {
  const element = node as { outerHTML?: string; rawText?: string };
  if (typeof element.outerHTML === "string") return element.outerHTML;
  return escapeHtml(element.rawText ?? "");
}

function areEquivalentUrlLabels(text: string, href: string): boolean {
  const label = text.trim();
  const target = href.trim();
  if (!label || !target) return false;
  if (!/^https?:\/\//i.test(label) || !/^https?:\/\//i.test(target)) return false;
  return normalizeUrlLabelForComparison(label) === normalizeUrlLabelForComparison(target);
}

function normalizeUrlLabelForComparison(value: string): string {
  return prettifyUrlLabel(value).replace(/\s+/g, " ");
}

function prettifyUrlLabel(value: string): string {
  return decodeRepeatedly(value).replace(/\s+/g, " ").trim();
}

function emptyParsedNotionHtml(): ParsedNotionHtmlPage {
  return {
    title: "",
    iconSrc: "",
    iconEmoji: "",
    coverSrc: "",
    coverOffset: undefined,
    properties: {},
    propertyTypes: {},
    propertyOptions: {},
    bodyMarkdown: "",
    isCollectionWrapperOnly: false,
    collectionViews: []
  };
}

function completeParsedNotionHtml(
  metadata: ParsedNotionHtmlMetadata,
  bodyMarkdown: string,
  isCollectionWrapperOnly: boolean,
  collectionViews: NotionCollectionView[]
): ParsedNotionHtmlPage {
  return {
    ...metadata,
    bodyMarkdown,
    isCollectionWrapperOnly,
    collectionViews
  };
}

function parseHeaderMetadata(root: NhpElement, resolveLink?: NotionLinkResolver): ParsedNotionHtmlMetadata {
  const rootTag = root.tagName?.toLowerCase();
  const header = rootTag === "header"
    ? root
    : root.querySelector("header") ?? root;
  const titleEl = header.querySelector("h1.page-title");
  const title = titleEl ? titleEl.text.trim() : "";
  const iconImg = header.querySelector(".page-header-icon img.icon");
  const iconSrc = iconImg?.getAttribute("src") ?? "";
  const iconEmoji = header.querySelector(".page-header-icon span.icon")?.text.trim() ?? "";
  const coverImg = header.querySelector("img.page-cover-image, .page-cover-image img");
  const coverSrc = coverImg?.getAttribute("src") ?? "";
  const coverOffset = coverImg ? parseCoverOffset(coverImg.getAttribute("style") ?? "") : undefined;

  const properties: Record<string, string> = {};
  const propertyTypes: Record<string, string> = {};
  const propertyOptions: Record<string, NotionPropertyOption[]> = {};
  for (const tr of header.querySelectorAll("table.properties tr.property-row")) {
    const key = tr.querySelector("th")?.text.trim() ?? "";
    if (!key) continue;
    const cls = tr.getAttribute("class") ?? "";
    const notionType = /property-row-([\w-]+)/.exec(cls)?.[1];
    const cell = tr.querySelector("td");
    properties[key] = propertyCellValue(cell, notionType, resolveLink);
    if (notionType) propertyTypes[key] = notionType;
    const options = propertyCellOptions(cell, notionType);
    if (options.length > 0) propertyOptions[key] = options;
  }

  return { title, iconSrc, iconEmoji, coverSrc, coverOffset, properties, propertyTypes, propertyOptions };
}

function parseCoverOffset(style: string): number | undefined {
  const objectPosition = /object-position\s*:\s*([^;]+)/i.exec(style)?.[1] ?? style;
  const percentages = Array.from(objectPosition.matchAll(/(-?\d+(?:\.\d+)?)%/g));
  const raw = percentages.at(-1)?.[1];
  if (raw === undefined) return undefined;
  const offset = Number(raw);
  if (!Number.isFinite(offset)) return undefined;
  return Math.max(0, Math.min(100, offset));
}

function extractHeaderHtml(html: string): string | null {
  const start = html.search(/<header\b/i);
  if (start < 0) return null;
  const end = indexOfClosingTag(html, "header", start);
  if (end < 0) return null;
  return html.slice(start, end + "</header>".length);
}

function extractPageBodyOuterHtml(html: string): string | null {
  const match = /<div\b[^>]*class=(["'])[^"']*\bpage-body\b[^"']*\1[^>]*>/i.exec(html);
  if (!match) return null;
  const articleEnd = indexOfClosingTag(html, "article", match.index);
  if (articleEnd < 0) return html.slice(match.index);
  return html.slice(match.index, articleEnd);
}

function indexOfClosingTag(html: string, tagName: string, from: number): number {
  const pattern = new RegExp(`</${tagName}\\s*>`, "ig");
  pattern.lastIndex = from;
  const match = pattern.exec(html);
  return match?.index ?? -1;
}

interface RawCollectionStripResult {
  html: string;
  collectionViews: NotionCollectionView[];
}

interface RawCollectionStart {
  start: number;
  openEnd: number;
  tagName: string;
  openTag: string;
}

function stripRawCollectionContentBlocks(
  html: string,
  options: ParseNotionHtmlOptions
): RawCollectionStripResult {
  let cursor = 0;
  let searchFrom = 0;
  let nextHtml = "";
  const collectionViews: NotionCollectionView[] = [];

  while (searchFrom < html.length) {
    const start = findNextRawCollectionStart(html, searchFrom);
    if (!start) break;
    if (start.start < cursor) {
      searchFrom = start.openEnd;
      continue;
    }

    const end = findRawElementEnd(html, start);
    if (end <= start.openEnd) {
      searchFrom = start.openEnd;
      continue;
    }

    const outerHtml = html.slice(start.start, end);
    const view = rawCollectionViewFromHtml(outerHtml, start.openTag, options.collectCollectionRows !== false);
    if (view.hash) collectionViews.push(view);

    nextHtml += html.slice(cursor, start.start);
    nextHtml += rawCollectionReplacementHtml(view, options);
    cursor = end;
    searchFrom = end;
  }

  if (collectionViews.length === 0) return { html, collectionViews: [] };
  nextHtml += html.slice(cursor);
  return { html: nextHtml, collectionViews: dedupeCollectionViews(collectionViews) };
}

function findNextRawCollectionStart(html: string, from: number): RawCollectionStart | null {
  const tagRe = /<(div|table)\b[^>]*>/gi;
  tagRe.lastIndex = from;
  while (true) {
    const match = tagRe.exec(html);
    if (!match) return null;
    const openTag = match[0];
    const className = rawAttributeValue(openTag, "class");
    if (!className) continue;
    const classes = className.split(/\s+/);
    if (!classes.includes("collection-content") && !classes.includes("collection-content-wrapper")) continue;
    return {
      start: match.index,
      openEnd: tagRe.lastIndex,
      tagName: match[1].toLowerCase(),
      openTag
    };
  }
}

function findRawElementEnd(html: string, start: RawCollectionStart): number {
  if (/\/\s*>$/.test(start.openTag)) return start.openEnd;
  const tagRe = new RegExp(`</?${start.tagName}\\b[^>]*>`, "gi");
  tagRe.lastIndex = start.start;
  let depth = 0;
  while (true) {
    const match = tagRe.exec(html);
    if (!match) return start.openEnd;
    const token = match[0];
    if (/^<\//.test(token)) {
      depth -= 1;
    } else if (!/\/\s*>$/.test(token)) {
      depth += 1;
    }
    if (depth === 0) return tagRe.lastIndex;
  }
}

function rawCollectionViewFromHtml(
  outerHtml: string,
  openTag: string,
  collectRows: boolean
): NotionCollectionView {
  const id = rawAttributeValue(openTag, "id") ?? "";
  const hash = id.replace(/-/g, "").toLowerCase();
  const title =
    rawElementTextByClass(outerHtml, "h4", "collection-title") ??
    "Untitled";
  const theadHtml = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(outerHtml)?.[1] ?? "";
  const fieldNames = Array.from(theadHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi))
    .map((match) => cleanRawHtmlText(match[1]))
    .filter(Boolean);
  const rowCount = Array.from(outerHtml.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/gi))
    .reduce((count, match) => count + countRawTags(match[1], "tr"), 0);
  const rowRefs = rawCollectionRowRefsFromHtml(outerHtml);
  const rows = collectRows ? rawCollectionRowsFromHtml(outerHtml, fieldNames) : [];
  return { hash, title, fieldNames, rowCount, ...nonEmptyCollectionRefs(rowRefs), rows };
}

function rawCollectionRowRefsFromHtml(outerHtml: string): NotionCollectionResolveContext {
  const rowHashes = new Set<string>();
  const rowHrefs = new Set<string>();
  for (const rowMatch of outerHtml.matchAll(/<tr\b([^>]*)>/gi)) {
    const hash = normalizeNotionHash(rawAttributeValue(rowMatch[0], "id") ?? "");
    if (hash) rowHashes.add(hash);
  }
  for (const linkMatch of outerHtml.matchAll(/<a\b[^>]*\shref\s*=\s*(["'])(.*?)\1/gi)) {
    const href = linkMatch[2] ?? "";
    if (!href) continue;
    rowHrefs.add(href);
    const hash = notionHashFromText(href);
    if (hash) rowHashes.add(hash);
  }
  return { rowHashes: Array.from(rowHashes), rowHrefs: Array.from(rowHrefs) };
}

function rawCollectionRowsFromHtml(outerHtml: string, fieldNames: string[]): NotionCollectionRow[] {
  if (fieldNames.length === 0) return [];
  const rows: NotionCollectionRow[] = [];
  for (const tbodyMatch of outerHtml.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/gi)) {
    const tbodyHtml = tbodyMatch[1] ?? "";
    for (const rowMatch of tbodyHtml.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
      const rowAttrs = rowMatch[1] ?? "";
      const rowHtml = rowMatch[2] ?? "";
      const hash = (rawAttributeValue(`<tr ${rowAttrs}>`, "id") ?? "").replace(/-/g, "").toLowerCase();
      if (!hash) continue;
      const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => match[1] ?? "");
      const values: Record<string, string> = {};
      for (let index = 0; index < fieldNames.length; index += 1) {
        const fieldName = fieldNames[index];
        if (!fieldName) continue;
        values[fieldName] = cleanRawHtmlText(cells[index] ?? "");
      }
      const title = values[fieldNames[0]] ?? "";
      const hrefMatch = /<a\b[^>]*\shref\s*=\s*(["'])(.*?)\1/i.exec(cells[0] ?? rowHtml);
      rows.push({
        hash,
        title,
        href: hrefMatch?.[2] ?? "",
        values
      });
    }
  }
  return rows;
}

function rawCollectionReplacementHtml(
  view: NotionCollectionView,
  options: ParseNotionHtmlOptions
): string {
  const title = view.title || "Embedded database";
  const target = options.resolveCollection?.(view.hash, title, collectionResolveContextFromView(view)) ?? null;
  if (!target) {
    return `<p data-lotion-collection-placeholder="true"><em>📂 ${escapeHtml(title)} (database not found)</em></p>`;
  }
  const dbId = collectionTargetDatabaseId(target);
  return `<p data-lotion-collection-placeholder="true">{{LOTIONVIEW:${escapeHtml(dbId)}}}</p>`;
}

function collectionTargetDatabaseId(target: string): string {
  if (target.startsWith("lotion-db:")) return target.slice("lotion-db:".length);
  return target
    .replace(/^\.?\//, "")
    .replace(/^(?:system\/)?databases\//, "")
    .replace(/\/data\.csv$/i, "")
    .replace(/\/$/, "");
}

function rawAttributeValue(tagHtml: string, attrName: string): string | null {
  const quoted = new RegExp(`\\s${attrName}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(tagHtml);
  if (quoted) return quoted[2];
  const unquoted = new RegExp(`\\s${attrName}\\s*=\\s*([^\\s>]+)`, "i").exec(tagHtml);
  return unquoted?.[1] ?? null;
}

function rawElementTextByClass(html: string, tagName: string, className: string): string | null {
  const re = new RegExp(`<${tagName}\\b(?=[^>]*\\bclass\\s*=\\s*(["'])[^"']*\\b${escapeRegExp(className)}\\b[^"']*\\1)[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
  const match = re.exec(html);
  const text = match ? cleanRawHtmlText(match[2]) : "";
  return text || null;
}

function countRawTags(html: string, tagName: string): number {
  return Array.from(html.matchAll(new RegExp(`<${tagName}\\b`, "gi"))).length;
}

function collectionResolveContext(collection: NhpElement): NotionCollectionResolveContext {
  const rowHashes = new Set<string>();
  const rowHrefs = new Set<string>();
  for (const row of collection.querySelectorAll("tbody tr")) {
    const hash = normalizeNotionHash(row.getAttribute("id") ?? "");
    if (hash) rowHashes.add(hash);
  }
  for (const link of collection.querySelectorAll("tbody a[href]")) {
    const href = link.getAttribute("href") ?? "";
    if (!href) continue;
    rowHrefs.add(href);
    const hash = notionHashFromText(href);
    if (hash) rowHashes.add(hash);
  }
  return { rowHashes: Array.from(rowHashes), rowHrefs: Array.from(rowHrefs) };
}

function collectionResolveContextFromView(view: NotionCollectionView): NotionCollectionResolveContext {
  const rowHashes = new Set<string>(view.rowHashes ?? []);
  const rowHrefs = new Set<string>(view.rowHrefs ?? []);
  for (const row of view.rows ?? []) {
    const hash = normalizeNotionHash(row.hash);
    if (hash) rowHashes.add(hash);
    if (row.href) rowHrefs.add(row.href);
  }
  return { rowHashes: Array.from(rowHashes), rowHrefs: Array.from(rowHrefs) };
}

function nonEmptyCollectionRefs(
  context: NotionCollectionResolveContext
): Pick<NotionCollectionView, "rowHashes" | "rowHrefs"> {
  return {
    ...(context.rowHashes.length > 0 ? { rowHashes: context.rowHashes } : {}),
    ...(context.rowHrefs.length > 0 ? { rowHrefs: context.rowHrefs } : {})
  };
}

function normalizeNotionHash(value: string): string {
  const compact = value.replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(compact) ? compact : "";
}

function notionHashFromText(value: string): string {
  const text = safeDecodeURIComponent(value).toLowerCase();
  const hashes = [
    ...Array.from(
      text.matchAll(/(?:^|[^0-9a-f])([0-9a-f]{32})(?=$|[^0-9a-f])/g),
      (match) => match[1]
    ),
    ...Array.from(
      text.matchAll(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g),
      (match) => match[1].replace(/-/g, "")
    )
  ];
  return hashes.at(-1) ?? "";
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function cleanRawHtmlText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return "\"";
    if (lower === "apos") return "'";
    if (lower === "nbsp") return " ";
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return isValidCodePoint(code) ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return isValidCodePoint(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

function isValidCodePoint(code: number): boolean {
  return Number.isFinite(code) && code >= 0 && code <= 0x10ffff;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mergeCollectionViews(
  precomputed: NotionCollectionView[],
  parsed: NotionCollectionView[]
): NotionCollectionView[] {
  return dedupeCollectionViews([...precomputed, ...parsed]);
}

function dedupeCollectionViews(views: NotionCollectionView[]): NotionCollectionView[] {
  const seen = new Set<string>();
  const out: NotionCollectionView[] = [];
  for (const view of views) {
    const key = view.hash || `${view.title}\0${view.fieldNames.join("\0")}\0${view.rowCount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(view);
  }
  return out;
}

function collectCollectionViews(body: NhpElement): NotionCollectionView[] {
  const views: NotionCollectionView[] = [];
  for (const collection of body.querySelectorAll(
    "div.collection-content, table.collection-content, div.collection-content-wrapper"
  )) {
    if (hasCollectionAncestor(collection, body)) continue;
    const id = collection.getAttribute("id") ?? "";
    const hash = id.replace(/-/g, "").toLowerCase();
    if (!hash) continue;
    const title =
      collection.querySelector("h4.collection-title")?.text.trim() ??
      collection.querySelector("th .cell-title")?.text.trim() ??
      "Untitled";
    const fieldNames = collection.querySelectorAll("thead th")
      .map((th) => cleanCollectionHeader(th))
      .filter(Boolean);
    views.push({
      hash,
      title,
      fieldNames,
      rowCount: collection.querySelectorAll("tbody tr").length,
      ...nonEmptyCollectionRefs(collectionResolveContext(collection)),
      rows: []
    });
  }
  return views;
}

function hasCollectionAncestor(node: NhpElement, stopAt: NhpElement): boolean {
  let parent = node.parentNode as NhpElement | null;
  while (parent && parent !== stopAt) {
    const cls = (parent.getAttribute?.("class") ?? "").split(/\s+/);
    const parentHash = (parent.getAttribute?.("id") ?? "").replace(/-/g, "").toLowerCase();
    if (parentHash && (cls.includes("collection-content") || cls.includes("collection-content-wrapper"))) {
      return true;
    }
    parent = parent.parentNode as NhpElement | null;
  }
  return false;
}

function cleanCollectionHeader(element: NhpElement): string {
  const clone = element.clone() as NhpElement;
  for (const icon of clone.querySelectorAll("span.icon, img.icon, img")) {
    icon.remove();
  }
  return clone.text.trim();
}

function propertyCellValue(
  cell: NhpElement | null,
  notionType: string | undefined,
  resolveLink?: NotionLinkResolver
): string {
  if (!cell) return "";
  if (notionType === "multi_select") {
    return propertyCellOptions(cell, notionType).map((option) => option.name).join(";");
  }
  if (notionType === "select" || notionType === "status") {
    return propertyCellOptions(cell, notionType)[0]?.name ?? cell.text.trim();
  }
  if (!shouldPreservePropertyLinks(notionType) || cell.querySelectorAll("a[href]").length === 0) {
    return cell.text.trim();
  }

  const clone = cell.clone() as NhpElement;
  for (const anchor of clone.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") ?? "";
    const label = textWithoutInlineIcon(anchor as NhpElement) || href;
    const target = propertyLinkTarget(href, resolveLink);
    if (!target) continue;
    anchor.replaceWith(escapeHtml(markdownLink(label, target)));
  }

  // Property icons embedded inside link labels should not leak into
  // the imported value once links have been converted.
  for (const icon of clone.querySelectorAll("span.icon, img.icon, img.notion-static-icon")) {
    icon.remove();
  }

  return clone.text.trim();
}

function propertyCellOptions(cell: NhpElement | null, notionType: string | undefined): NotionPropertyOption[] {
  if (!cell || (notionType !== "select" && notionType !== "multi_select" && notionType !== "status")) return [];
  const options: NotionPropertyOption[] = [];
  for (const node of cell.querySelectorAll("span.selected-value, span.status-value")) {
    const name = node.text.trim();
    if (!name) continue;
    options.push({ name, color: notionOptionColor(node.getAttribute("class") ?? "") });
  }
  return options;
}

function notionOptionColor(className: string): string | undefined {
  const match = /select-value-color-([a-z]+)/.exec(className);
  const color = match?.[1];
  if (!color || color === "default") return "gray";
  return color;
}

function shouldPreservePropertyLinks(notionType: string | undefined): boolean {
  switch (notionType) {
    case "url":
    case "email":
    case "phone_number":
    case "date":
    case "created_time":
    case "last_edited_time":
    case "number":
    case "checkbox":
    case "select":
    case "multi_select":
    case "status":
      return false;
    default:
      return true;
  }
}

function propertyLinkTarget(href: string, resolveLink?: NotionLinkResolver): string | null {
  if (!href) return null;
  let decoded = href;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    try { decoded = decodeURIComponent(href); } catch { /* keep href */ }
  }

  const resolved = resolveLink?.(decoded, "anchor");
  if (resolved) return resolved;

  const hash = notionTargetHash(decoded);
  if (hash) return `notion-hash:${hash}`;
  return decoded;
}

function notionTargetHash(target: string): string | null {
  const withoutFragment = target.split(/[?#]/, 1)[0] ?? target;
  const compact = withoutFragment.replace(/-/g, "");
  const match = /([0-9a-f]{32})(?:_all)?(?:\.(?:html|md|csv))?$/i.exec(compact);
  return match?.[1]?.toLowerCase() ?? null;
}

function textWithoutInlineIcon(element: NhpElement): string {
  const clone = element.clone() as NhpElement;
  for (const icon of clone.querySelectorAll("span.icon, img.icon, img.notion-static-icon")) {
    icon.remove();
  }
  return clone.text.trim();
}

function markdownLink(label: string, target: string): string {
  return `[${escapeMarkdownLinkText(label)}](${escapeMarkdownLinkTarget(target)})`;
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

function escapeMarkdownLinkTarget(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "%5C")
    .replace(/\s/g, "%20")
    .replace(/\)/g, "%29");
}

/**
 * Walk every `<a href>` and `<img src>` under `root` and let the
 * resolver rewrite the attribute. URLs with a scheme (http:, mailto:,
 * `notion-db:` sentinels) are passed through verbatim — the resolver
 * decides what to do with them. Relative paths are
 * `decodeURIComponent`-ed first so the resolver sees them in the same
 * form whether or not the original was percent-encoded.
 */
function rewriteLinks(root: NhpElement, resolve: NotionLinkResolver): void {
  for (const a of root.querySelectorAll("a")) {
    const href = a.getAttribute("href");
    if (!href) continue;
    let decoded = href;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      try { decoded = decodeURIComponent(href); } catch { /* leave as-is */ }
    }
    const next = resolve(decoded, "anchor");
    if (next !== null) a.setAttribute("href", next);
  }
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (!src) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) continue;
    let decoded = src;
    try { decoded = decodeURIComponent(src); } catch { /* leave as-is */ }
    fillMissingImageAltFromPath(img as NhpElement, decoded);
    const next = resolve(decoded, "image");
    if (next !== null) img.setAttribute("src", next);
  }
}

function fillMissingImageAltFromPath(img: NhpElement, src: string): void {
  const current = img.getAttribute("alt");
  if (current && current.trim().length > 0) return;
  const alt = imageAltFromPath(src);
  if (alt) img.setAttribute("alt", alt);
}

function imageAltFromPath(src: string): string {
  const pathOnly = src.split(/[?#]/, 1)[0] ?? "";
  const basename = pathOnly.split(/[\\/]/).pop() ?? "";
  return decodeRepeatedly(basename)
    .replace(/_\((\d+)\)(?=(?:\.[^.]+)?$)/g, " ($1)")
    .trim();
}

function decodeRepeatedly(value: string): string {
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : "&gt;"
  );
}

interface IframePreview {
  url: string;
  height: number;
  title: string;
}

function iframePreviewFromSourceFigure(figure: NhpElement): IframePreview | null {
  const cls = figure.getAttribute("class") ?? "";
  if (/\b(?:image|callout)\b/.test(cls)) return null;
  const sourceLink = figure.querySelector("div.source a");
  const href = sourceLink?.getAttribute("href")?.trim();
  if (!href) return null;
  return iframePreviewForUrl(href);
}

function iframePreviewForUrl(url: string): IframePreview | null {
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

function calloutIconFromNode(node: unknown): string {
  const el = node as {
    querySelector?: (sel: string) => { textContent?: string; getAttribute?: (name: string) => string | null } | null;
  };
  const textIcon = el.querySelector?.("span.icon")?.textContent?.trim();
  if (textIcon) return textIcon;
  const imgIcon = el.querySelector?.("img.notion-static-icon, img.icon");
  const alt = imgIcon?.getAttribute?.("alt")?.trim();
  if (alt) return alt;
  return imgIcon?.getAttribute?.("src")?.trim() ?? "";
}

function calloutBodyHtmlFromNode(node: unknown): string {
  const clone = (node as { cloneNode?: (deep: boolean) => unknown }).cloneNode?.(true);
  if (!clone) return "";
  const root = clone as {
    children?: ArrayLike<unknown>;
    innerHTML?: string;
    querySelector?: (sel: string) => unknown;
  };
  const iconNode = root.querySelector?.("span.icon, img.notion-static-icon, img.icon") as
    | { closest?: (sel: string) => { remove?: () => void } | null; remove?: () => void }
    | null;
  iconNode?.closest?.("div")?.remove?.();
  iconNode?.remove?.();
  const elementChildren = Array.from(root.children ?? []) as Array<{ innerHTML?: string; textContent?: string }>;
  if (elementChildren.length === 1 && (elementChildren[0].innerHTML ?? "").trim()) {
    return elementChildren[0].innerHTML ?? "";
  }
  return root.innerHTML ?? "";
}

function fencedCalloutMarkdown(icon: string, bodyMarkdown: string, background = ""): string {
  let fence = "```";
  while (bodyMarkdown.includes(fence)) fence += "`";
  const body = bodyMarkdown.trim();
  const backgroundLine = background.trim() ? `background: ${background.trim()}\n` : "";
  return `\n\n${fence}lotion-callout\nicon: ${icon.trim() || "💡"}\n${backgroundLine}---\n${body}\n${fence}\n\n`;
}

function fencedToggleMarkdown(summary: string, bodyMarkdown: string, open: boolean): string {
  let fence = "```";
  while (bodyMarkdown.includes(fence)) fence += "`";
  const safeSummary = summary.replace(/\s+/g, " ").trim() || "Toggle";
  const body = bodyMarkdown.trim();
  return `\n\n${fence}lotion-toggle\nsummary: ${safeSummary}\nopen: ${open ? "true" : "false"}\n---\n${body}\n${fence}\n\n`;
}

function fencedEquationMarkdown(latex: string): string {
  let fence = "```";
  while (latex.includes(fence)) fence += "`";
  return `\n\n${fence}lotion-equation\n${latex.trim()}\n${fence}\n\n`;
}

function isDetailsOpen(node: unknown): boolean {
  const element = node as { getAttribute?: (name: string) => string | null };
  const value = element.getAttribute?.("open");
  return value !== undefined && value !== null;
}

function isEquationNode(node: unknown): boolean {
  const element = node as {
    nodeName?: string;
    tagName?: string;
    getAttribute?: (name: string) => string | null;
    querySelector?: (selector: string) => unknown;
  };
  const nodeName = (element.nodeName ?? element.tagName ?? "").toUpperCase();
  if (!["DIV", "FIGURE", "P", "SPAN"].includes(nodeName)) return false;
  if (element.getAttribute?.("data-expression")) return true;
  const cls = element.getAttribute?.("class") ?? "";
  if (/\b(?:equation|katex-display)\b/.test(cls)) return true;
  if (/\bkatex\b/.test(cls) && equationAnnotationText(element)) return true;
  return false;
}

function outermostEquationNodes(root: NhpElement): NhpElement[] {
  return root.querySelectorAll("div, figure, p, span")
    .filter((node) => isEquationNode(node) && !hasEquationAncestor(node, root));
}

function hasEquationAncestor(node: NhpElement, root: NhpElement): boolean {
  let parent = node.parentNode as NhpElement | null;
  while (parent && parent !== root) {
    if (isEquationNode(parent)) return true;
    parent = parent.parentNode as NhpElement | null;
  }
  return false;
}

function equationLatexFromNode(node: unknown): string {
  const element = node as {
    textContent?: string;
    getAttribute?: (name: string) => string | null;
  };
  const expression = element.getAttribute?.("data-expression")?.trim();
  if (expression) return decodeHtmlEntities(expression);
  const annotated = equationAnnotationText(element)?.trim();
  if (annotated) return decodeHtmlEntities(annotated);
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function equationAnnotationText(node: unknown): string {
  const element = node as {
    querySelector?: (selector: string) => { textContent?: string } | null;
  };
  return element.querySelector?.("annotation[encoding='application/x-tex']")?.textContent ??
    element.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent ??
    "";
}

function normalizeAttachmentMarkdown(markdown: string): string {
  return markdown.replace(
    /(!?)\[((?:\\.|[^\]\\])*)\]\((attachments\/[A-Za-z0-9_-]+\/(?:\\.|[^\\)\s])*)\)/g,
    (match: string, bang: string, label: string, target: string) => {
      const nextLabel = bang === "!" ? label : label.replace(/\\_/g, "_");
      const nextTarget = target.replace(/\\(.)/g, "$1");
      if (nextLabel === label && nextTarget === target) return match;
      return `${bang}[${nextLabel}](${nextTarget})`;
    }
  );
}

function normalizePlainTextBracketEscapes(markdown: string): string {
  let inFence = false;
  return markdown.split("\n").map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    if (/\]\s*(?:\(|\[)/.test(line)) return line;
    return line.replace(/\\([\[\]])/g, "$1");
  }).join("\n");
}

/**
 * Merge adjacent `<ul class="X">` or `<ol class="X">` siblings so a
 * Notion-exported list (which uses one `<ul>` per `<li>`) renders as a
 * single tight markdown list. Walks recursively so nested lists get
 * merged too. `b.remove()` mutates `parent.childNodes` in place, so we
 * walk by re-reading the array each iteration rather than caching.
 */
function mergeAdjacentLists(root: NhpElement): void {
  type NhpNode = {
    tagName?: string;
    classList?: { value?: string[] };
    childNodes?: NhpNode[];
    appendChild?: (c: NhpNode) => void;
    remove?: () => void;
  };
  const sameClass = (a: NhpNode, b: NhpNode): boolean => {
    const av = (a.classList?.value ?? []).slice().sort().join(",");
    const bv = (b.classList?.value ?? []).slice().sort().join(",");
    return av === bv;
  };
  const visit = (parent: NhpNode): void => {
    // Re-read childNodes each pass so we don't trip over remove()
    // mutating the array.
    let i = 0;
    while (true) {
      const kids = parent.childNodes ?? [];
      if (i >= kids.length - 1) break;
      const a = kids[i];
      const b = kids[i + 1];
      const aTag = a?.tagName?.toLowerCase();
      const bTag = b?.tagName?.toLowerCase();
      if (aTag === bTag && (aTag === "ul" || aTag === "ol") && sameClass(a, b)) {
        for (const child of (b.childNodes ?? []).slice()) {
          a.appendChild?.(child);
        }
        b.remove?.();
        // Stay at the same `i` so the merged `a` is compared against
        // whatever now sits at `i+1`.
        continue;
      }
      i += 1;
    }
    for (const child of (parent.childNodes ?? []) as NhpNode[]) {
      if (child?.tagName) visit(child);
    }
  };
  visit(root as unknown as NhpNode);
}
