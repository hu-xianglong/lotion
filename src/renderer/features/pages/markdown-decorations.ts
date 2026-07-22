import { syntaxTree } from "@codemirror/language";
import {
  type EditorState,
  type Extension,
  Facet,
  type Range,
  type SelectionRange,
  StateEffect,
  StateField,
  type Text,
  type Transaction
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from "@codemirror/view";
import MarkdownIt from "markdown-it";
import { perfLog } from "../../lib/perf-log";
import { emojiIconText, isEmojiIcon } from "../../../shared/entity-icons";
import { shouldRebuildMarkdownBlockDecorationsForTextChange } from "../../../shared/markdown-live-preview-policy";
import { findBareUrls, standaloneBareUrl, visibleLines, webPreviewForUrl } from "./web-links";

// Shared markdown-it instance for widget interiors — GFM tables / inline
// formatting are on by default. `html: false` so cells can't smuggle in
// raw HTML.
const widgetMarkdown = new MarkdownIt({ html: false, linkify: true, breaks: false });

function renderWidgetMarkdown(markdown: string): string {
  return restoreSafeInlineHtml(widgetMarkdown.render(normalizeWidgetMarkdown(markdown)));
}

function normalizeWidgetMarkdown(markdown: string): string {
  return mergeBlockquoteClosingInlineMarkers(markdown.replace(/\r\n?/g, "\n"));
}

function mergeBlockquoteClosingInlineMarkers(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const close = /^( {0,3}>\s?)(\*\*\*|___|\*\*|__|\*|_)\s*$/.exec(line);
    if (!close) {
      out.push(line);
      continue;
    }
    const previous = out.at(-1);
    if (!previous || !previous.startsWith(close[1])) {
      out.push(line);
      continue;
    }
    const previousContent = previous.slice(close[1].length);
    const marker = close[2];
    if (!previousContent.includes(marker) || previousContent.trimEnd().endsWith(marker)) {
      out.push(line);
      continue;
    }
    out[out.length - 1] = `${previous.replace(/[ \t]+$/, "")}${marker}`;
  }
  return out.join("\n");
}

const notionColorNames = "gray|brown|orange|yellow|green|blue|purple|pink|red";
const notionColorNamePattern = new RegExp(`^(${notionColorNames})$`);

function restoreSafeInlineHtml(html: string): string {
  return html
    .replace(/&lt;(\/?)(del|ins|mark|s|sub|sup|u)&gt;/g, "<$1$2>")
    .replace(
      new RegExp(`&lt;span\\s+data-lotion-(color|bg)=(?:"|&quot;)(${notionColorNames})(?:"|&quot;)\\s*&gt;`, "gi"),
      (_match, kind: "color" | "bg", color: string) => {
        const normalized = color.toLowerCase();
        return `<span class="cm-md-notion-${kind} cm-md-notion-${kind}-${normalized}" data-lotion-${kind}="${normalized}">`;
      }
    )
    .replace(/&lt;\/span&gt;/gi, "</span>");
}

// Diagnostic switch — flip to true to log every node name visited.
const DEBUG = false;
const PERF_LOG_MIN_MS = 2;

export const showEmbedSourceFacet = Facet.define<boolean, boolean>({
  combine: (values) => (values.length > 0 ? values[0] : false)
});

export const markdownDecorationsEnabledFacet = Facet.define<boolean, boolean>({
  combine: (values) => (values.length > 0 ? values[0] : true)
});

export interface MissingEmbeddedViewDiagnosticCopy {
  label: string;
  title: string;
  message: string;
  searchText: string;
  searchAriaLabel: string;
  ariaLabel: string;
}

export function missingEmbeddedViewDiagnosticCopy(title: string): MissingEmbeddedViewDiagnosticCopy {
  const normalizedTitle = title.trim() || "Embedded view";
  return {
    label: "Missing imported view",
    title: normalizedTitle,
    message: "Imported Notion embedded database/page view could not be matched to a Lotion database. Search the workspace or open the original Notion source to recover it.",
    searchText: "Search workspace",
    searchAriaLabel: `Search workspace for missing imported view ${normalizedTitle}`,
    ariaLabel: `Missing imported Notion embedded view: ${normalizedTitle}`
  };
}

const revealEmbedSourceEffect = StateEffect.define<number>();

const revealedEmbedSourceField = StateField.define<number | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(revealEmbedSourceEffect)) return effect.value;
    }
    return value === null ? null : tr.changes.mapPos(value);
  }
});

/**
 * Markdown editor decorations, split between two extension shapes
 * because CodeMirror 6 enforces a hard rule: anything that affects
 * line geometry (block widgets, line decorations that change height)
 * must come from a `StateField` derived via `EditorView.decorations.from`,
 * never from a `ViewPlugin`'s `decorations` field. Inline mark
 * decorations are fine in either, so we keep those in the plugin for
 * cheaper updates on viewport change.
 *
 * The original "Block decorations may not be specified via plugins"
 * RangeError lives in docs/lessons.md — read that before merging the
 * two sources back together.
 */

// ── shared decoration constructors ─────────────────────────────────────

const lineDeco = (cls: string) => Decoration.line({ class: cls });
const markDeco = (cls: string) => Decoration.mark({ class: cls });
const linkMarkDecoForUrl = (url: string) => Decoration.mark({
  class: "cm-md-link",
  attributes: { "data-md-url": url }
});
const urlMarkDecoForUrl = (url: string) => Decoration.mark({
  class: "cm-md-url",
  attributes: { "data-md-url": url }
});

const lineDecorations: Record<string, Decoration> = {
  ATXHeading1: lineDeco("cm-md-line-h1"),
  ATXHeading2: lineDeco("cm-md-line-h2"),
  ATXHeading3: lineDeco("cm-md-line-h3"),
  ATXHeading4: lineDeco("cm-md-line-h4"),
  ATXHeading5: lineDeco("cm-md-line-h5"),
  ATXHeading6: lineDeco("cm-md-line-h6"),
  Blockquote: lineDeco("cm-md-line-blockquote"),
  HorizontalRule: lineDeco("cm-md-line-hr")
};

const codeLineDeco = lineDeco("cm-md-line-code");
const codeFenceLineDeco = lineDeco("cm-md-line-code-fence");

const inlineDecorations: Record<string, Decoration> = {
  StrongEmphasis: markDeco("cm-md-strong"),
  Emphasis: markDeco("cm-md-emphasis"),
  Strikethrough: markDeco("cm-md-strike"),
  InlineCode: markDeco("cm-md-inline-code"),
  URL: markDeco("cm-md-url"),
  Image: markDeco("cm-md-image-ref"),
  Task: markDeco("cm-md-task")
};

const markerDeco = markDeco("cm-md-marker");
const taskDoneDeco = markDeco("cm-md-task-done");
const underlineDeco = markDeco("cm-md-underline");
const highlightDeco = markDeco("cm-md-highlight");
const superscriptDeco = markDeco("cm-md-superscript");
const subscriptDeco = markDeco("cm-md-subscript");
const selectedLineDeco = lineDeco("cm-md-line-has-selection");
const notionColorDeco = (kind: "color" | "bg", color: string) =>
  markDeco(`cm-md-notion-${kind} cm-md-notion-${kind}-${color}`);

// Markers we want to *style* (greyish) when cursor sits on the line so
// the user can still see and edit the syntax.
const markerNodeNames = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "QuoteMark",
  "ListMark",
  "LinkMark",
  "URLMark",
  "ImageMark",
  "TaskMarker",
  "StrikethroughMark"
]);

// Markers we *hide* completely (Obsidian-style) when the cursor is on
// a different line. The line decoration / widget replacement keeps the
// visual structure (blockquote left border, bullet dot, checkbox).
const hideableMarkerNames = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "LinkMark",
  "URLMark",
  "ImageMark",
  "StrikethroughMark",
  "QuoteMark"
]);

const hideDeco = Decoration.replace({});

// ── widget classes ─────────────────────────────────────────────────────

function editSourceButton(
  view: EditorView,
  sourceFrom: number | undefined,
  options: { sourceTo?: number } = {}
): HTMLButtonElement | null {
  if (sourceFrom === undefined) return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cm-md-edit-source";
  button.textContent = "Edit source";
  button.title = "Edit source";
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceTo = options.sourceTo;
    view.dispatch({
      effects: revealEmbedSourceEffect.of(sourceFrom),
      selection: sourceTo !== undefined && sourceTo > sourceFrom
        ? { anchor: sourceFrom, head: sourceTo }
        : { anchor: sourceFrom },
      scrollIntoView: true
    });
    view.focus();
  });
  return button;
}

class BlockSourceEditWidget extends WidgetType {
  constructor(private readonly sourceFrom: number, private readonly sourceTo: number) {
    super();
  }

  eq(other: BlockSourceEditWidget): boolean {
    return other.sourceFrom === this.sourceFrom && other.sourceTo === this.sourceTo;
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-block-source-edit-widget";
    const button = editSourceButton(view, this.sourceFrom, { sourceTo: this.sourceTo });
    if (button) span.appendChild(button);
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class EscapedCharWidget extends WidgetType {
  constructor(private readonly char: string) {
    super();
  }

  eq(other: EscapedCharWidget): boolean {
    return other instanceof EscapedCharWidget && other.char === this.char;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-escaped-char";
    span.textContent = this.char;
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class DecodedLinkLabelWidget extends WidgetType {
  constructor(private readonly label: string, private readonly url: string) {
    super();
  }

  eq(other: DecodedLinkLabelWidget): boolean {
    return other instanceof DecodedLinkLabelWidget &&
      other.label === this.label &&
      other.url === this.url;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-decoded-link-label";
    span.textContent = this.label;
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

interface ImageAltFocusRequest {
  offset: number;
  selectAll: boolean;
}

class ImageWidget extends WidgetType {
  constructor(
    public src: string,
    public alt: string,
    private sourceFrom?: number,
    private sourceTo?: number,
    private altFocus?: ImageAltFocusRequest | null
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src &&
      other.alt === this.alt &&
      other.sourceFrom === this.sourceFrom &&
      other.sourceTo === this.sourceTo &&
      imageAltFocusEq(other.altFocus, this.altFocus);
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-image-widget";
    if (isMissingImageSource(this.src)) {
      const placeholder = document.createElement("div");
      placeholder.className = "cm-md-image-placeholder";
      placeholder.setAttribute("role", "img");
      placeholder.setAttribute(
        "aria-label",
        this.alt ? `${this.alt}: image source missing` : "Image source missing"
      );
      const icon = document.createElement("span");
      icon.className = "cm-md-image-placeholder-icon";
      icon.textContent = "Image";
      const label = document.createElement("span");
      label.className = "cm-md-image-placeholder-label";
      label.textContent = this.alt || "Add image source";
      placeholder.append(icon, label);
      wrap.appendChild(placeholder);
      if (this.sourceFrom !== undefined && this.sourceTo !== undefined) {
        enableImageAltEditing({
          initialAlt: this.alt,
          label,
          sourceFrom: this.sourceFrom,
          sourceTo: this.sourceTo,
          src: this.src,
          view
        });
        if (this.altFocus) focusImageAltText(label, this.altFocus);
      }
      attachRemeasureObserver(wrap, view);
      return wrap;
    }
    const img = document.createElement("img");
    // Workspace-relative paths (e.g. `attachments/images/foo.png`)
    // need to go through the `lotion-file://` scheme; without it the
    // browser resolves against the dev server origin and gets vite's
    // SPA fallback (text/html), which decodes as a broken image. URLs
    // that already have a scheme — `http:`, `https:`, `lotion-file:`,
    // `data:` — pass through unchanged.
    const resolvedSrc = renderableImageUrl(this.src);
    img.src = resolvedSrc;
    if (this.alt) img.alt = this.alt;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.title = "Double-click to view";
    img.draggable = false;
    wrap.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openImageLightbox(resolvedSrc, this.alt);
    });
    wrap.appendChild(img);
    attachRemeasureObserver(wrap, view);
    return wrap;
  }

  destroy(dom: HTMLElement): void {
    detachRemeasureObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function imageAltFocusEq(
  left: ImageAltFocusRequest | null | undefined,
  right: ImageAltFocusRequest | null | undefined
): boolean {
  if (!left && !right) return true;
  return Boolean(left && right && left.offset === right.offset && left.selectAll === right.selectAll);
}

interface ImageAltEditingConfig {
  initialAlt: string;
  label: HTMLElement;
  sourceFrom: number;
  sourceTo: number;
  src: string;
  view: EditorView;
}

function enableImageAltEditing(config: ImageAltEditingConfig): void {
  const { initialAlt, label, sourceFrom, sourceTo, src, view } = config;
  let cancelled = false;
  let showingPlaceholder = initialAlt.trim().length === 0;
  let committing = false;
  let commitTimer: number | null = null;
  let lastSerialized = serializeImageMarkdown(initialAlt, src);

  label.contentEditable = "plaintext-only";
  label.setAttribute("spellcheck", "false");
  label.setAttribute("aria-label", "Edit image alt text");

  const clearScheduledCommit = () => {
    if (commitTimer === null) return;
    window.clearTimeout(commitTimer);
    commitTimer = null;
  };

  const currentAlt = () => showingPlaceholder ? "" : normalizeImageAlt(label.textContent ?? "");

  const commit = (focusAfter = false) => {
    if (committing) return;
    const nextSerialized = serializeImageMarkdown(currentAlt(), src);
    if (nextSerialized === lastSerialized) {
      if (focusAfter) {
        view.dispatch({
          selection: { anchor: sourceFrom + nextSerialized.length },
          scrollIntoView: true
        });
      }
      return;
    }
    committing = true;
    lastSerialized = nextSerialized;
    view.dispatch({
      changes: { from: sourceFrom, to: sourceTo, insert: nextSerialized },
      selection: focusAfter ? { anchor: sourceFrom + nextSerialized.length } : undefined,
      scrollIntoView: focusAfter
    });
    view.requestMeasure();
  };

  const scheduleCommit = () => {
    clearScheduledCommit();
    commitTimer = window.setTimeout(() => {
      commitTimer = null;
      commit();
    }, 160);
  };

  const reset = () => {
    showingPlaceholder = initialAlt.trim().length === 0;
    label.textContent = initialAlt.trim() || "Add image source";
  };

  label.addEventListener("mousedown", (event) => event.stopPropagation());
  label.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    label.focus();
  });
  label.addEventListener("focus", () => {
    cancelled = false;
  });
  label.addEventListener("input", () => {
    showingPlaceholder = false;
    if (!cancelled) scheduleCommit();
  });
  label.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      clearScheduledCommit();
      commit(true);
      label.blur();
      view.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      clearScheduledCommit();
      cancelled = true;
      reset();
      label.blur();
      view.focus();
    }
  });
  label.addEventListener("blur", () => {
    clearScheduledCommit();
    if (!cancelled) commit();
  });
}

function focusImageAltText(label: HTMLElement, request: ImageAltFocusRequest): void {
  queueMicrotask(() => {
    if (!label.isConnected) return;
    label.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    if (request.selectAll) {
      range.selectNodeContents(label);
    } else {
      const firstChild = label.firstChild;
      if (firstChild?.nodeType === Node.TEXT_NODE) {
        const textLength = firstChild.textContent?.length ?? 0;
        range.setStart(firstChild, Math.min(request.offset, textLength));
        range.collapse(true);
      } else {
        range.selectNodeContents(label);
        range.collapse(false);
      }
    }

    selection.removeAllRanges();
    selection.addRange(range);
  });
}

function normalizeImageAlt(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function serializeImageMarkdown(alt: string, src: string): string {
  return `![${escapeMarkdownImageAlt(normalizeImageAlt(alt))}](${src})`;
}

function escapeMarkdownImageAlt(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/]/g, "\\]");
}

// Maps a workspace-relative attachment path to the `lotion-file://`
// URL the renderer can actually fetch. The custom scheme is wired up
// in `src/main/protocols.ts` and was originally added so page icons
// could load without disabling webSecurity; it works for any file
// inside the open workspace.
//
// `path` is expected to already be URL-encoded (turndown emits
// percent-encoded markdown URLs, which is what Lezer slices for us);
// we just attach the scheme + leading slash. The protocol handler
// runs `decodeURIComponent` on the pathname before hitting the
// filesystem, so double-encoding here would break the lookup.
function workspaceUrl(encodedPath: string): string {
  return `lotion-file:///${encodedPath.replace(/^\/+/, "")}`;
}

function renderableImageUrl(src: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) ? src : workspaceUrl(src);
}

function isMissingImageSource(src: string): boolean {
  const value = src.trim();
  if (!value) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  const normalized = value.replace(/^\/+/, "");
  return normalized === "attachments" || normalized.startsWith("attachments/") && normalized.endsWith("/");
}

function openImageLightbox(src: string, alt: string): void {
  document.querySelector(".cm-md-image-lightbox")?.remove();

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const minZoom = 0.5;
  const maxZoom = 4;
  const zoomStep = 0.25;
  let zoom = 1;

  const overlay = document.createElement("div");
  overlay.className = "cm-md-image-lightbox";
  overlay.tabIndex = -1;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.dataset.zoom = "100";

  const toolbar = document.createElement("div");
  toolbar.className = "cm-md-image-lightbox-toolbar";
  toolbar.setAttribute("aria-label", "Image preview controls");

  const zoomOutButton = lightboxButton("Zoom out", "-");
  const resetButton = lightboxButton("Reset zoom", "Reset");
  const zoomInButton = lightboxButton("Zoom in", "+");
  const closeButton = lightboxButton("Close image preview", "Close");
  const zoomStatus = document.createElement("span");
  zoomStatus.className = "cm-md-image-lightbox-zoom";
  zoomStatus.setAttribute("aria-live", "polite");

  toolbar.append(zoomOutButton, resetButton, zoomInButton, zoomStatus, closeButton);

  const stage = document.createElement("div");
  stage.className = "cm-md-image-lightbox-stage";

  const image = document.createElement("img");
  image.src = src;
  if (alt) {
    image.alt = alt;
    overlay.setAttribute("aria-label", alt);
  } else {
    overlay.setAttribute("aria-label", "Image preview");
  }
  image.draggable = false;

  stage.appendChild(image);
  overlay.append(toolbar, stage);
  document.body.appendChild(overlay);
  overlay.focus({ preventScroll: true });

  let closing = false;
  const updateZoom = (nextZoom: number) => {
    zoom = Math.max(minZoom, Math.min(maxZoom, Number(nextZoom.toFixed(2))));
    const percent = Math.round(zoom * 100);
    overlay.dataset.zoom = String(percent);
    image.style.transform = `scale(${zoom})`;
    zoomStatus.textContent = `${percent}%`;
    zoomOutButton.disabled = zoom <= minZoom;
    zoomInButton.disabled = zoom >= maxZoom;
  };
  const zoomIn = () => updateZoom(zoom + zoomStep);
  const zoomOut = () => updateZoom(zoom - zoomStep);
  const resetZoom = () => updateZoom(1);
  const removeOverlay = () => {
    document.removeEventListener("keydown", onKeyDown, true);
    overlay.removeEventListener("wheel", onWheel, { capture: true });
    overlay.remove();
    if (previousFocus?.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
  };
  const close = () => {
    if (closing) return;
    closing = true;
    removeOverlay();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") {
      event.preventDefault();
      zoomIn();
      return;
    }
    if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract") {
      event.preventDefault();
      zoomOut();
      return;
    }
    if (event.key === "0" || event.code === "Numpad0") {
      event.preventDefault();
      resetZoom();
    }
  };
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (event.deltaY < 0) zoomIn();
    else zoomOut();
  };

  toolbar.addEventListener("click", (event) => event.stopPropagation());
  image.addEventListener("click", (event) => event.stopPropagation());
  image.addEventListener("dblclick", (event) => event.stopPropagation());
  zoomOutButton.addEventListener("click", zoomOut);
  resetButton.addEventListener("click", resetZoom);
  zoomInButton.addEventListener("click", zoomIn);
  closeButton.addEventListener("click", close);
  overlay.addEventListener("click", close);
  overlay.addEventListener("dblclick", close);
  overlay.addEventListener("wheel", onWheel, { capture: true, passive: false });
  document.addEventListener("keydown", onKeyDown, true);
  updateZoom(1);
}

function lightboxButton(label: string, text: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cm-md-image-lightbox-button";
  button.setAttribute("aria-label", label);
  button.textContent = text;
  return button;
}

/** Lower-cased file extension without dot, or "" if none. */
function extOf(url: string): string {
  const noQuery = url.split(/[?#]/, 1)[0];
  const dot = noQuery.lastIndexOf(".");
  if (dot < 0) return "";
  return noQuery.slice(dot + 1).toLowerCase();
}

const PDF_EXTS = new Set(["pdf"]);
const VIDEO_EXTS = new Set(["mp4", "m4v", "mov", "webm"]);
const AUDIO_EXTS = new Set(["mp3", "m4a", "wav", "ogg"]);

/** True when `[label](url)` should render an inline preview below
 *  itself (PDF / video / audio). Image URLs go through markdown
 *  `![]()` syntax and aren't handled here. */
function isPreviewableAttachment(url: string): "pdf" | "video" | "audio" | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null; // external URL
  const ext = extOf(url);
  if (PDF_EXTS.has(ext)) return "pdf";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  return null;
}

class AttachmentPreviewWidget extends WidgetType {
  constructor(
    public path: string,
    public kind: "pdf" | "video" | "audio"
  ) {
    super();
  }

  eq(other: AttachmentPreviewWidget): boolean {
    return other.path === this.path && other.kind === this.kind;
  }

  toDOM(view: EditorView): HTMLElement {
    const outer = document.createElement("div");
    outer.className = "cm-md-attachment-preview-outer";
    const url = workspaceUrl(this.path);
    if (this.kind === "pdf") {
      const iframe = document.createElement("iframe");
      iframe.src = url;
      iframe.className = "cm-md-attachment-preview cm-md-attachment-preview-pdf";
      iframe.loading = "lazy";
      // Chromium's built-in PDF viewer needs same-origin sandbox; the
      // lotion-file scheme is privileged + secure (see protocols.ts).
      outer.appendChild(iframe);
    } else if (this.kind === "video") {
      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.preload = "metadata";
      video.className = "cm-md-attachment-preview cm-md-attachment-preview-video";
      outer.appendChild(video);
    } else {
      // audio
      const audio = document.createElement("audio");
      audio.src = url;
      audio.controls = true;
      audio.preload = "metadata";
      audio.className = "cm-md-attachment-preview cm-md-attachment-preview-audio";
      outer.appendChild(audio);
    }
    attachRemeasureObserver(outer, view);
    return outer;
  }

  destroy(dom: HTMLElement): void {
    detachRemeasureObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class IframeWidget extends WidgetType {
  constructor(public url: string, public height: number, public title: string, private sourceFrom?: number) {
    super();
  }

  eq(other: IframeWidget): boolean {
    return other.url === this.url &&
      other.height === this.height &&
      other.title === this.title &&
      other.sourceFrom === this.sourceFrom;
  }

  toDOM(view: EditorView): HTMLElement {
    // Outer wrap holds the vertical breathing room as *padding* so
    // CM picks it up via getBoundingClientRect (margins on widgets
    // are invisible to CM and cause click-position drift).
    const outer = document.createElement("div");
    outer.className = "cm-md-iframe-widget-outer";
    const wrap = document.createElement("div");
    wrap.className = "cm-md-iframe-widget";

    const header = document.createElement("div");
    header.className = "cm-md-iframe-widget-header";
    const titleEl = document.createElement("span");
    titleEl.className = "cm-md-iframe-widget-title";
    titleEl.textContent = this.title;
    header.appendChild(titleEl);
    const link = document.createElement("a");
    link.className = "cm-md-iframe-widget-url";
    link.href = this.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = this.url;
    header.appendChild(link);
    const editButton = editSourceButton(view, this.sourceFrom);
    if (editButton) header.appendChild(editButton);
    wrap.appendChild(header);

    const iframe = document.createElement("iframe");
    iframe.src = this.url;
    iframe.title = this.title;
    iframe.style.height = `${this.height}px`;
    iframe.referrerPolicy = "no-referrer";
    iframe.loading = "lazy";
    iframe.setAttribute("sandbox", "allow-same-origin allow-scripts allow-popups allow-forms");
    wrap.appendChild(iframe);
    outer.appendChild(wrap);
    attachRemeasureObserver(outer, view);
    return outer;
  }

  destroy(dom: HTMLElement): void {
    detachRemeasureObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class CalloutWidget extends WidgetType {
  constructor(public icon: string, public markdown: string, public background: string, private sourceFrom?: number) {
    super();
  }

  eq(other: CalloutWidget): boolean {
    return other.icon === this.icon &&
      other.markdown === this.markdown &&
      other.background === this.background &&
      other.sourceFrom === this.sourceFrom;
  }

  toDOM(view: EditorView): HTMLElement {
    const outer = document.createElement("div");
    outer.className = "cm-md-callout-widget-outer";
    const editButton = editSourceButton(view, this.sourceFrom);
    if (editButton) outer.appendChild(editButton);

    const wrap = document.createElement("div");
    wrap.className = "cm-md-callout-widget";
    if (this.background) {
      wrap.classList.add("cm-md-callout-bg", `cm-md-callout-bg-${this.background}`);
    }

    const icon = document.createElement("div");
    icon.className = "cm-md-callout-icon";
    const iconText = this.icon.trim() || "💡";
    if (/^(?:[a-z][a-z0-9+.-]*:|attachments\/|pages\/|databases\/)/i.test(iconText)) {
      const img = document.createElement("img");
      img.src = renderableImageUrl(iconText);
      img.alt = "";
      img.draggable = false;
      icon.appendChild(img);
    } else {
      icon.textContent = iconText;
    }
    wrap.appendChild(icon);

    const body = document.createElement("div");
    body.className = "cm-md-callout-body";
    body.innerHTML = renderWidgetMarkdown(this.markdown.trim());
    wrap.appendChild(body);

    outer.appendChild(wrap);
    attachRemeasureObserver(outer, view);
    return outer;
  }

  destroy(dom: HTMLElement): void {
    detachRemeasureObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class MissingDatabaseWidget extends WidgetType {
  constructor(public title: string, private sourceFrom?: number) {
    super();
  }

  eq(other: MissingDatabaseWidget): boolean {
    return other.title === this.title && other.sourceFrom === this.sourceFrom;
  }

  toDOM(view: EditorView): HTMLElement {
    const copy = missingEmbeddedViewDiagnosticCopy(this.title);
    const outer = document.createElement("div");
    outer.className = "cm-md-missing-database-widget-outer";
    const editButton = editSourceButton(view, this.sourceFrom);
    if (editButton) outer.appendChild(editButton);

    const card = document.createElement("div");
    card.className = "cm-md-missing-database-widget";
    card.setAttribute("role", "note");
    card.setAttribute("aria-label", copy.ariaLabel);

    const icon = document.createElement("span");
    icon.className = "cm-md-missing-database-icon";
    icon.textContent = "📂";

    const body = document.createElement("div");
    body.className = "cm-md-missing-database-body";
    const label = document.createElement("div");
    label.className = "cm-md-missing-database-label";
    label.textContent = copy.label;
    const title = document.createElement("div");
    title.className = "cm-md-missing-database-title";
    title.textContent = copy.title;
    const message = document.createElement("div");
    message.className = "cm-md-missing-database-message";
    message.textContent = copy.message;
    const actions = document.createElement("div");
    actions.className = "cm-md-missing-database-actions";
    const search = document.createElement("button");
    search.type = "button";
    search.className = "cm-md-missing-database-search";
    search.textContent = copy.searchText;
    search.setAttribute("aria-label", copy.searchAriaLabel);
    search.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(new CustomEvent("lotion:open-search", {
        detail: { pattern: this.title }
      }));
    });
    actions.appendChild(search);

    body.append(label, title, message, actions);
    card.append(icon, body);
    outer.appendChild(card);
    attachRemeasureObserver(outer, view);
    return outer;
  }

  destroy(dom: HTMLElement): void {
    detachRemeasureObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

interface ToggleSummaryFocusRequest {
  offset: number;
  selectAll: boolean;
}

class ToggleWidget extends WidgetType {
  constructor(
    public summary: string,
    public markdown: string,
    public open: boolean,
    private sourceFrom?: number,
    private sourceTo?: number,
    private summaryFocus?: ToggleSummaryFocusRequest | null
  ) {
    super();
  }

  eq(other: ToggleWidget): boolean {
    return other.summary === this.summary &&
      other.markdown === this.markdown &&
      other.open === this.open &&
      other.sourceFrom === this.sourceFrom &&
      other.sourceTo === this.sourceTo &&
      toggleSummaryFocusEq(other.summaryFocus, this.summaryFocus);
  }

  toDOM(view: EditorView): HTMLElement {
    const outer = document.createElement("div");
    outer.className = "cm-md-toggle-widget-outer";

    const details = document.createElement("div");
    details.className = "cm-md-toggle-widget";
    if (this.open) details.setAttribute("open", "");

    const summary = document.createElement("div");
    summary.className = "cm-md-toggle-summary";
    const disclosure = document.createElement("button");
    disclosure.className = "cm-md-toggle-disclosure";
    disclosure.type = "button";
    disclosure.textContent = this.open ? "▾" : "▸";
    disclosure.setAttribute("aria-label", this.open ? "Collapse toggle" : "Expand toggle");
    disclosure.setAttribute("aria-expanded", this.open ? "true" : "false");
    const summaryText = document.createElement("span");
    summaryText.className = "cm-md-toggle-summary-text";
    summaryText.textContent = this.summary.trim() || "Toggle";
    summary.appendChild(disclosure);
    summary.appendChild(summaryText);
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "cm-md-toggle-body";
    body.innerHTML = renderToggleMarkdown(this.markdown);
    body.dataset.rawMarkdown = this.markdown.trim();
    body.hidden = !this.open;
    hydrateRenderedMarkdown(body, view);
    details.appendChild(body);

    if (this.sourceFrom !== undefined && this.sourceTo !== undefined) {
      enableToggleEditing({
        body,
        details,
        initialMarkdown: this.markdown,
        initialOpen: this.open,
        initialSummary: this.summary,
        disclosure,
        sourceFrom: this.sourceFrom,
        sourceTo: this.sourceTo,
        summary,
        summaryText,
        view
      });
      if (this.summaryFocus) focusToggleSummaryText(summaryText, this.summaryFocus);
    } else {
      const setOpen = (nextOpen: boolean) => {
        if (nextOpen) {
          details.setAttribute("open", "");
        } else {
          details.removeAttribute("open");
        }
        body.hidden = !nextOpen;
        disclosure.textContent = nextOpen ? "▾" : "▸";
        disclosure.setAttribute("aria-expanded", nextOpen ? "true" : "false");
        disclosure.setAttribute("aria-label", nextOpen ? "Collapse toggle" : "Expand toggle");
        view.requestMeasure();
      };
      disclosure.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setOpen(!details.hasAttribute("open"));
      });
      summary.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setOpen(!details.hasAttribute("open"));
      });
    }

    outer.appendChild(details);
    attachRemeasureObserver(outer, view);
    return outer;
  }

  destroy(dom: HTMLElement): void {
    detachRemeasureObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function toggleSummaryFocusEq(
  left: ToggleSummaryFocusRequest | null | undefined,
  right: ToggleSummaryFocusRequest | null | undefined
): boolean {
  if (!left && !right) return true;
  return Boolean(left && right && left.offset === right.offset && left.selectAll === right.selectAll);
}

interface ToggleEditingConfig {
  body: HTMLElement;
  details: HTMLElement;
  disclosure: HTMLButtonElement;
  initialMarkdown: string;
  initialOpen: boolean;
  initialSummary: string;
  sourceFrom: number;
  sourceTo: number;
  summary: HTMLElement;
  summaryText: HTMLElement;
  view: EditorView;
}

function enableToggleEditing(config: ToggleEditingConfig): void {
  const { body, details, disclosure, initialMarkdown, initialOpen, initialSummary, sourceFrom, sourceTo, summary, summaryText, view } = config;
  let cancelledSummary = false;
  let lastSerialized = serializeToggleFence(initialSummary, initialMarkdown, initialOpen);
  let committing = false;
  let currentOpen = initialOpen;
  let summaryCommitTimer: number | null = null;
  let summaryToggleTimer: number | null = null;

  summaryText.contentEditable = "plaintext-only";
  summaryText.setAttribute("spellcheck", "false");
  summaryText.setAttribute("aria-label", "Edit toggle summary");
  body.setAttribute("aria-label", "Toggle body");

  const commit = (nextOpen = currentOpen) => {
    if (committing) return;
    const nextSummary = normalizeToggleSummary(summaryText.textContent ?? "");
    const nextMarkdown = normalizeToggleMarkdown(initialMarkdown);
    const nextSerialized = serializeToggleFence(nextSummary, nextMarkdown, nextOpen);
    if (nextSerialized === lastSerialized) return;
    committing = true;
    lastSerialized = nextSerialized;
    try {
      view.dispatch({
        changes: { from: sourceFrom, to: sourceTo, insert: nextSerialized }
      });
      view.requestMeasure();
    } finally {
      committing = false;
    }
  };

  const clearScheduledSummaryCommit = () => {
    if (summaryCommitTimer === null) return;
    window.clearTimeout(summaryCommitTimer);
    summaryCommitTimer = null;
  };

  const scheduleSummaryCommit = () => {
    clearScheduledSummaryCommit();
    summaryCommitTimer = window.setTimeout(() => {
      summaryCommitTimer = null;
      commit();
    }, 160);
  };

  const clearScheduledSummaryToggle = () => {
    if (summaryToggleTimer === null) return;
    window.clearTimeout(summaryToggleTimer);
    summaryToggleTimer = null;
  };

  const scheduleSummaryToggle = () => {
    clearScheduledSummaryToggle();
    summaryToggleTimer = window.setTimeout(() => {
      summaryToggleTimer = null;
      if (!details.isConnected) return;
      setOpen(!currentOpen);
    }, 160);
  };

  const setOpen = (nextOpen: boolean) => {
    currentOpen = nextOpen;
    if (currentOpen) {
      details.setAttribute("open", "");
    } else {
      details.removeAttribute("open");
    }
    body.hidden = !currentOpen;
    disclosure.textContent = currentOpen ? "▾" : "▸";
    disclosure.setAttribute("aria-label", currentOpen ? "Collapse toggle" : "Expand toggle");
    disclosure.setAttribute("aria-expanded", currentOpen ? "true" : "false");
    view.requestMeasure();
    commit(currentOpen);
  };

  const resetSummary = () => {
    summaryText.textContent = initialSummary.trim() || "Toggle";
  };

  summary.addEventListener("click", (event) => {
    if (event.target === disclosure) return;
    event.preventDefault();
    event.stopPropagation();
    scheduleSummaryToggle();
  });
  summaryText.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  summaryText.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    scheduleSummaryToggle();
  });
  summaryText.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearScheduledSummaryToggle();
    focusToggleSummaryText(summaryText, { offset: 0, selectAll: true });
  });
  summaryText.addEventListener("focus", () => {
    cancelledSummary = false;
  });
  summaryText.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      clearScheduledSummaryCommit();
      commit();
      summaryText.blur();
      view.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      clearScheduledSummaryCommit();
      cancelledSummary = true;
      resetSummary();
      summaryText.blur();
      view.focus();
    }
  });
  summaryText.addEventListener("input", () => {
    if (!cancelledSummary) scheduleSummaryCommit();
  });
  summaryText.addEventListener("blur", () => {
    clearScheduledSummaryCommit();
    if (!cancelledSummary) commit();
  });

  disclosure.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(!currentOpen);
  });
}

function focusToggleSummaryText(summaryText: HTMLElement, request: ToggleSummaryFocusRequest): void {
  queueMicrotask(() => {
    if (!summaryText.isConnected) return;
    summaryText.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    if (request.selectAll) {
      range.selectNodeContents(summaryText);
    } else {
      const firstChild = summaryText.firstChild;
      if (firstChild?.nodeType === Node.TEXT_NODE) {
        const textLength = firstChild.textContent?.length ?? 0;
        range.setStart(firstChild, Math.min(request.offset, textLength));
        range.collapse(true);
      } else {
        range.selectNodeContents(summaryText);
        range.collapse(false);
      }
    }

    selection.removeAllRanges();
    selection.addRange(range);
  });
}

function renderToggleMarkdown(markdown: string): string {
  const source = markdown.trim();
  if (!source) return "";
  return renderWidgetMarkdownWithStandaloneImages(source);
}

export function __testRenderToggleMarkdown(markdown: string): string {
  return renderToggleMarkdown(markdown);
}

export function __testRenderWidgetMarkdown(markdown: string): string {
  return renderWidgetMarkdown(markdown);
}

function renderWidgetMarkdownWithStandaloneImages(markdown: string): string {
  const chunks: string[] = [];
  let pending: string[] = [];
  const flushPending = () => {
    const source = pending.join("\n").trim();
    if (source) chunks.push(renderWidgetMarkdown(source));
    pending = [];
  };

  for (const line of markdown.split("\n")) {
    const image = parseStandaloneImageMarkdown(line);
    if (!image) {
      pending.push(line);
      continue;
    }
    flushPending();
    chunks.push(renderStandaloneImageHtml(image));
  }

  flushPending();
  return chunks.join("\n");
}

function parseStandaloneImageMarkdown(line: string): { alt: string; src: string } | null {
  const match = /^\s*!\[([^\]]*)]\((.*)\)\s*$/.exec(line);
  if (!match) return null;
  let src = (match[2] ?? "").trim();
  const angleMatch = /^<([^>]+)>$/.exec(src);
  if (angleMatch?.[1]) src = angleMatch[1].trim();
  if (!src) return null;
  return {
    alt: match[1] ?? "",
    src
  };
}

function renderStandaloneImageHtml(image: { alt: string; src: string }): string {
  return `<img src="${escapeHtmlAttribute(image.src)}" alt="${escapeHtmlAttribute(image.alt)}" />`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function hydrateRenderedMarkdown(container: HTMLElement, view: EditorView): void {
  for (const img of Array.from(container.querySelectorAll("img"))) {
    const rawSrc = img.getAttribute("src") || "";
    if (!rawSrc || isMissingImageSource(rawSrc)) continue;
    const resolvedSrc = renderableImageUrl(rawSrc);
    img.src = resolvedSrc;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.draggable = false;
    img.title = img.title || "Double-click to view";
    img.addEventListener("load", () => view.requestMeasure(), { once: true });
    img.addEventListener("error", () => view.requestMeasure(), { once: true });
    img.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openImageLightbox(resolvedSrc, img.alt || "");
    });
  }
  for (const link of Array.from(container.querySelectorAll("a"))) {
    link.rel = "noreferrer";
    link.target = "_blank";
  }
}

function normalizeToggleSummary(value: string): string {
  return value.replace(/\s+/g, " ").trim() || "Toggle";
}

function normalizeToggleMarkdown(value: string): string {
  return value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function toggleFenceForMarkdown(markdown: string): string {
  let fence = "```";
  while (markdown.includes(fence)) fence += "`";
  return fence;
}

function serializeToggleFence(summary: string, markdown: string, open: boolean): string {
  const body = normalizeToggleMarkdown(markdown);
  const fence = toggleFenceForMarkdown(body);
  return [
    `${fence}lotion-toggle`,
    `summary: ${normalizeToggleSummary(summary)}`,
    `open: ${open ? "true" : "false"}`,
    "---",
    body,
    fence
  ].join("\n");
}

export function __testSerializeToggleFence(summary: string, markdown: string, open: boolean): string {
  return serializeToggleFence(summary, markdown, open);
}

class EquationWidget extends WidgetType {
  constructor(private readonly latex: string, private readonly sourceFrom?: number) {
    super();
  }

  eq(other: EquationWidget): boolean {
    return other.latex === this.latex && other.sourceFrom === this.sourceFrom;
  }

  toDOM(view: EditorView): HTMLElement {
    const outer = document.createElement("div");
    outer.className = "cm-md-equation-widget-outer";
    const editButton = editSourceButton(view, this.sourceFrom);
    if (editButton) outer.appendChild(editButton);

    const wrap = document.createElement("div");
    wrap.className = "cm-md-equation-widget";

    const marker = document.createElement("span");
    marker.className = "cm-md-equation-marker";
    marker.textContent = "ƒ";
    wrap.appendChild(marker);

    const code = document.createElement("code");
    code.className = "cm-md-equation-source";
    code.textContent = this.latex.trim() || "Equation";
    wrap.appendChild(code);

    outer.appendChild(wrap);
    attachRemeasureObserver(outer, view);
    return outer;
  }

  destroy(dom: HTMLElement): void {
    detachRemeasureObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// Link icon widgets — one DOM shape per kind so the editor can hint
// at where a link will go without the user clicking. The internal
// variant accepts an optional `iconUrl` for the target page's own
// PNG/JPG icon; falls back to a neutral page glyph.

class ExternalLinkIconWidget extends WidgetType {
  eq(other: ExternalLinkIconWidget): boolean {
    return other instanceof ExternalLinkIconWidget;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-link-icon cm-md-link-icon-ext";
    span.innerHTML =
      '<svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M5.5 3.5h-3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3"/>' +
      '<path d="M8 2h4.5V6.5"/>' +
      '<path d="M6 8l6.5-6.5"/>' +
      '</svg>';
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class WorkspaceFileIconWidget extends WidgetType {
  eq(other: WorkspaceFileIconWidget): boolean {
    return other instanceof WorkspaceFileIconWidget;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-link-icon cm-md-link-icon-file";
    span.innerHTML =
      '<svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3.5 1.5h5l3 3v8h-8z"/>' +
      '<path d="M8.5 1.5v3h3"/>' +
      '</svg>';
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class InternalLinkIconWidget extends WidgetType {
  constructor(public icon: string | undefined, public kind: "page" | "database") {
    super();
  }

  eq(other: InternalLinkIconWidget): boolean {
    return other instanceof InternalLinkIconWidget &&
      other.icon === this.icon &&
      other.kind === this.kind;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-link-icon cm-md-link-icon-internal";
    if (this.icon && isEmojiIcon(this.icon)) {
      span.classList.add("cm-md-link-icon-emoji");
      span.textContent = emojiIconText(this.icon);
    } else if (this.icon) {
      const img = document.createElement("img");
      img.src = /^[a-z][a-z0-9+.-]*:/i.test(this.icon) ? this.icon : workspaceUrl(this.icon);
      img.alt = "";
      img.draggable = false;
      span.appendChild(img);
    } else {
      span.classList.add("cm-md-link-icon-default");
      const wrap = document.createElement("span");
      wrap.className = "cm-md-link-icon-default-wrap";
      wrap.innerHTML = this.kind === "database"
        ? '<svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">' +
          '<ellipse cx="7" cy="3.2" rx="4.4" ry="1.8"/>' +
          '<path d="M2.6 3.2v7.2c0 1 2 1.8 4.4 1.8s4.4-.8 4.4-1.8V3.2"/>' +
          '<path d="M2.6 6.8c0 1 2 1.8 4.4 1.8s4.4-.8 4.4-1.8"/>' +
          '</svg>'
        : '<svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M3.5 1.5h5l3 3v8h-8z"/>' +
          '<path d="M8.5 1.5v3h3"/>' +
          '<line x1="5" y1="7" x2="10" y2="7"/>' +
          '<line x1="5" y1="9.5" x2="10" y2="9.5"/>' +
          '</svg>';
      span.appendChild(wrap);
    }
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Lookup that the editor host injects so widgets can find a page's
 * icon value given a link's URL. Returns
 * `undefined` for unknown targets (the widget falls back to the
 * default page glyph).
 */
export type LinkIconResolver = (url: string) => string | undefined;

export const linkIconResolver = Facet.define<LinkIconResolver | null, LinkIconResolver | null>({
  combine: (values) => (values.length > 0 ? values[0] : null)
});

export type LinkTitleResolver = (url: string) => string | undefined;

export const linkTitleResolver = Facet.define<LinkTitleResolver | null, LinkTitleResolver | null>({
  combine: (values) => (values.length > 0 ? values[0] : null)
});

export const refreshLinkMetadataEffect = StateEffect.define<void>();

class HrWidget extends WidgetType {
  eq(other: HrWidget): boolean {
    return other instanceof HrWidget;
  }

  toDOM(view: EditorView): HTMLElement {
    // Wrap in a div so the vertical spacing is *padding* (counted by
    // getBoundingClientRect) rather than margin (which getBCR ignores).
    // CM6 sizes block widgets from getBCR — using margin makes the
    // widget look right visually but underreport its height, and
    // posAtCoords below it drifts by however much margin we used.
    const wrap = document.createElement("div");
    wrap.className = "cm-md-hr-widget-wrap";
    const hr = document.createElement("hr");
    hr.className = "cm-md-hr-widget";
    wrap.appendChild(hr);
    attachRemeasureObserver(wrap, view);
    return wrap;
  }

  destroy(dom: HTMLElement): void {
    detachRemeasureObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class BulletWidget extends WidgetType {
  eq(other: BulletWidget): boolean {
    return other instanceof BulletWidget;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-list-bullet";
    span.textContent = "•";
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class TableWidget extends WidgetType {
  constructor(public source: string, private readonly from: number, private readonly to: number) {
    super();
  }

  eq(other: TableWidget): boolean {
    return other.source === this.source && other.from === this.from && other.to === this.to;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-table-widget";
    const editButton = editSourceButton(view, this.from, { sourceTo: this.to });
    if (editButton) wrap.appendChild(editButton);

    // markdown-it renders the entire fence (including pipes / alignment
    // row) into a complete `<table>` with inline formatting handled.
    wrap.insertAdjacentHTML("beforeend", renderWidgetMarkdown(this.source));
    const editableTable = parseEditableMarkdownTable(this.source);
    if (editableTable) {
      addMarkdownTableStructureControls(wrap, view, this.from, this.to, editableTable);
      addMarkdownTableDragHandles(wrap, view, this.from, this.to, editableTable);
      enableMarkdownTableCellEditing(wrap, view, this.from, this.to, editableTable);
    }
    attachRemeasureObserver(wrap, view);
    return wrap;
  }

  destroy(dom: HTMLElement): void {
    detachRemeasureObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

interface EditableMarkdownTable {
  header: string[];
  align: string[];
  rows: string[][];
}

function parseEditableMarkdownTable(source: string): EditableMarkdownTable | null {
  const lines = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return null;
  const header = splitMarkdownTableRow(lines[0]);
  const align = splitMarkdownTableRow(lines[1]);
  if (header.length === 0 || align.length === 0 || !align.every(isMarkdownTableSeparatorCell)) {
    return null;
  }
  const columnCount = Math.max(header.length, ...lines.slice(2).map((line) => splitMarkdownTableRow(line).length));
  return {
    header: normalizeMarkdownTableCells(header, columnCount),
    align: normalizeMarkdownTableCells(align, columnCount, "---"),
    rows: lines.slice(2).map((line) => normalizeMarkdownTableCells(splitMarkdownTableRow(line), columnCount))
  };
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  if (trimmed.startsWith("|")) cells.shift();
  if (trimmed.endsWith("|")) cells.pop();
  return cells;
}

function normalizeMarkdownTableCells(cells: string[], count: number, fallback = ""): string[] {
  return Array.from({ length: count }, (_unused, index) => cells[index] ?? fallback);
}

function isMarkdownTableSeparatorCell(value: string): boolean {
  return /^:?-{3,}:?$/.test(value.trim());
}

type MarkdownTableAction = "add-row" | "delete-row" | "add-column" | "delete-column";
type MarkdownTableDragKind = "row" | "column";

function addMarkdownTableStructureControls(
  wrap: HTMLElement,
  view: EditorView,
  from: number,
  to: number,
  table: EditableMarkdownTable
): void {
  const controls = document.createElement("div");
  controls.className = "cm-md-table-controls";
  controls.setAttribute("aria-label", "Table controls");
  controls.append(
    markdownTableControlButton("add-row", "+ Row", "Add table row"),
    markdownTableControlButton("add-column", "+ Column", "Add table column"),
    markdownTableControlButton("delete-row", "Delete row", "Delete table row"),
    markdownTableControlButton("delete-column", "Delete column", "Delete table column")
  );
  controls.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  controls.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLButtonElement>("[data-table-action]")
      : null;
    const action = target?.dataset.tableAction as MarkdownTableAction | undefined;
    if (!action) return;
    const nextTable = applyMarkdownTableAction(tableWithActiveCellText(wrap, table), wrap, action);
    if (!nextTable) return;
    wrap.dataset.suppressCellCommit = "true";
    view.dispatch({
      changes: { from, to, insert: serializeEditableMarkdownTable(nextTable) }
    });
    view.focus();
  });
  wrap.appendChild(controls);
}

function markdownTableControlButton(action: MarkdownTableAction, label: string, ariaLabel: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cm-md-table-control";
  button.dataset.tableAction = action;
  button.textContent = label;
  button.title = ariaLabel;
  button.setAttribute("aria-label", ariaLabel);
  return button;
}

function addMarkdownTableDragHandles(
  wrap: HTMLElement,
  view: EditorView,
  from: number,
  to: number,
  table: EditableMarkdownTable
): void {
  const headerCells = Array.from(wrap.querySelectorAll<HTMLElement>("thead th"));
  headerCells.forEach((cell, columnIndex) => {
    cell.dataset.tableColumn = String(columnIndex);
    const handle = markdownTableDragHandle("column", columnIndex, `Drag table column ${columnIndex + 1}`);
    cell.appendChild(handle);
    wireMarkdownTableDragHandle(handle, wrap, view, from, to, table, "column");
  });

  const bodyRows = Array.from(wrap.querySelectorAll<HTMLElement>("tbody tr"));
  bodyRows.forEach((row, rowIndex) => {
    row.dataset.tableRow = String(rowIndex);
    const firstCell = row.querySelector<HTMLElement>("td");
    if (!firstCell) return;
    firstCell.dataset.tableRow = String(rowIndex);
    const handle = markdownTableDragHandle("row", rowIndex, `Drag table row ${rowIndex + 1}`);
    firstCell.appendChild(handle);
    wireMarkdownTableDragHandle(handle, wrap, view, from, to, table, "row");
  });
}

function markdownTableDragHandle(kind: MarkdownTableDragKind, index: number, ariaLabel: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `cm-md-table-drag-handle cm-md-table-${kind}-drag-handle`;
  button.dataset.tableDragKind = kind;
  button.dataset.tableDragIndex = String(index);
  if (kind === "row") {
    button.dataset.tableRow = String(index);
  } else {
    button.dataset.tableColumn = String(index);
  }
  button.title = ariaLabel;
  button.setAttribute("aria-label", ariaLabel);
  button.setAttribute("contenteditable", "false");
  return button;
}

function wireMarkdownTableDragHandle(
  handle: HTMLButtonElement,
  wrap: HTMLElement,
  view: EditorView,
  from: number,
  to: number,
  table: EditableMarkdownTable,
  kind: MarkdownTableDragKind
): void {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let dragGhost: HTMLElement | null = null;

    const cleanup = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
      wrap.classList.remove("cm-md-table-is-dragging");
      handle.classList.remove("is-dragging");
      dragGhost?.remove();
      dragGhost = null;
      clearMarkdownTableDragVisuals(wrap);
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!dragging && distance < 4) return;
      if (!dragging) {
        dragging = true;
        wrap.classList.add("cm-md-table-is-dragging");
        handle.classList.add("is-dragging");
        const currentSourceIndex = markdownTableDragSourceIndex(handle, kind);
        if (currentSourceIndex !== null) {
          markMarkdownTableDragSource(wrap, kind, currentSourceIndex);
          dragGhost = createMarkdownTableDragGhost(wrap, kind, currentSourceIndex, handle);
        }
      }
      if (dragGhost) {
        positionMarkdownTableDragGhost(wrap, dragGhost, moveEvent.clientX, moveEvent.clientY);
      }
      markMarkdownTableDropTarget(wrap, kind, moveEvent.clientX, moveEvent.clientY);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      cleanup();
      if (!dragging) return;
      const currentSourceIndex = markdownTableDragSourceIndex(handle, kind);
      const targetIndex = markdownTableDropIndex(wrap, kind, upEvent.clientX, upEvent.clientY);
      if (currentSourceIndex === null || targetIndex === null || targetIndex === currentSourceIndex) return;
      const nextTable = reorderEditableMarkdownTable(tableWithActiveCellText(wrap, table), kind, currentSourceIndex, targetIndex);
      if (!nextTable) return;
      wrap.dataset.suppressCellCommit = "true";
      view.dispatch({
        changes: { from, to, insert: serializeEditableMarkdownTable(nextTable) }
      });
      view.focus();
    };

    const onPointerCancel = () => {
      cleanup();
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
  });
  handle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  handle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
}

function markdownTableDragSourceIndex(handle: HTMLElement, kind: MarkdownTableDragKind): number | null {
  const source = kind === "row"
    ? handle.closest<HTMLElement>("tbody tr")
    : handle.closest<HTMLElement>("thead th");
  const index = Number(kind === "row" ? source?.dataset.tableRow : source?.dataset.tableColumn);
  return Number.isInteger(index) ? index : null;
}

function markMarkdownTableDragSource(wrap: HTMLElement, kind: MarkdownTableDragKind, sourceIndex: number): void {
  if (kind === "row") {
    const row = wrap.querySelector<HTMLElement>(`tbody tr[data-table-row="${sourceIndex}"]`);
    row?.classList.add("cm-md-table-row-drag-source");
    return;
  }
  wrap
    .querySelectorAll<HTMLElement>(`thead th[data-table-column="${sourceIndex}"], tbody td[data-table-column="${sourceIndex}"]`)
    .forEach((cell) => cell.classList.add("cm-md-table-column-drag-source"));
}

function createMarkdownTableDragGhost(
  wrap: HTMLElement,
  kind: MarkdownTableDragKind,
  sourceIndex: number,
  handle: HTMLElement
): HTMLElement {
  const ghost = document.createElement("div");
  ghost.className = `cm-md-table-drag-ghost cm-md-table-${kind}-drag-ghost`;
  ghost.textContent = markdownTableDragGhostLabel(kind, sourceIndex, handle);
  ghost.setAttribute("aria-hidden", "true");
  wrap.appendChild(ghost);
  return ghost;
}

function markdownTableDragGhostLabel(kind: MarkdownTableDragKind, sourceIndex: number, handle: HTMLElement): string {
  if (kind === "row") {
    const rowText = handle.closest("tr")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return rowText ? `Row ${sourceIndex + 1}: ${rowText}` : `Row ${sourceIndex + 1}`;
  }
  const headerText = handle.closest("th")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return headerText ? `Column ${sourceIndex + 1}: ${headerText}` : `Column ${sourceIndex + 1}`;
}

function positionMarkdownTableDragGhost(wrap: HTMLElement, ghost: HTMLElement, clientX: number, clientY: number): void {
  const rect = wrap.getBoundingClientRect();
  ghost.style.left = `${clientX - rect.left + wrap.scrollLeft}px`;
  ghost.style.top = `${clientY - rect.top + wrap.scrollTop}px`;
}

function tableWithActiveCellText(wrap: HTMLElement, table: EditableMarkdownTable): EditableMarkdownTable {
  const nextTable = cloneEditableMarkdownTable(table);
  const activeCell = wrap.querySelector<HTMLElement>("th[contenteditable]:focus, td[contenteditable]:focus");
  if (!activeCell) return nextTable;
  const rowIndex = Number(activeCell.dataset.tableRow);
  const columnIndex = Number(activeCell.dataset.tableColumn);
  if (!Number.isInteger(columnIndex) || columnIndex < 0) return nextTable;
  const nextText = escapeMarkdownTableCell(activeCell.textContent ?? "");
  if (rowIndex < 0) {
    nextTable.header[columnIndex] = nextText;
  } else if (nextTable.rows[rowIndex]) {
    nextTable.rows[rowIndex][columnIndex] = nextText;
  }
  return nextTable;
}

function reorderEditableMarkdownTable(
  table: EditableMarkdownTable,
  kind: MarkdownTableDragKind,
  sourceIndex: number,
  targetIndex: number
): EditableMarkdownTable | null {
  const nextTable = normalizeEditableMarkdownTableShape(cloneEditableMarkdownTable(table));
  if (kind === "row") {
    if (!moveMarkdownTableArrayItem(nextTable.rows, sourceIndex, targetIndex)) return null;
    return nextTable;
  }

  const columnCount = nextTable.header.length;
  if (sourceIndex < 0 || sourceIndex >= columnCount || targetIndex < 0 || targetIndex >= columnCount) {
    return null;
  }
  moveMarkdownTableArrayItem(nextTable.header, sourceIndex, targetIndex);
  moveMarkdownTableArrayItem(nextTable.align, sourceIndex, targetIndex);
  nextTable.rows.forEach((row) => {
    moveMarkdownTableArrayItem(row, sourceIndex, targetIndex);
  });
  return nextTable;
}

function moveMarkdownTableArrayItem<T>(items: T[], sourceIndex: number, targetIndex: number): boolean {
  if (
    sourceIndex < 0 ||
    sourceIndex >= items.length ||
    targetIndex < 0 ||
    targetIndex >= items.length ||
    sourceIndex === targetIndex
  ) {
    return false;
  }
  const [item] = items.splice(sourceIndex, 1);
  items.splice(targetIndex, 0, item);
  return true;
}

function markdownTableDropIndex(
  wrap: HTMLElement,
  kind: MarkdownTableDragKind,
  clientX: number,
  clientY: number
): number | null {
  const target = document.elementFromPoint(clientX, clientY);
  if (target instanceof HTMLElement && wrap.contains(target)) {
    if (kind === "row") {
      const row = target.closest<HTMLElement>("tbody tr");
      const rowIndex = Number(row?.dataset.tableRow);
      if (Number.isInteger(rowIndex)) return rowIndex;
    } else {
      const cell = target.closest<HTMLElement>("thead th, tbody td");
      const columnIndex = Number(cell?.dataset.tableColumn);
      if (Number.isInteger(columnIndex)) return columnIndex;
    }
  }
  return markdownTableGeometryDropIndex(wrap, kind, clientX, clientY);
}

function markdownTableGeometryDropIndex(
  wrap: HTMLElement,
  kind: MarkdownTableDragKind,
  clientX: number,
  clientY: number
): number | null {
  const wrapRect = wrap.getBoundingClientRect();
  if (clientX < wrapRect.left || clientX > wrapRect.right || clientY < wrapRect.top || clientY > wrapRect.bottom) {
    return null;
  }
  if (kind === "row") {
    const rows = Array.from(wrap.querySelectorAll<HTMLElement>("tbody tr"));
    const row = rows.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    });
    const rowIndex = Number(row?.dataset.tableRow);
    return Number.isInteger(rowIndex) ? rowIndex : null;
  }

  const cells = Array.from(wrap.querySelectorAll<HTMLElement>("thead th"));
  const cell = cells.find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right;
  });
  const columnIndex = Number(cell?.dataset.tableColumn);
  return Number.isInteger(columnIndex) ? columnIndex : null;
}

function markMarkdownTableDropTarget(wrap: HTMLElement, kind: MarkdownTableDragKind, clientX: number, clientY: number): void {
  clearMarkdownTableDropTargets(wrap);
  const targetIndex = markdownTableDropIndex(wrap, kind, clientX, clientY);
  if (targetIndex === null) return;
  if (kind === "row") {
    const row = wrap.querySelector<HTMLElement>(`tbody tr[data-table-row="${targetIndex}"]`);
    row?.classList.add("cm-md-table-row-drop-target");
    return;
  }
  wrap
    .querySelectorAll<HTMLElement>(`thead th[data-table-column="${targetIndex}"], tbody td[data-table-column="${targetIndex}"]`)
    .forEach((cell) => cell.classList.add("cm-md-table-column-drop-target"));
}

function clearMarkdownTableDropTargets(wrap: HTMLElement): void {
  wrap.querySelectorAll<HTMLElement>(".cm-md-table-row-drop-target, .cm-md-table-column-drop-target").forEach((element) => {
    element.classList.remove("cm-md-table-row-drop-target", "cm-md-table-column-drop-target");
  });
}

function clearMarkdownTableDragVisuals(wrap: HTMLElement): void {
  clearMarkdownTableDropTargets(wrap);
  wrap.querySelectorAll<HTMLElement>(".cm-md-table-row-drag-source, .cm-md-table-column-drag-source").forEach((element) => {
    element.classList.remove("cm-md-table-row-drag-source", "cm-md-table-column-drag-source");
  });
}

function applyMarkdownTableAction(
  table: EditableMarkdownTable,
  wrap: HTMLElement,
  action: MarkdownTableAction
): EditableMarkdownTable | null {
  const nextTable = cloneEditableMarkdownTable(table);
  const columnCount = Math.max(1, nextTable.header.length, ...nextTable.rows.map((row) => row.length));
  const activeColumn = clampMarkdownTableIndex(Number(wrap.dataset.activeColumn), 0, columnCount - 1, columnCount - 1);
  const activeRow = clampMarkdownTableIndex(Number(wrap.dataset.activeRow), -1, nextTable.rows.length - 1, nextTable.rows.length > 0 ? 0 : -1);

  if (action === "add-row") {
    const insertAt = activeRow < 0 ? 0 : Math.min(activeRow + 1, nextTable.rows.length);
    nextTable.rows.splice(insertAt, 0, Array.from({ length: columnCount }, () => ""));
    return normalizeEditableMarkdownTableShape(nextTable);
  }
  if (action === "delete-row") {
    if (nextTable.rows.length === 0) return null;
    const deleteAt = activeRow < 0 ? 0 : Math.min(activeRow, nextTable.rows.length - 1);
    nextTable.rows.splice(deleteAt, 1);
    return normalizeEditableMarkdownTableShape(nextTable);
  }
  if (action === "add-column") {
    const insertAt = Math.min(activeColumn + 1, columnCount);
    nextTable.header.splice(insertAt, 0, `Column ${columnCount + 1}`);
    nextTable.align.splice(insertAt, 0, "---");
    nextTable.rows.forEach((row) => row.splice(insertAt, 0, ""));
    return normalizeEditableMarkdownTableShape(nextTable);
  }
  if (action === "delete-column") {
    if (columnCount <= 1) return null;
    const deleteAt = Math.min(activeColumn, columnCount - 1);
    nextTable.header.splice(deleteAt, 1);
    nextTable.align.splice(deleteAt, 1);
    nextTable.rows.forEach((row) => row.splice(deleteAt, 1));
    return normalizeEditableMarkdownTableShape(nextTable);
  }
  return null;
}

function clampMarkdownTableIndex(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeEditableMarkdownTableShape(table: EditableMarkdownTable): EditableMarkdownTable {
  const columnCount = Math.max(1, table.header.length, table.align.length, ...table.rows.map((row) => row.length));
  return {
    header: normalizeMarkdownTableCells(table.header, columnCount, ""),
    align: normalizeMarkdownTableCells(table.align, columnCount, "---").map((cell) => isMarkdownTableSeparatorCell(cell) ? cell : "---"),
    rows: table.rows.map((row) => normalizeMarkdownTableCells(row, columnCount, ""))
  };
}

function enableMarkdownTableCellEditing(
  wrap: HTMLElement,
  view: EditorView,
  from: number,
  to: number,
  table: EditableMarkdownTable
): void {
  const headerCells = Array.from(wrap.querySelectorAll("thead th"));
  const bodyRows = Array.from(wrap.querySelectorAll("tbody tr"));
  headerCells.forEach((cell, columnIndex) => {
    wireMarkdownTableCell(wrap, cell, view, from, to, table, -1, columnIndex);
  });
  bodyRows.forEach((row, rowIndex) => {
    Array.from(row.querySelectorAll("td")).forEach((cell, columnIndex) => {
      wireMarkdownTableCell(wrap, cell, view, from, to, table, rowIndex, columnIndex);
    });
  });
}

function wireMarkdownTableCell(
  wrap: HTMLElement,
  cell: Element,
  view: EditorView,
  from: number,
  to: number,
  table: EditableMarkdownTable,
  rowIndex: number,
  columnIndex: number
): void {
  if (!(cell instanceof HTMLElement)) return;
  const originalText = cell.textContent ?? "";
  cell.setAttribute("contenteditable", "plaintext-only");
  cell.setAttribute("spellcheck", "false");
  cell.setAttribute("role", "textbox");
  cell.setAttribute("aria-label", "Edit table cell");
  cell.dataset.tableRow = String(rowIndex);
  cell.dataset.tableColumn = String(columnIndex);
  cell.dataset.originalText = originalText;
  let cancelled = false;
  let committed = false;

  const commit = () => {
    if (committed || cancelled) return;
    committed = true;
    if (wrap.dataset.suppressCellCommit === "true") return;
    const nextText = normalizeEditableTableCellText(cell.textContent ?? "");
    if (nextText === normalizeEditableTableCellText(originalText)) return;
    const nextTable = cloneEditableMarkdownTable(table);
    if (rowIndex < 0) {
      nextTable.header[columnIndex] = escapeMarkdownTableCell(nextText);
    } else if (nextTable.rows[rowIndex]) {
      nextTable.rows[rowIndex][columnIndex] = escapeMarkdownTableCell(nextText);
    } else {
      return;
    }
    view.dispatch({
      changes: { from, to, insert: serializeEditableMarkdownTable(nextTable) }
    });
  };

  cell.addEventListener("focus", () => {
    wrap.dataset.activeRow = String(rowIndex);
    wrap.dataset.activeColumn = String(columnIndex);
    cancelled = false;
    committed = false;
  });
  cell.addEventListener("click", () => {
    wrap.dataset.activeRow = String(rowIndex);
    wrap.dataset.activeColumn = String(columnIndex);
  });
  cell.addEventListener("mousedown", (event) => event.stopPropagation());
  cell.addEventListener("click", (event) => event.stopPropagation());
  cell.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      cell.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelled = true;
      cell.textContent = originalText;
      cell.blur();
    }
  });
  cell.addEventListener("blur", commit);
}

function cloneEditableMarkdownTable(table: EditableMarkdownTable): EditableMarkdownTable {
  return {
    header: [...table.header],
    align: [...table.align],
    rows: table.rows.map((row) => [...row])
  };
}

function normalizeEditableTableCellText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeMarkdownTableCell(value: string): string {
  return normalizeEditableTableCellText(value).replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function serializeEditableMarkdownTable(table: EditableMarkdownTable): string {
  const lines = [
    serializeMarkdownTableRow(table.header),
    serializeMarkdownTableRow(table.align.map((cell) => isMarkdownTableSeparatorCell(cell) ? cell : "---")),
    ...table.rows.map(serializeMarkdownTableRow)
  ];
  return lines.join("\n");
}

function serializeMarkdownTableRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

interface TocHeading {
  level: number;
  text: string;
  from: number;
}

const TOC_COLLAPSED_STORAGE_KEY = "lotion.tocCollapsed";

class TocWidget extends WidgetType {
  private readonly key: string;
  private readonly minLevel: number;

  constructor(private readonly headings: TocHeading[], private readonly inline = true) {
    super();
    this.key = `${inline ? "inline" : "floating"}\n${headings.map((heading) => `${heading.level}:${heading.from}:${heading.text}`).join("\n")}`;
    this.minLevel = headings.reduce((min, heading) => Math.min(min, heading.level), 6);
  }

  eq(other: TocWidget): boolean {
    return other instanceof TocWidget && other.key === this.key && other.inline === this.inline;
  }

  toDOM(view: EditorView): HTMLElement {
    this.renderFloatingPanel(view);
    if (!this.inline) {
      const sentinel = document.createElement("span");
      sentinel.className = "cm-md-floating-toc-sentinel";
      sentinel.setAttribute("aria-hidden", "true");
      return sentinel;
    }

    const outer = document.createElement("div");
    outer.className = "cm-md-toc-widget-outer";

    const inlinePanel = this.buildPanel(view, { side: false });
    outer.append(inlinePanel);
    attachRemeasureObserver(outer, view);
    return outer;
  }

  private renderFloatingPanel(view: EditorView): void {
    view.dom.classList.add("cm-md-has-floating-toc");
    const existing = view.dom.querySelector<HTMLElement>(":scope > .cm-md-floating-toc-host");
    if (existing?.dataset.tocKey === this.key) {
      syncFloatingTocState(view, existing.classList.contains("cm-md-toc-collapsed"));
      return;
    }
    existing?.remove();

    const panel = this.buildPanel(view, { side: true });
    panel.classList.add("cm-md-floating-toc-host");
    panel.dataset.tocKey = this.key;
    view.dom.appendChild(panel);
  }

  private buildPanel(view: EditorView, options: { side: boolean }): HTMLElement {
    const panel = document.createElement("div");
    panel.className = options.side ? "cm-md-toc-panel cm-md-side-toc-panel" : "cm-md-toc-panel cm-md-inline-toc-panel";
    const header = document.createElement("div");
    header.className = "cm-md-toc-header";
    const label = document.createElement("span");
    label.className = "cm-md-toc-title";
    label.textContent = "Contents";

    if (options.side) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "cm-md-toc-toggle";
      toggle.title = "Toggle table of contents";
      toggle.setAttribute("aria-label", "Toggle table of contents");
      const toggleIcon = document.createElement("span");
      toggleIcon.className = "cm-md-toc-toggle-icon";
      toggle.appendChild(toggleIcon);
      header.append(label, toggle);
      const applyCollapsed = (collapsed: boolean) => {
        panel.classList.toggle("cm-md-toc-collapsed", collapsed);
        syncFloatingTocState(view, collapsed);
        toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        toggleIcon.textContent = collapsed ? "‹" : "›";
        view.requestMeasure();
      };
      let collapsed = readTocCollapsed();
      applyCollapsed(collapsed);
      toggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        collapsed = !collapsed;
        writeTocCollapsed(collapsed);
        applyCollapsed(collapsed);
      });
    } else {
      header.appendChild(label);
    }

    const nav = document.createElement("nav");
    nav.className = "cm-md-toc-widget";
    nav.setAttribute("aria-label", options.side ? "Floating table of contents" : "Table of contents");

    if (this.headings.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cm-md-toc-empty";
      empty.textContent = "No headings";
      nav.appendChild(empty);
    } else {
      for (const heading of this.headings) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cm-md-toc-item";
        button.style.paddingLeft = `${10 + Math.max(0, heading.level - this.minLevel) * 16}px`;
        button.textContent = heading.text;
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          view.dispatch({
            selection: { anchor: heading.from },
            effects: EditorView.scrollIntoView(heading.from, { y: "start" })
          });
          view.focus();
        });
        nav.appendChild(button);
      }
    }

    panel.append(header, nav);
    return panel;
  }

  destroy(dom: HTMLElement): void {
    detachRemeasureObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export function clearFloatingToc(root?: HTMLElement | null): void {
  const host = root ?? document;
  host.querySelectorAll(".cm-md-floating-toc-host").forEach((node) => node.remove());
  if (root) root.classList.remove("cm-md-has-floating-toc", "cm-md-floating-toc-collapsed");
}

function syncFloatingTocState(view: EditorView, collapsed: boolean): void {
  view.dom.classList.add("cm-md-has-floating-toc");
  view.dom.classList.toggle("cm-md-floating-toc-collapsed", collapsed);
}

function readTocCollapsed(): boolean {
  try {
    const value = window.localStorage.getItem(TOC_COLLAPSED_STORAGE_KEY);
    return value === null ? true : value === "1";
  } catch {
    return true;
  }
}

function writeTocCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(TOC_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/**
 * Tell CM to recompute its height map whenever the widget DOM
 * changes size after creation. Async-rendered content (images,
 * iframes, React portals, web fonts) finishes laying out *after*
 * `toDOM` returns, and without this CM caches the placeholder
 * height — every click below the widget then lands a line or two
 * too low. The ResizeObserver fires once on initial layout and on
 * every subsequent reflow.
 */
function attachRemeasureObserver(dom: HTMLElement, view: EditorView): void {
  const ro = new ResizeObserver(() => view.requestMeasure());
  ro.observe(dom);
  (dom as HTMLElement & { _ro?: ResizeObserver })._ro = ro;
}

function detachRemeasureObserver(dom: HTMLElement): void {
  const ro = (dom as HTMLElement & { _ro?: ResizeObserver })._ro;
  if (ro) ro.disconnect();
}

class TaskCheckboxWidget extends WidgetType {
  constructor(public checked: boolean, public from: number, public to: number) {
    super();
  }

  eq(other: TaskCheckboxWidget): boolean {
    return (
      other.checked === this.checked &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-md-task-checkbox";
    input.addEventListener("mousedown", (e) => e.stopPropagation());
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("change", () => {
      const replacement = this.checked ? "[ ]" : "[x]";
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: replacement }
      });
      view.focus();
    });
    return input;
  }

  ignoreEvent(): boolean {
    // CM stays out of the checkbox entirely — the browser fires native
    // click/change on the <input>, our `change` listener writes the
    // flipped marker back into the document.
    return true;
  }
}

// ── lotion-view widget + registry (independent React roots) ────────────

export interface LotionViewMount {
  id: string;
  container: HTMLElement;
  databaseId: string;
  viewId: string;
}

export interface LotionViewRenderer {
  render(mount: LotionViewMount): void;
  unmount(mount: LotionViewMount): void;
}

export interface LotionViewSpec {
  stableId: string;
  databaseId: string;
  viewId: string;
}

export function nextLotionViewStableId(databaseId: string, viewId: string, counters: Map<string, number>): string {
  const viewKey = viewId || "default";
  const counterKey = `${databaseId}\u0000${viewKey}`;
  const ordinal = counters.get(counterKey) ?? 0;
  counters.set(counterKey, ordinal + 1);
  return `lv-${databaseId}-${viewKey}-${ordinal}`;
}

/**
 * Mutable bookkeeping passed into widget instances via a CM facet. CM
 * cannot render React components directly; instead the widget creates
 * an empty `<div>` and registers it here. The registry owns a renderer
 * callback supplied by CodeMirrorMarkdownEditor, which mounts the heavy
 * embedded view into its own React root. Keeping that root outside the
 * editor's render output lets browser layout move the table naturally
 * without re-rendering it on every text edit.
 */
export class LotionViewRegistry {
  private mounts = new Map<string, LotionViewMount>();
  private parkingContainer: HTMLElement | null = null;
  private renderer: LotionViewRenderer | null = null;
  private listeners = new Set<() => void>();
  private counter = 0;

  setRenderer(renderer: LotionViewRenderer | null): void {
    this.renderer = renderer;
    if (renderer) this.renderAll();
  }

  renderAll(): void {
    if (!this.renderer) return;
    for (const mount of this.mounts.values()) {
      this.renderer.render(mount);
    }
  }

  dispose(): void {
    for (const mount of this.mounts.values()) {
      this.renderer?.unmount(mount);
      mount.container.remove();
    }
    this.mounts.clear();
    this.notify();
  }

  setParkingContainer(container: HTMLElement | null): void {
    this.parkingContainer = container;
    if (!container) return;
    for (const mount of this.mounts.values()) {
      if (!mount.container.parentElement) container.appendChild(mount.container);
    }
  }

  syncExpected(specs: LotionViewSpec[]): void {
    const start = performance.now();
    const expected = new Set(specs.map((spec) => spec.stableId));
    let changed = false;
    let removed = 0;
    for (const [id, mount] of this.mounts) {
      if (expected.has(id)) continue;
      this.renderer?.unmount(mount);
      mount.container.remove();
      this.mounts.delete(id);
      changed = true;
      removed += 1;
    }
    if (changed) this.notify();
    perfLog("lotionView.syncExpected", {
      expected: specs.length,
      mounted: this.mounts.size,
      removed,
      changed,
      ms: Number((performance.now() - start).toFixed(2))
    });
  }

  preload(spec: LotionViewSpec): void {
    const start = performance.now();
    const changed = this.ensureMount(spec.stableId, spec.databaseId, spec.viewId);
    if (changed) this.notify();
    perfLog("lotionView.preload", {
      id: spec.stableId,
      databaseId: spec.databaseId,
      viewId: spec.viewId,
      changed,
      mounted: this.mounts.size,
      ms: Number((performance.now() - start).toFixed(2))
    });
  }

  attach(container: HTMLElement, databaseId: string, viewId: string, stableId?: string): string {
    const id = stableId || `lv-${this.counter++}`;
    const mount = this.ensureMount(id, databaseId, viewId);
    const host = this.mounts.get(id)?.container;
    if (host && host.parentElement !== container) container.appendChild(host);
    container.dataset.lotionViewMount = id;
    if (mount) this.notify();
    perfLog("lotionView.attach", {
      id,
      databaseId,
      viewId,
      created: mount,
      mounted: this.mounts.size
    });
    return id;
  }

  detach(container: HTMLElement) {
    const id = container.dataset.lotionViewMount;
    if (!id) return;
    const mount = this.mounts.get(id);
    if (mount?.container.parentElement === container) {
      container.removeChild(mount.container);
      this.parkingContainer?.appendChild(mount.container);
    }
    delete container.dataset.lotionViewMount;
    perfLog("lotionView.detach", { id, mounted: this.mounts.size });
  }

  snapshot(): LotionViewMount[] {
    return Array.from(this.mounts.values());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    // Defer so widget.toDOM (called inside CM's view update) doesn't
    // synchronously re-enter React's render phase.
    queueMicrotask(() => {
      for (const l of this.listeners) l();
    });
  }

  private ensureMount(id: string, databaseId: string, viewId: string): boolean {
    const existing = this.mounts.get(id);
    if (existing && existing.databaseId === databaseId && existing.viewId === viewId) return false;
    const container = existing?.container ?? document.createElement("div");
    container.className = "cm-md-lotion-view-portal";
    container.dataset.lotionViewMount = id;
    const mount = { id, container, databaseId, viewId };
    this.mounts.set(id, mount);
    if (!container.parentElement) this.parkingContainer?.appendChild(container);
    this.renderer?.render(mount);
    return true;
  }
}

export const lotionViewRegistry = Facet.define<LotionViewRegistry | null, LotionViewRegistry | null>({
  combine: (values) => (values.length > 0 ? values[0] : null)
});

class LotionViewWidget extends WidgetType {
  constructor(
    public databaseId: string,
    public viewId: string,
    private registry: LotionViewRegistry | null,
    private stableId: string,
    private sourceFrom?: number
  ) {
    super();
  }

  eq(other: LotionViewWidget): boolean {
    return other.databaseId === this.databaseId &&
      other.viewId === this.viewId &&
      other.stableId === this.stableId &&
      other.sourceFrom === this.sourceFrom;
  }

  toDOM(view: EditorView): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-md-lotion-view-widget";
    const editButton = editSourceButton(view, this.sourceFrom);
    if (editButton) div.appendChild(editButton);
    if (this.registry) this.registry.attach(div, this.databaseId, this.viewId, this.stableId);
    attachRemeasureObserver(div, view);
    return div;
  }

  destroy(dom: HTMLElement): void {
    if (this.registry) this.registry.detach(dom);
    detachRemeasureObserver(dom);
  }

  ignoreEvent(): boolean {
    // Let mouse interactions inside the embedded table reach React,
    // not the editor.
    return true;
  }
}

// ── inline (plugin-friendly) decorations ───────────────────────────────

class MarkdownInlinePlugin {
  decorations: DecorationSet;
  private activeLineKey: string;

  constructor(view: EditorView) {
    this.activeLineKey = activeLineKey(view.state);
    this.decorations = this.build(view);
  }

  update(update: ViewUpdate) {
    // Selection changes flip markers between visible and hidden, so the
    // plugin needs to rebuild on selectionSet as well as doc / viewport.
    const nextActiveLineKey = activeLineKey(update.state);
    const activeLinesChanged = nextActiveLineKey !== this.activeLineKey;
    const linkMetadataChanged = update.transactions.some((transaction) => (
      transaction.effects.some((effect) => effect.is(refreshLinkMetadataEffect))
    ));
    if (update.docChanged || update.viewportChanged || linkMetadataChanged || (update.selectionSet && activeLinesChanged)) {
      this.activeLineKey = nextActiveLineKey;
      this.decorations = this.build(update.view);
    } else if (update.selectionSet) {
      this.activeLineKey = nextActiveLineKey;
    }
  }

  private build(view: EditorView): DecorationSet {
    try {
      return buildInlineDecorations(view.state, view.visibleRanges);
    } catch (error) {
      console.error("[lotion] markdown inline decorations failed:", error);
      return Decoration.none;
    }
  }
}

const inlinePlugin = ViewPlugin.fromClass(MarkdownInlinePlugin, {
  decorations: (plugin) => plugin.decorations
});

class SelectionVisibilityPlugin {
  constructor(private readonly view: EditorView) {
    this.sync();
  }

  update(update: ViewUpdate): void {
    if (update.selectionSet) this.sync();
  }

  destroy(): void {
    this.view.dom.classList.remove("cm-md-has-selection");
  }

  private sync(): void {
    this.view.dom.classList.toggle("cm-md-has-selection", hasNonEmptySelection(this.view.state));
  }
}

const selectionVisibilityPlugin = ViewPlugin.fromClass(SelectionVisibilityPlugin);

function hasNonEmptySelection(state: EditorState): boolean {
  return state.selection.ranges.some((range) => !range.empty);
}

const selectedLineDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildSelectedLineDecorations(state);
  },
  update(value, tr) {
    if (!tr.docChanged && tr.startState.selection.eq(tr.state.selection)) return value;
    return buildSelectedLineDecorations(tr.state);
  },
  provide: (f) => EditorView.decorations.from(f)
});

function buildSelectedLineDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const seenLines = new Set<number>();
  for (const range of state.selection.ranges) {
    if (range.empty) continue;
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine = state.doc.lineAt(Math.max(range.from, range.to - 1)).number;
    for (let lineNo = fromLine; lineNo <= toLine; lineNo += 1) {
      if (seenLines.has(lineNo)) continue;
      seenLines.add(lineNo);
      const line = state.doc.line(lineNo);
      ranges.push(selectedLineDeco.range(line.from, line.from));
    }
  }
  return Decoration.set(ranges, true);
}

function buildInlineDecorations(
  state: EditorState,
  visibleRanges: readonly { from: number; to: number }[]
): DecorationSet {
  if (!state.facet(markdownDecorationsEnabledFacet)) return Decoration.none;

  const start = performance.now();
  const ranges: Range<Decoration>[] = [];
  const urlRanges = new Set<string>();
  const seenNames = DEBUG ? new Set<string>() : null;
  const doc = state.doc;
  const sel = state.selection.main;
  const resolver = state.facet(linkIconResolver);
  const titleResolver = state.facet(linkTitleResolver);
  let visitedNodes = 0;
  let links = 0;
  let tasks = 0;
  let bareUrls = 0;
  let singleTildeStrikes = 0;
  const markdownLinkRanges = collectMarkdownLinkRanges(state, visibleRanges);
  const replacedLinkLabelRanges: Array<{ from: number; to: number }> = [];
  const underlineTagStack: Array<{ from: number; to: number }> = [];
  const strikethroughTagStack: Array<{ from: number; to: number }> = [];
  const highlightTagStack: Array<{ from: number; to: number }> = [];
  const scriptTagStack: Array<{ from: number; to: number; kind: "sup" | "sub" }> = [];
  const notionColorTagStack: Array<{ from: number; to: number; kind: "color" | "bg"; color: string }> = [];

  // "Active" lines = the lines the cursor / selection touches. Markers
  // and URLs stay raw on these so the user can edit; everywhere else
  // they're hidden.
  const startLine = doc.lineAt(sel.from).number;
  const endLine = doc.lineAt(sel.to).number;
  const activeLines = new Set<number>();
  for (let n = startLine; n <= endLine; n += 1) activeLines.add(n);

  for (const { from, to } of visibleRanges) {
    for (const line of visibleLines(doc, from, to)) {
      if (isLineInBlockCode(state, line.from)) continue;
      for (const match of findBareUrls(line.text, line.from)) {
        if (rangeContains(markdownLinkRanges, match.from, match.to)) continue;
        bareUrls += 1;
        addUrlRange(ranges, urlRanges, match.from, match.to, match.url);
      }
      const lineIsActive = activeLines.has(doc.lineAt(line.from).number);
      for (const match of findSingleTildeStrikethroughs(line.text, line.from)) {
        if (rangeOverlaps(markdownLinkRanges, match.openFrom, match.closeTo)) continue;
        singleTildeStrikes += 1;
        ranges.push(importedInlineMarkerDecoration(lineIsActive).range(match.openFrom, match.openTo));
        ranges.push(inlineDecorations.Strikethrough.range(match.from, match.to));
        addNestedImportedSingleTildeInlineDecorations(ranges, line.text, line.from, match, lineIsActive);
        ranges.push(importedInlineMarkerDecoration(lineIsActive).range(match.closeFrom, match.closeTo));
      }
    }

    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        visitedNodes += 1;
        seenNames?.add(node.name);

        if (node.name === "Link") {
          const urlNode = markdownLinkDestinationUrlNode(node.node);
          if (urlNode) {
            links += 1;
            const url = doc.sliceString(urlNode.from, urlNode.to).trim();
            ranges.push(linkMarkDecoForUrl(url).range(node.from, node.to));
            const widget = pickLinkIconWidget(url, resolver);
            const openingMark = node.node.getChildren("LinkMark")[0];
            const iconPos = openingMark?.to ?? node.from;
            if (widget) ranges.push(Decoration.widget({ widget, side: 1 }).range(iconPos));
            const linkMarks = node.node.getChildren("LinkMark");
            const labelFrom = linkMarks[0]?.to ?? -1;
            const labelTo = linkMarks[1]?.from ?? -1;
            const labelStartLine = labelFrom >= 0 ? doc.lineAt(labelFrom) : null;
            const labelEndLine = labelTo > labelFrom ? doc.lineAt(labelTo - 1) : null;
            const singleLineLabel = !!labelStartLine && !!labelEndLine && labelStartLine.number === labelEndLine.number;
            if (labelFrom >= 0 && labelTo > labelFrom && singleLineLabel) {
              const label = doc.sliceString(labelFrom, labelTo);
              const decodedLabel = decodedVisibleLinkLabel(label);
              const currentTitle = titleResolver?.(url)?.trim();
              const visibleLabel = currentTitle || decodedLabel;
              const shouldReplace = Boolean(currentTitle) || !activeLines.has(labelStartLine.number);
              if (shouldReplace && visibleLabel && visibleLabel !== label) {
                replacedLinkLabelRanges.push({ from: labelFrom, to: labelTo });
                ranges.push(
                  Decoration.replace({ widget: new DecodedLinkLabelWidget(visibleLabel, url) })
                    .range(labelFrom, labelTo)
                );
              }
            }
          }
        }

        // Strikethrough the body of a completed task (`- [x] foo` →
        // `foo` gets line-through). Stacks on top of the existing
        // `cm-md-task` mark added below by inlineDecorations.
        if (node.name === "Task") {
          tasks += 1;
          const marker = node.node.getChild("TaskMarker");
          if (marker) {
            const text = doc.sliceString(marker.from, marker.to);
            if (/x/i.test(text) && node.to > marker.to) {
              ranges.push(taskDoneDeco.range(marker.to, node.to));
            }
          }
        }

        if (node.name === "HTMLTag") {
          const tag = doc.sliceString(node.from, node.to);
          const strikethroughTagKind = strikethroughHtmlTagKind(tag);
          if (strikethroughTagKind) {
            const line = doc.lineAt(node.from);
            ranges.push(activeLines.has(line.number) ? markerDeco.range(node.from, node.to) : hideDeco.range(node.from, node.to));
            if (strikethroughTagKind === "open") {
              strikethroughTagStack.push({ from: node.from, to: node.to });
            } else {
              const open = strikethroughTagStack.pop();
              if (open && node.from > open.to) {
                ranges.push(inlineDecorations.Strikethrough.range(open.to, node.from));
              }
            }
            return;
          }
          const tagKind = underlineHtmlTagKind(tag);
          if (tagKind) {
            const line = doc.lineAt(node.from);
            ranges.push(activeLines.has(line.number) ? markerDeco.range(node.from, node.to) : hideDeco.range(node.from, node.to));
            if (tagKind === "open") {
              underlineTagStack.push({ from: node.from, to: node.to });
            } else {
              const open = underlineTagStack.pop();
              if (open && node.from > open.to) {
                ranges.push(underlineDeco.range(open.to, node.from));
              }
            }
            return;
          }
          const highlightTagKind = highlightHtmlTagKind(tag);
          if (highlightTagKind) {
            const line = doc.lineAt(node.from);
            ranges.push(activeLines.has(line.number) ? markerDeco.range(node.from, node.to) : hideDeco.range(node.from, node.to));
            if (highlightTagKind === "open") {
              highlightTagStack.push({ from: node.from, to: node.to });
            } else {
              const open = highlightTagStack.pop();
              if (open && node.from > open.to) {
                ranges.push(highlightDeco.range(open.to, node.from));
              }
            }
            return;
          }
          const scriptTagKind = scriptHtmlTagKind(tag);
          if (scriptTagKind) {
            const line = doc.lineAt(node.from);
            ranges.push(activeLines.has(line.number) ? markerDeco.range(node.from, node.to) : hideDeco.range(node.from, node.to));
            if (scriptTagKind.kind === "open") {
              scriptTagStack.push({ from: node.from, to: node.to, kind: scriptTagKind.tag });
            } else {
              const open = scriptTagStack.pop();
              if (open && open.kind === scriptTagKind.tag && node.from > open.to) {
                ranges.push((open.kind === "sup" ? superscriptDeco : subscriptDeco).range(open.to, node.from));
              }
            }
            return;
          }
          const colorTag = notionColorHtmlTag(tag);
          if (colorTag) {
            if (colorTag.kind === "close" && notionColorTagStack.length === 0) return;
            const line = doc.lineAt(node.from);
            ranges.push(activeLines.has(line.number) ? markerDeco.range(node.from, node.to) : hideDeco.range(node.from, node.to));
            if (colorTag.kind === "open") {
              notionColorTagStack.push({ from: node.from, to: node.to, kind: colorTag.colorKind, color: colorTag.color });
            } else {
              const open = notionColorTagStack.pop();
              if (open && node.from > open.to) {
                ranges.push(notionColorDeco(open.kind, open.color).range(open.to, node.from));
              }
            }
            return;
          }
        }

        // URL nodes inside `[label](href)` links are hidden on
        // inactive lines only when they are the destination URL.
        // A label can itself look like a URL (`[https://x](https://y)`);
        // that visible label must keep the surrounding link target,
        // otherwise the click handler sees the label URL or a malformed
        // `](...)` span instead of the markdown link's href.
        if (node.name === "URL") {
          const parent = node.node.parent;
          const linkUrlNode = parent?.name === "Link" ? markdownLinkDestinationUrlNode(parent) : null;
          const isLinkDestination = !!linkUrlNode && linkUrlNode.from === node.from && linkUrlNode.to === node.to;
          const line = doc.lineAt(node.from);
          const url = doc.sliceString(node.from, node.to).trim();
          if (linkUrlNode && !isLinkDestination) {
            return;
          }
          if (activeLines.has(line.number)) {
            addUrlRange(ranges, urlRanges, node.from, node.to, url);
          } else if (isLinkDestination && node.to > node.from) {
            ranges.push(hideDeco.range(node.from, node.to));
          } else {
            // Tag as URL so the click handler still triggers + CSS
            // colour applies, but don't hide the text.
            addUrlRange(ranges, urlRanges, node.from, node.to, url);
          }
          return;
        }

        if (node.name === "Escape") {
          if (rangeContains(replacedLinkLabelRanges, node.from, node.to)) return;
          const line = doc.lineAt(node.from);
          if (activeLines.has(line.number)) {
            ranges.push(markerDeco.range(node.from, node.to));
          } else if (node.to > node.from + 1) {
            ranges.push(
              Decoration.replace({ widget: new EscapedCharWidget(doc.sliceString(node.from + 1, node.to)) })
                .range(node.from, node.to)
            );
          }
          return;
        }

        if (markerNodeNames.has(node.name)) {
          if (node.name === "LinkMark" && isUnresolvedLinkMark(node.node)) {
            return;
          }

          const line = doc.lineAt(node.from);
          const isActive = activeLines.has(line.number);

          // TaskMarker `[ ]` / `[x]` → real <input type="checkbox">.
          // Keep it interactive even while the task line is active; Notion
          // does not make users leave the line before toggling a task.
          if (node.name === "TaskMarker" && node.to > node.from) {
            const text = doc.sliceString(node.from, node.to);
            const checked = /x/i.test(text);
            const widget = new TaskCheckboxWidget(checked, node.from, node.to);
            ranges.push(Decoration.replace({ widget }).range(node.from, node.to));
            return;
          }

          if (isActive) {
            ranges.push(markerDeco.range(node.from, node.to));
            return;
          }

          // Unordered ListMark (`-`, `*`, `+`) → bullet widget.
          // Leave ordered list marks (`1.`, `2.`) as raw text.
          if (node.name === "ListMark" && node.to > node.from) {
            const text = doc.sliceString(node.from, node.to);
            if (/^[-*+]$/.test(text.trim())) {
              ranges.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
              return;
            }
            ranges.push(markerDeco.range(node.from, node.to));
            return;
          }

          // Default: hide on inactive lines if marker is in the
          // hideable set; otherwise keep it visible (dim grey).
          if (hideableMarkerNames.has(node.name) && node.to > node.from) {
            ranges.push(hideDeco.range(node.from, node.to));
          } else {
            ranges.push(markerDeco.range(node.from, node.to));
          }
          return;
        }

        const inlineDecoForNode = inlineDecorations[node.name];
        if (inlineDecoForNode && node.to > node.from) {
          ranges.push(inlineDecoForNode.range(node.from, node.to));
        }
      }
    });
  }

  if (seenNames) console.log("[md inline] names seen:", Array.from(seenNames).sort());
  const result = Decoration.set(ranges, true);
  const ms = performance.now() - start;
  if (ms >= PERF_LOG_MIN_MS) {
    perfLog("cm.inlineDecorations", {
      ms: Number(ms.toFixed(2)),
      ranges: ranges.length,
      visibleRanges: visibleRanges.length,
      docLines: doc.lines,
      visitedNodes,
      links,
      tasks,
      bareUrls,
      singleTildeStrikes
    });
  }
  return result;
}

function findSingleTildeStrikethroughs(
  text: string,
  lineOffset: number
): Array<{ openFrom: number; openTo: number; from: number; to: number; closeFrom: number; closeTo: number }> {
  const matches: Array<{ openFrom: number; openTo: number; from: number; to: number; closeFrom: number; closeTo: number }> = [];
  let open = -1;
  for (let index = 0; index < text.length; index += 1) {
    if (!isSingleTildeDelimiter(text, index)) continue;
    if (open < 0) {
      if (isSingleTildeOpen(text, index)) open = index;
      continue;
    }
    if (!isSingleTildeClose(text, index)) continue;
    matches.push({
      openFrom: lineOffset + open,
      openTo: lineOffset + open + 1,
      from: lineOffset + open + 1,
      to: lineOffset + index,
      closeFrom: lineOffset + index,
      closeTo: lineOffset + index + 1
    });
    open = -1;
  }
  return matches;
}

function isSingleTildeDelimiter(text: string, index: number): boolean {
  if (text[index] !== "~") return false;
  if (text[index - 1] === "\\" || text[index - 1] === "~" || text[index + 1] === "~") return false;
  return true;
}

function isSingleTildeOpen(text: string, index: number): boolean {
  const next = text[index + 1] ?? "";
  return next.length > 0 && !/\s/.test(next);
}

function isSingleTildeClose(text: string, index: number): boolean {
  const previous = text[index - 1] ?? "";
  return previous.length > 0 && !/\s/.test(previous);
}

function addNestedImportedSingleTildeInlineDecorations(
  ranges: Range<Decoration>[],
  lineText: string,
  lineOffset: number,
  outer: { from: number; to: number },
  lineIsActive: boolean
): void {
  const bodyFrom = outer.from - lineOffset;
  const bodyTo = outer.to - lineOffset;
  addPairedInlineTokenDecorations(
    ranges,
    lineText,
    lineOffset,
    bodyFrom,
    bodyTo,
    "~~",
    inlineDecorations.Strikethrough,
    lineIsActive
  );
  addPairedInlineTokenDecorations(
    ranges,
    lineText,
    lineOffset,
    bodyFrom,
    bodyTo,
    "**",
    inlineDecorations.StrongEmphasis,
    lineIsActive
  );
}

function addPairedInlineTokenDecorations(
  ranges: Range<Decoration>[],
  text: string,
  lineOffset: number,
  from: number,
  to: number,
  token: string,
  bodyDeco: Decoration,
  lineIsActive: boolean
): void {
  let open = -1;
  let index = from;
  while (index <= to - token.length) {
    if (text.slice(index, index + token.length) !== token || text[index - 1] === "\\") {
      index += 1;
      continue;
    }
    if (open < 0) {
      open = index;
      index += token.length;
      continue;
    }
    if (index > open + token.length) {
      const markerDecoration = importedInlineMarkerDecoration(lineIsActive);
      ranges.push(markerDecoration.range(lineOffset + open, lineOffset + open + token.length));
      ranges.push(bodyDeco.range(lineOffset + open + token.length, lineOffset + index));
      ranges.push(markerDecoration.range(lineOffset + index, lineOffset + index + token.length));
    }
    open = -1;
    index += token.length;
  }
}

function importedInlineMarkerDecoration(lineIsActive: boolean): Decoration {
  return lineIsActive ? markerDeco : hideDeco;
}

function isUnresolvedLinkMark(
  node: { parent: ({ name: string } & MarkdownLinkNodeWithUrls) | null }
): boolean {
  const parent = node.parent;
  return parent?.name === "Link" && !markdownLinkDestinationUrlNode(parent);
}

function underlineHtmlTagKind(tag: string): "open" | "close" | null {
  const trimmed = tag.trim().toLowerCase();
  if (/^<\s*(?:u|ins)(?:\s[^>]*)?>$/.test(trimmed)) return "open";
  if (/^<\s*\/\s*(?:u|ins)\s*>$/.test(trimmed)) return "close";
  return null;
}

function strikethroughHtmlTagKind(tag: string): "open" | "close" | null {
  const trimmed = tag.trim().toLowerCase();
  if (/^<\s*(?:s|del)(?:\s[^>]*)?>$/.test(trimmed)) return "open";
  if (/^<\s*\/\s*(?:s|del)\s*>$/.test(trimmed)) return "close";
  return null;
}

function highlightHtmlTagKind(tag: string): "open" | "close" | null {
  const trimmed = tag.trim().toLowerCase();
  if (/^<\s*mark(?:\s[^>]*)?>$/.test(trimmed)) return "open";
  if (/^<\s*\/\s*mark\s*>$/.test(trimmed)) return "close";
  return null;
}

function scriptHtmlTagKind(tag: string): { kind: "open" | "close"; tag: "sup" | "sub" } | null {
  const trimmed = tag.trim().toLowerCase();
  const open = /^<\s*(sup|sub)(?:\s[^>]*)?>$/.exec(trimmed);
  if (open) return { kind: "open", tag: open[1] as "sup" | "sub" };
  const close = /^<\s*\/\s*(sup|sub)\s*>$/.exec(trimmed);
  if (close) return { kind: "close", tag: close[1] as "sup" | "sub" };
  return null;
}

function notionColorHtmlTag(tag: string): { kind: "open"; colorKind: "color" | "bg"; color: string } | { kind: "close" } | null {
  const trimmed = tag.trim().toLowerCase();
  if (/^<\s*\/\s*span\s*>$/.test(trimmed)) return { kind: "close" };
  const match = /^<\s*span\s+([^>]*)>$/.exec(trimmed);
  if (!match) return null;
  const attrs = match[1] ?? "";
  const attr = /\bdata-lotion-(color|bg)\s*=\s*(["'])([^"']+)\2/.exec(attrs);
  if (!attr) return null;
  const color = attr[3].toLowerCase();
  if (!notionColorNamePattern.test(color)) return null;
  return { kind: "open", colorKind: attr[1] as "color" | "bg", color };
}

function decodedVisibleLinkLabel(label: string): string | null {
  const urlDecoded = decodedUrlLinkLabel(label);
  const decoded = decodeMarkdownEscapes(urlDecoded ?? label);
  return decoded === label ? null : decoded;
}

function decodeMarkdownEscapes(label: string): string {
  return label.replace(/\\([\\`*{}\[\]()#+\-.!_>~|])/g, "$1");
}

function decodedUrlLinkLabel(label: string): string | null {
  const trimmed = label.trim();
  if (!/^https?:\/\//i.test(trimmed) || !/%[0-9a-f]{2}/i.test(trimmed)) return null;
  let decoded = trimmed;
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return null;
    }
  }
  decoded = decoded.replace(/\s+/g, " ").trim();
  return decoded || null;
}

function importedMissingDatabaseTitle(lineText: string): string | null {
  const match = /^[_*]?\s*📂\s+(.+?)\s+\(database not found\)\s*[_*]?$/i.exec(lineText.trim());
  return match?.[1]?.trim() || null;
}

function collectMarkdownLinkRanges(
  state: EditorState,
  visibleRanges: readonly { from: number; to: number }[]
): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  for (const { from, to } of visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== "Link") return;
        if (!markdownLinkDestinationUrlNode(node.node)) return;
        out.push({ from: node.from, to: node.to });
      }
    });
  }
  return out;
}

function rangeContains(ranges: readonly { from: number; to: number }[], from: number, to: number): boolean {
  return ranges.some((range) => from >= range.from && to <= range.to);
}

function rangeOverlaps(ranges: readonly { from: number; to: number }[], from: number, to: number): boolean {
  return ranges.some((range) => from < range.to && to > range.from);
}

function markdownLinkDestinationUrlNode(
  linkNode: MarkdownLinkNodeWithUrls
): { from: number; to: number } | null {
  const urls = linkNode.getChildren("URL");
  return urls.length > 0 ? urls[urls.length - 1] : null;
}

type MarkdownLinkNodeWithUrls = {
  getChildren(name: string): Array<{ from: number; to: number }>;
};

// ── block + line (StateField-required) decorations ─────────────────────

function toggleSummaryFocusRequest(
  doc: Text,
  selection: SelectionRange,
  sourceFrom: number,
  sourceTo: number
): ToggleSummaryFocusRequest | null {
  if (!selection.empty) return null;
  if (selection.head >= sourceFrom && selection.head <= sourceTo) {
    const line = doc.lineAt(selection.head);
    const match = /^(\s*summary:\s*)/.exec(line.text);
    if (!match?.[1]) return null;
    const offset = Math.max(0, selection.head - line.from - match[1].length);
    const rawSummary = line.text.slice(match[1].length);
    return {
      offset,
      selectAll: rawSummary.trim().length === 0
    };
  }
  const cursorJustAfterSource = selection.head >= sourceTo && selection.head <= Math.min(doc.length, sourceTo + 1);
  if (!cursorJustAfterSource) return null;
  return isBlankToggleSource(doc.sliceString(sourceFrom, sourceTo))
    ? { offset: 0, selectAll: true }
    : null;
}

function isBlankToggleSource(source: string): boolean {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const summaryLine = lines.find((line) => line.trimStart().startsWith("summary:"));
  const separator = lines.findIndex((line) => line.trim() === "---");
  if (!summaryLine || separator === -1 || !/^summary:\s*$/.test(summaryLine.trim())) return false;
  return lines.slice(separator + 1).every((line) => line.trim() === "" || line.trim() === "```");
}

function imageAltFocusRequest(
  selection: SelectionRange,
  altFrom: number,
  altTo: number,
  alt: string,
  src: string,
  sourceTo: number,
  docLength: number
): ImageAltFocusRequest | null {
  if (!selection.empty) return null;
  if (selection.head >= altFrom && selection.head <= altTo) {
    return {
      offset: Math.max(0, selection.head - altFrom),
      selectAll: alt.trim().length === 0
    };
  }
  const cursorJustAfterSource = selection.head >= sourceTo && selection.head <= Math.min(docLength, sourceTo + 1);
  if (cursorJustAfterSource && alt.trim().length === 0 && isMissingImageSource(src)) {
    return { offset: 0, selectAll: true };
  }
  return null;
}

function buildBlockDecorations(state: EditorState): DecorationSet {
  if (!state.facet(markdownDecorationsEnabledFacet)) return Decoration.none;

  const start = performance.now();
  const ranges: Range<Decoration>[] = [];
  const doc = state.doc;
  const sel = state.selection.main;
  const showEmbedSource = state.facet(showEmbedSourceFacet);
  const revealedEmbedSource = state.field(revealedEmbedSourceField, false) ?? null;
  const seenNames = DEBUG ? new Set<string>() : null;
  const tocHeadings = collectMarkdownHeadings(state);
  let renderedManualToc = false;
  const lotionViewCounters = new Map<string, number>();
  const counts = {
    nodes: 0,
    fenced: 0,
    lineDecorations: 0,
    lotionViews: 0,
    lotionIframes: 0,
    callouts: 0,
    toggles: 0,
    equations: 0,
    tocs: 0,
    tables: 0,
    images: 0,
    attachmentPreviews: 0,
    webPreviews: 0,
    horizontalRules: 0
  };

  // Cursor / selection overlaps the given inclusive document range.
  // Some rich blocks collapse while inactive. Hidden embed sources
  // expand again when the selection moves inside their source range.
  const cursorInRange = (from: number, to: number): boolean =>
    sel.to >= from && sel.from <= to;
  const sourceRevealedInRange = (from: number, to: number): boolean =>
    revealedEmbedSource !== null &&
    revealedEmbedSource >= from &&
    revealedEmbedSource <= to &&
    cursorInRange(from, to);
  let suppressDecorationsUntil = -1;

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.from < suppressDecorationsUntil) return false;
      counts.nodes += 1;
      seenNames?.add(node.name);

      // Per-line classes for headings, blockquote, horizontal rule.
      const lineDecoForNode = lineDecorations[node.name];
      if (lineDecoForNode) {
        const startLine = doc.lineAt(node.from);
        const endLine = doc.lineAt(Math.min(node.to, doc.length));
        for (let lineNo = startLine.number; lineNo <= endLine.number; lineNo += 1) {
          const line = doc.line(lineNo);
          if (node.name === "Blockquote") {
            ranges.push(
              Decoration.widget({
                widget: new BlockSourceEditWidget(startLine.from, endLine.to),
                side: -1
              }).range(line.from)
            );
          }
          ranges.push(lineDecoForNode.range(line.from, line.from));
          counts.lineDecorations += 1;
        }
      }

      if (node.name === "FencedCode" || node.name === "CodeBlock") {
        counts.fenced += 1;
        const startLine = doc.lineAt(node.from);
        const endLine = doc.lineAt(Math.min(node.to, doc.length));

        // Lotion-specific fenced blocks hide their source while keeping the
        // rendered block in place. The source is still available via the
        // sidebar setting, raw markdown, or each widget's edit-source affordance.
        let renderedAsWidget = false;
        if (node.name === "FencedCode") {
          const infoNode = node.node.getChild("CodeInfo");
          const info = infoNode ? doc.sliceString(infoNode.from, infoNode.to).trim() : "";
          const textNode = node.node.getChild("CodeText");
          const body = textNode ? doc.sliceString(textNode.from, textNode.to) : "";
          const cursorInFence = cursorInRange(startLine.from, endLine.to);
          const sourceExplicitlyRevealed = sourceRevealedInRange(startLine.from, endLine.to);
          const addEmbedPreview = (widget: WidgetType) => {
            if (showEmbedSource || sourceExplicitlyRevealed) {
              ranges.push(
                Decoration.widget({ widget, block: true, side: 1 }).range(endLine.to)
              );
              return;
            }
            ranges.push(
              Decoration.replace({ widget, block: true }).range(startLine.from, endLine.to)
            );
            renderedAsWidget = true;
          };

          if (info === "lotion-iframe") {
            counts.lotionIframes += 1;
            const config = parseKeyValueBody(body);
            const url = (config.url || "").trim();
            if (url) {
              const heightRaw = Number(config.height);
              const height = Number.isFinite(heightRaw) && heightRaw > 0 ? heightRaw : 360;
              const titleStr = (config.title || url).trim();
              const widget = new IframeWidget(
                url,
                height,
                titleStr,
                showEmbedSource || sourceExplicitlyRevealed ? undefined : startLine.from
              );
              addEmbedPreview(widget);
            }
          } else if (info === "lotion-view") {
            counts.lotionViews += 1;
            const config = parseKeyValueBody(body);
            const databaseId = (config.database || "").trim();
            const viewId = (config.view || "").trim();
            if (databaseId) {
              const registry = state.facet(lotionViewRegistry);
              const stableId = nextLotionViewStableId(databaseId, viewId, lotionViewCounters);
              const widget = new LotionViewWidget(
                databaseId,
                viewId,
                registry,
                stableId,
                showEmbedSource || sourceExplicitlyRevealed ? undefined : startLine.from
              );
              addEmbedPreview(widget);
            }
          } else if (info === "lotion-callout") {
            counts.callouts += 1;
            const parsed = parseCalloutBody(body);
            if (cursorInFence || showEmbedSource || sourceExplicitlyRevealed) {
              const widget = new CalloutWidget(parsed.icon, parsed.markdown, parsed.background);
              ranges.push(
                Decoration.widget({ widget, block: true, side: 1 }).range(endLine.to)
              );
            } else {
              const widget = new CalloutWidget(parsed.icon, parsed.markdown, parsed.background, startLine.from);
              ranges.push(
                Decoration.replace({ widget, block: true }).range(startLine.from, endLine.to)
              );
              renderedAsWidget = true;
            }
          } else if (info === "lotion-toggle") {
            counts.toggles += 1;
            const source = readLotionToggleSource(doc, startLine.number, body, endLine.to);
            const parsed = parseToggleBody(source.body);
            const sourceTo = source.to;
            const toggleSourceExplicitlyRevealed = sourceRevealedInRange(startLine.from, sourceTo);
            if (showEmbedSource || toggleSourceExplicitlyRevealed) {
              const widget = new ToggleWidget(parsed.summary, parsed.markdown, parsed.open);
              ranges.push(
                Decoration.widget({ widget, block: true, side: 1 }).range(sourceTo)
              );
            } else {
              const widget = new ToggleWidget(
                parsed.summary,
                parsed.markdown,
                parsed.open,
                startLine.from,
                sourceTo,
                toggleSummaryFocusRequest(doc, sel, startLine.from, sourceTo)
              );
              ranges.push(
                Decoration.replace({ widget, block: true }).range(startLine.from, sourceTo)
              );
              renderedAsWidget = true;
              suppressDecorationsUntil = Math.max(suppressDecorationsUntil, sourceTo);
            }
          } else if (info === "lotion-equation") {
            counts.equations += 1;
            if (cursorInFence) {
              const widget = new EquationWidget(body);
              ranges.push(
                Decoration.widget({ widget, block: true, side: 1 }).range(endLine.to)
              );
            } else {
              const widget = new EquationWidget(body, startLine.from);
              ranges.push(
                Decoration.replace({ widget, block: true }).range(startLine.from, endLine.to)
              );
              renderedAsWidget = true;
            }
          } else if (info === "lotion-toc" && !cursorInFence) {
            counts.tocs += 1;
            renderedManualToc = true;
            const widget = new TocWidget(tocHeadings);
            ranges.push(
              Decoration.replace({ widget, block: true }).range(startLine.from, endLine.to)
            );
            renderedAsWidget = true;
          }
        }

        if (!renderedAsWidget) {
          for (let lineNo = startLine.number; lineNo <= endLine.number; lineNo += 1) {
            const line = doc.line(lineNo);
            const isFence =
              node.name === "FencedCode" && (lineNo === startLine.number || lineNo === endLine.number);
            ranges.push((isFence ? codeFenceLineDeco : codeLineDeco).range(line.from, line.from));
          }
        }
      }

      // Horizontal rule: replace the literal `---` / `***` / `___`
      // line with a real <hr>. Active line shows raw markdown.
      if (node.name === "HorizontalRule") {
        counts.horizontalRules += 1;
        const line = doc.lineAt(node.from);
        if (!cursorInRange(line.from, line.to)) {
          ranges.push(
            Decoration.replace({ widget: new HrWidget(), block: true }).range(line.from, line.to)
          );
        }
      }

      // GFM Table: collapse to a real `<table>` rendered via markdown-it
      // when the cursor isn't inside; expand back to raw pipes when
      // editing.
      if (node.name === "Table") {
        counts.tables += 1;
        const startLine = doc.lineAt(node.from);
        const endLine = doc.lineAt(Math.min(node.to, doc.length));
        if (!cursorInRange(startLine.from, endLine.to)) {
          const source = doc.sliceString(startLine.from, endLine.to);
          const widget = new TableWidget(source, startLine.from, endLine.to);
          ranges.push(
            Decoration.replace({ widget, block: true }).range(startLine.from, endLine.to)
          );
        }
      }

      // Image: by default replace a standalone image line with the
      // rendered preview. The raw markdown stays hidden unless the
      // global embed-source mode is enabled.
      //
      // URL / alt come from the Lezer syntax tree (URL child, and the
      // range between the first two LinkMark children) — no second
      // regex parser to keep in sync with the preview renderer.
      if (node.name === "Image") {
        counts.images += 1;
        const urlNode = markdownLinkDestinationUrlNode(node.node);
        if (!urlNode) return;
        const lineStart = doc.lineAt(node.from);
        const lineEnd = doc.lineAt(node.to);
        if (lineStart.number !== lineEnd.number) return;
        const nodeSlice = doc.sliceString(node.from, node.to);
        const lineText = doc.sliceString(lineStart.from, lineEnd.to).trim();
        if (lineText !== nodeSlice) return;

        const url = doc.sliceString(urlNode.from, urlNode.to);
        const linkMarks = node.node.getChildren("LinkMark");
        const altFrom = linkMarks.length >= 2 ? linkMarks[0].to : node.from;
        const altTo = linkMarks.length >= 2 ? linkMarks[1].from : node.from;
        const alt = linkMarks.length >= 2 ? doc.sliceString(altFrom, altTo) : "";

        const sourceExplicitlyRevealed = sourceRevealedInRange(lineStart.from, lineEnd.to);
        const showSource = showEmbedSource || sourceExplicitlyRevealed;
        const widget = showSource
          ? new ImageWidget(url, alt)
          : new ImageWidget(
            url,
            alt,
            lineStart.from,
            lineEnd.to,
            imageAltFocusRequest(sel, altFrom, altTo, alt, url, lineEnd.to, doc.length)
          );
        if (showSource) {
          ranges.push(
            Decoration.widget({ widget, block: true, side: 1 }).range(lineEnd.to)
          );
        } else {
          ranges.push(
            Decoration.replace({ widget, block: true }).range(lineStart.from, lineEnd.to)
          );
        }
      }

      // Inline preview below `[label](path.pdf|mp4|mp3|…)` links.
      // Keeps the link text intact (so the user can still cmd-click
      // to open the file in the OS handler) and appends a block
      // widget on the next line containing the actual preview.
      if (node.name === "Link") {
        const urlNode = markdownLinkDestinationUrlNode(node.node);
        if (!urlNode) return;
        const url = doc.sliceString(urlNode.from, urlNode.to).trim();
        const kind = isPreviewableAttachment(url);
        if (!kind) return;
        const lineEnd = doc.lineAt(node.to);
        // Only render the preview when the line is essentially just
        // the link — `- [label](path)` (bullet) and bare links both
        // qualify; a sentence with an inline link in the middle does
        // not. Heuristic: trim the line, strip leading list/numbered
        // markers, compare with the link's source slice.
        const lineStart = doc.lineAt(node.from);
        if (lineStart.number !== lineEnd.number) return;
        const linkSlice = doc.sliceString(node.from, node.to);
        const stripped = doc.sliceString(lineStart.from, lineEnd.to)
          .replace(/^[\s>]*(?:[-*+]|\d+\.)\s+/, "")
          .trim();
        if (stripped !== linkSlice) return;
        const widget = new AttachmentPreviewWidget(url, kind);
        counts.attachmentPreviews += 1;
        ranges.push(
          Decoration.widget({ widget, block: true, side: 1 }).range(lineEnd.to)
        );
      }
    }
  });

  for (let lineNo = 1; lineNo <= doc.lines; lineNo += 1) {
    const line = doc.line(lineNo);
    if (isLineInBlockCode(state, line.from)) continue;

    const url = standaloneBareUrl(line.text);
    if (!url) continue;

    const preview = webPreviewForUrl(url);
    if (!preview) continue;

    counts.webPreviews += 1;
    const hideSource = !showEmbedSource && !cursorInRange(line.from, line.to);
    const widget = new IframeWidget(
      preview.url,
      preview.height,
      preview.title,
      hideSource ? line.from : undefined
    );
    if (!hideSource) {
      ranges.push(
        Decoration.widget({
          widget,
          block: true,
          side: 1
        }).range(line.to)
      );
    } else {
      ranges.push(
        Decoration.replace({ widget, block: true }).range(line.from, line.to)
      );
    }
  }

  for (let lineNo = 1; lineNo <= doc.lines; lineNo += 1) {
    const line = doc.line(lineNo);
    if (isLineInBlockCode(state, line.from)) continue;
    if (cursorInRange(line.from, line.to)) continue;

    const title = importedMissingDatabaseTitle(line.text);
    if (!title) continue;

    ranges.push(
      Decoration.replace({
        widget: new MissingDatabaseWidget(title, showEmbedSource ? undefined : line.from),
        block: true
      }).range(line.from, line.to)
    );
  }

  if (tocHeadings.length > 0 && !renderedManualToc) {
    counts.tocs += 1;
    ranges.push(
      Decoration.widget({
        widget: new TocWidget(tocHeadings, false),
        side: -1
      }).range(0)
    );
  }

  if (seenNames) console.log("[md block] names seen:", Array.from(seenNames).sort());
  const result = Decoration.set(ranges, true);
  const ms = performance.now() - start;
  if (ms >= PERF_LOG_MIN_MS || counts.lotionViews > 0 || counts.lotionIframes > 0 || counts.images > 0 || counts.webPreviews > 0) {
    perfLog("cm.blockDecorations", {
      ms: Number(ms.toFixed(2)),
      ranges: ranges.length,
      docLines: doc.lines,
      docLength: doc.length,
      headings: tocHeadings.length,
      ...counts
    });
  }
  return result;
}

function safeBuildBlock(state: EditorState): DecorationSet {
  try {
    return buildBlockDecorations(state);
  } catch (error) {
    console.error("[lotion] markdown block decorations failed:", error);
    return Decoration.none;
  }
}

const blockDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return safeBuildBlock(state);
  },
  update(value, tr) {
    // Selection moves change which image / iframe blocks collapse,
    // so we have to rebuild on selection-only transactions too.
    const facetsUnchanged =
      tr.startState.facet(markdownDecorationsEnabledFacet) === tr.state.facet(markdownDecorationsEnabledFacet) &&
      tr.startState.facet(showEmbedSourceFacet) === tr.state.facet(showEmbedSourceFacet) &&
      tr.startState.field(revealedEmbedSourceField) === tr.state.field(revealedEmbedSourceField);
    if (!facetsUnchanged) return safeBuildBlock(tr.state);

    if (!tr.docChanged && tr.startState.selection.eq(tr.state.selection)) {
      return value;
    }
    if (!tr.docChanged && activeLineKey(tr.startState) === activeLineKey(tr.state)) {
      return value;
    }
    if (tr.docChanged && canReuseBlockDecorationsForTextChange(tr)) {
      return value.map(tr.changes);
    }
    return safeBuildBlock(tr.state);
  },
  provide: (f) => EditorView.decorations.from(f)
});

// ── theme (CSS attached as a CM theme so specificity wins by default) ──

const markdownDecorationsTheme: Extension = EditorView.theme({
  "& .cm-line.cm-md-line-h1": {
    fontSize: "26px",
    fontWeight: "700"
  },
  "& .cm-line.cm-md-line-h2": {
    fontSize: "22px",
    fontWeight: "700"
  },
  "& .cm-line.cm-md-line-h3": {
    fontSize: "18px",
    fontWeight: "700"
  },
  "& .cm-line.cm-md-line-h4": {
    fontSize: "16px",
    fontWeight: "700"
  },
  "& .cm-line.cm-md-line-h5, & .cm-line.cm-md-line-h6": {
    fontSize: "14px",
    fontWeight: "700",
    color: "#5d574f"
  },
  "& .cm-line.cm-md-line-blockquote": {
    borderLeft: "3px solid #c8bc9e",
    paddingLeft: "10px !important",
    color: "#5d574f",
    background: "#fbf6ed",
    position: "relative"
  },
  "& .cm-md-strong": { fontWeight: "700" },
  "& .cm-md-emphasis": { fontStyle: "italic" },
  "& .cm-md-strike": { textDecoration: "line-through", color: "#9c9387" },
  "& .cm-md-task-done": { textDecoration: "line-through", color: "#9c9387" },
  "& .cm-md-underline": { textDecoration: "underline", textUnderlineOffset: "2px" },
  "& .cm-md-superscript": { fontSize: "0.72em", verticalAlign: "super", lineHeight: "0" },
  "& .cm-md-subscript": { fontSize: "0.72em", verticalAlign: "sub", lineHeight: "0" },
  "& .cm-md-highlight": {
    background: "#fff2b8",
    borderRadius: "3px",
    padding: "0 2px"
  },
  "& .cm-md-callout-body mark, & .cm-md-table-widget mark": {
    background: "#fff2b8",
    borderRadius: "3px",
    padding: "0 2px"
  },
  "& .cm-md-notion-color-gray": { color: "#787774" },
  "& .cm-md-notion-color-brown": { color: "#9f6b53" },
  "& .cm-md-notion-color-orange": { color: "#d9730d" },
  "& .cm-md-notion-color-yellow": { color: "#cb912f" },
  "& .cm-md-notion-color-green": { color: "#448361" },
  "& .cm-md-notion-color-blue": { color: "#337ea9" },
  "& .cm-md-notion-color-purple": { color: "#9065b0" },
  "& .cm-md-notion-color-pink": { color: "#c14c8a" },
  "& .cm-md-notion-color-red": { color: "#d44c47" },
  "& .cm-md-notion-bg": { borderRadius: "3px", padding: "0 2px" },
  "& .cm-md-notion-bg-gray": { background: "#f1f1ef" },
  "& .cm-md-notion-bg-brown": { background: "#f4eeee" },
  "& .cm-md-notion-bg-orange": { background: "#faebdd" },
  "& .cm-md-notion-bg-yellow": { background: "#fbf3db" },
  "& .cm-md-notion-bg-green": { background: "#edf3ec" },
  "& .cm-md-notion-bg-blue": { background: "#e7f3f8" },
  "& .cm-md-notion-bg-purple": { background: "#f6f3f8" },
  "& .cm-md-notion-bg-pink": { background: "#faf1f5" },
  "& .cm-md-notion-bg-red": { background: "#fdebec" },
  "&.cm-md-has-selection .cm-md-highlight, &.cm-md-has-selection .cm-md-notion-bg": {
    background: "transparent !important"
  },
  "&.cm-md-has-selection .cm-line.cm-md-line-has-selection.cm-md-line-blockquote": {
    background: "rgba(251, 246, 237, 0.48)"
  },
  "&.cm-md-has-selection .cm-line.cm-md-line-has-selection.cm-md-line-code": {
    background: "rgba(251, 246, 237, 0.48)"
  },
  "&.cm-md-has-selection .cm-line.cm-md-line-has-selection.cm-md-line-code-fence": {
    background: "rgba(244, 238, 226, 0.48)"
  },
  "& .cm-md-inline-code": {
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: "13px",
    background: "#f4eee2",
    border: "1px solid #ebe5db",
    borderRadius: "4px",
    padding: "0 4px"
  },
  "& .cm-md-link": { color: "#2f557f", textDecoration: "underline" },
  "& .cm-md-url": { color: "#2f557f" },
  "& .cm-md-image-ref": { color: "#5f426f" },
  "& .cm-md-marker": { color: "#b3a898", opacity: "0.7" },
  "& .cm-line.cm-md-line-h1 .cm-md-marker, & .cm-line.cm-md-line-h2 .cm-md-marker, & .cm-line.cm-md-line-h3 .cm-md-marker": {
    fontWeight: "500"
  },
  "& .cm-line.cm-md-line-code": {
    background: "#fbf6ed",
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: "13px"
  },
  "& .cm-line.cm-md-line-code-fence": {
    background: "#f4eee2",
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: "13px",
    color: "#7b7368"
  },
  "& .cm-md-image-widget": {
    position: "relative",
    margin: "0 24px",
    padding: "8px 0",
    textAlign: "center"
  },
  "& .cm-md-image-widget img": {
    maxWidth: "100%",
    width: "auto",
    height: "auto",
    borderRadius: "6px",
    boxShadow: "0 1px 4px rgba(36, 34, 31, 0.12)",
    cursor: "zoom-in"
  },
  "& .cm-md-image-placeholder": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    minHeight: "96px",
    maxWidth: "100%",
    padding: "18px 22px",
    border: "1px dashed #d7cec0",
    borderRadius: "8px",
    background: "#fbf6ed",
    color: "#8f8678",
    boxSizing: "border-box"
  },
  "& .cm-md-image-placeholder-icon": {
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    color: "#9f9587"
  },
  "& .cm-md-image-placeholder-label": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  "& .cm-md-iframe-widget-outer": {
    padding: "8px 0"
  },
  "& .cm-md-iframe-widget": {
    margin: "0 24px",
    border: "1px solid #ddd6cc",
    borderRadius: "8px",
    overflow: "hidden",
    background: "#fffdf9"
  },
  "& .cm-md-iframe-widget-header": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    padding: "8px 12px",
    borderBottom: "1px solid #e7e1d6",
    fontSize: "12px"
  },
  "& .cm-md-iframe-widget-title": { fontWeight: "600", color: "#24221f" },
  "& .cm-md-iframe-widget-url": {
    color: "#2f557f",
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    textDecoration: "none",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "60%"
  },
  "& .cm-md-iframe-widget iframe": { display: "block", width: "100%", border: "0" },
  "& .cm-md-edit-source": {
    border: "1px solid #ddd6cc",
    borderRadius: "6px",
    background: "#fffdf9",
    color: "#6f675c",
    font: "inherit",
    fontSize: "12px",
    lineHeight: "1",
    padding: "6px 8px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 1px 4px rgba(36, 34, 31, 0.08)"
  },
  "& .cm-md-edit-source:hover": {
    background: "#f3eee4",
    color: "#24221f"
  },
  "& .cm-md-block-source-edit-widget": {
    display: "inline-block",
    width: "0",
    height: "0",
    overflow: "visible",
    verticalAlign: "top"
  },
  "& .cm-md-block-source-edit-widget > .cm-md-edit-source": {
    position: "absolute",
    top: "4px",
    right: "8px",
    zIndex: "7",
    opacity: "0",
    pointerEvents: "none"
  },
  "& .cm-line.cm-md-line-blockquote:hover .cm-md-block-source-edit-widget > .cm-md-edit-source, & .cm-md-block-source-edit-widget > .cm-md-edit-source:focus-visible": {
    opacity: "1",
    pointerEvents: "auto"
  },
  "& .cm-md-image-widget > .cm-md-edit-source, & .cm-md-lotion-view-widget > .cm-md-edit-source": {
    position: "absolute",
    top: "12px",
    right: "32px",
    zIndex: "6",
    opacity: "0"
  },
  "& .cm-md-image-widget:hover > .cm-md-edit-source, & .cm-md-lotion-view-widget:hover > .cm-md-edit-source": {
    opacity: "1"
  },
  "& .cm-md-callout-widget-outer": {
    padding: "8px 0",
    position: "relative"
  },
  "& .cm-md-callout-widget-outer > .cm-md-edit-source": {
    position: "absolute",
    top: "12px",
    right: "32px",
    zIndex: "3",
    opacity: "0"
  },
  "& .cm-md-callout-widget-outer:hover > .cm-md-edit-source": {
    opacity: "1"
  },
  "& .cm-md-callout-widget": {
    display: "grid",
    gridTemplateColumns: "26px minmax(0, 1fr)",
    columnGap: "10px",
    margin: "0",
    padding: "12px 14px",
    borderRadius: "8px",
    background: "#f3eee4",
    color: "#37352f"
  },
  "& .cm-md-callout-bg-gray": { background: "#f1f1ef" },
  "& .cm-md-callout-bg-brown": { background: "#f4eeee" },
  "& .cm-md-callout-bg-orange": { background: "#faebdd" },
  "& .cm-md-callout-bg-yellow": { background: "#fbf3db" },
  "& .cm-md-callout-bg-green": { background: "#edf3ec" },
  "& .cm-md-callout-bg-blue": { background: "#e7f3f8" },
  "& .cm-md-callout-bg-purple": { background: "#f6f3f8" },
  "& .cm-md-callout-bg-pink": { background: "#faf1f5" },
  "& .cm-md-callout-bg-red": { background: "#fdebec" },
  "& .cm-md-callout-icon": {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    minWidth: "26px",
    fontSize: "20px",
    lineHeight: "1.35"
  },
  "& .cm-md-callout-icon img": {
    width: "20px",
    height: "20px",
    objectFit: "cover",
    borderRadius: "4px"
  },
  "& .cm-md-callout-body": {
    minWidth: "0",
    overflowWrap: "anywhere",
    fontSize: "15px",
    lineHeight: "1.55"
  },
  "& .cm-md-callout-body > :first-child": {
    marginTop: "0"
  },
  "& .cm-md-callout-body > :last-child": {
    marginBottom: "0"
  },
  "& .cm-md-callout-body p": {
    margin: "0 0 6px"
  },
  "& .cm-md-callout-body blockquote": {
    margin: "4px 0 8px",
    padding: "0 0 0 10px",
    borderLeft: "3px solid #c8bc9e",
    color: "#5d574f",
    background: "rgba(255, 255, 255, 0.34)"
  },
  "& .cm-md-callout-body strong": {
    fontWeight: "700"
  },
  "& .cm-md-callout-body em": {
    fontStyle: "italic"
  },
  "& .cm-md-callout-body del, & .cm-md-callout-body s": {
    color: "#9c9387",
    textDecoration: "line-through"
  },
  "& .cm-md-callout-body code": {
    borderRadius: "4px",
    border: "1px solid #ebe5db",
    background: "#f4eee2",
    padding: "0 4px",
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: "13px"
  },
  "& .cm-md-callout-body pre": {
    margin: "6px 0",
    padding: "10px 12px",
    borderRadius: "6px",
    background: "rgba(255, 255, 255, 0.38)",
    overflowX: "auto"
  },
  "& .cm-md-callout-body pre code": {
    padding: "0",
    border: "0",
    background: "transparent"
  },
  "& .cm-md-callout-body a": {
    color: "#2f557f",
    textDecoration: "underline"
  },
  "& .cm-md-callout-body ul, & .cm-md-callout-body ol": {
    margin: "2px 0 6px",
    paddingLeft: "22px"
  },
  "& .cm-md-missing-database-widget-outer": {
    padding: "8px 0",
    position: "relative"
  },
  "& .cm-md-missing-database-widget-outer > .cm-md-edit-source": {
    position: "absolute",
    top: "12px",
    right: "32px",
    zIndex: "3",
    opacity: "0"
  },
  "& .cm-md-missing-database-widget-outer:hover > .cm-md-edit-source": {
    opacity: "1"
  },
  "& .cm-md-missing-database-widget": {
    display: "grid",
    gridTemplateColumns: "26px minmax(0, 1fr)",
    columnGap: "10px",
    margin: "0",
    padding: "12px 14px",
    borderRadius: "8px",
    border: "1px solid #e5d6c8",
    background: "#fbf3db",
    color: "#37352f"
  },
  "& .cm-md-missing-database-icon": {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    minWidth: "26px",
    fontSize: "20px",
    lineHeight: "1.35"
  },
  "& .cm-md-missing-database-body": {
    minWidth: "0",
    overflowWrap: "anywhere",
    lineHeight: "1.45"
  },
  "& .cm-md-missing-database-label": {
    marginBottom: "2px",
    color: "#8c7a5a",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.02em",
    textTransform: "uppercase"
  },
  "& .cm-md-missing-database-title": {
    fontSize: "15px",
    fontWeight: "600",
    color: "#24221f"
  },
  "& .cm-md-missing-database-message": {
    marginTop: "2px",
    fontSize: "13px",
    color: "#7b7368"
  },
  "& .cm-md-missing-database-actions": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "8px"
  },
  "& .cm-md-missing-database-search": {
    border: "1px solid #d7c8aa",
    borderRadius: "6px",
    background: "#fffaf0",
    color: "#5f4d1e",
    fontSize: "12px",
    fontWeight: "600",
    lineHeight: "1.2",
    padding: "4px 9px",
    cursor: "pointer"
  },
  "& .cm-md-missing-database-search:hover, & .cm-md-missing-database-search:focus-visible": {
    background: "#f4e9c7",
    borderColor: "#c7ad59",
    outline: "none"
  },
  "& .cm-md-toggle-widget-outer": {
    position: "relative",
    padding: "2px 0"
  },
  "& .cm-md-toggle-widget": {
    margin: "0",
    color: "#37352f"
  },
  "& .cm-md-toggle-summary": {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    cursor: "pointer",
    fontWeight: "inherit",
    lineHeight: "inherit"
  },
  "& .cm-md-toggle-disclosure": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "18px",
    height: "24px",
    border: "0",
    borderRadius: "4px",
    padding: "0",
    background: "transparent",
    color: "#9c9387",
    font: "inherit",
    lineHeight: "1",
    cursor: "pointer"
  },
  "& .cm-md-toggle-disclosure:hover, & .cm-md-toggle-disclosure:focus-visible": {
    background: "rgba(55, 53, 47, 0.08)",
    color: "#37352f",
    outline: "none"
  },
  "& .cm-md-toggle-summary-text": {
    display: "inline-block",
    minWidth: "2ch",
    maxWidth: "calc(100% - 24px)",
    border: "0",
    borderRadius: "4px",
    padding: "0 2px",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    fontWeight: "inherit",
    outline: "none",
    cursor: "text",
    userSelect: "text"
  },
  "& .cm-md-toggle-summary-text:focus": {
    background: "rgba(55, 53, 47, 0.06)",
    boxShadow: "0 0 0 2px rgba(55, 53, 47, 0.12)"
  },
  "& .cm-md-toggle-body": {
    display: "block",
    width: "calc(100% - 22px)",
    minHeight: "0",
    margin: "2px 0 0 22px",
    border: "0",
    color: "#37352f",
    fontSize: "inherit",
    lineHeight: "inherit",
    fontFamily: "inherit",
    background: "transparent",
    outline: "none",
    borderRadius: "4px",
    padding: "0",
    userSelect: "text",
    overflowWrap: "anywhere"
  },
  "& .cm-md-toggle-body[hidden]": {
    display: "none"
  },
  "& .cm-md-toggle-body > :first-child": {
    marginTop: "0"
  },
  "& .cm-md-toggle-body > :last-child": {
    marginBottom: "0"
  },
  "& .cm-md-toggle-body p": {
    margin: "0 0 6px"
  },
  "& .cm-md-toggle-body h1": {
    margin: "0 0 6px",
    fontSize: "26px",
    fontWeight: "700",
    lineHeight: "1.25"
  },
  "& .cm-md-toggle-body h2": {
    margin: "0 0 6px",
    fontSize: "22px",
    fontWeight: "700",
    lineHeight: "1.28"
  },
  "& .cm-md-toggle-body h3": {
    margin: "0 0 6px",
    fontSize: "18px",
    fontWeight: "700",
    lineHeight: "1.3"
  },
  "& .cm-md-toggle-body h4": {
    margin: "0 0 6px",
    fontSize: "16px",
    fontWeight: "700",
    lineHeight: "1.35"
  },
  "& .cm-md-toggle-body h5, & .cm-md-toggle-body h6": {
    margin: "0 0 6px",
    color: "#5d574f",
    fontSize: "14px",
    fontWeight: "700",
    lineHeight: "1.35"
  },
  "& .cm-md-toggle-body ul, & .cm-md-toggle-body ol": {
    margin: "2px 0 6px",
    paddingLeft: "22px"
  },
  "& .cm-md-toggle-body li": {
    margin: "1px 0"
  },
  "& .cm-md-toggle-body img": {
    display: "block",
    maxWidth: "100%",
    width: "auto",
    height: "auto",
    margin: "8px auto",
    borderRadius: "6px",
    objectFit: "contain",
    background: "#f7f5f0",
    boxShadow: "0 1px 4px rgba(36, 34, 31, 0.12)",
    cursor: "zoom-in"
  },
  "& .cm-md-toggle-body blockquote": {
    margin: "4px 0 8px",
    padding: "0 0 0 10px",
    borderLeft: "3px solid #c8bc9e",
    color: "#5d574f",
    background: "#fbf6ed"
  },
  "& .cm-md-toggle-body code": {
    borderRadius: "4px",
    border: "1px solid #ebe5db",
    background: "#f4eee2",
    padding: "0 4px",
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: "13px"
  },
  "& .cm-md-toggle-body pre": {
    margin: "6px 0",
    padding: "10px 12px",
    borderRadius: "6px",
    background: "#fbf6ed",
    overflowX: "auto"
  },
  "& .cm-md-toggle-body pre code": {
    padding: "0",
    border: "0",
    background: "transparent"
  },
  "& .cm-md-toggle-body a": {
    color: "#2f557f",
    textDecoration: "underline"
  },
  "& .cm-md-toggle-body strong": {
    fontWeight: "700"
  },
  "& .cm-md-toggle-body em": {
    fontStyle: "italic"
  },
  "& .cm-md-toggle-body del, & .cm-md-toggle-body s": {
    color: "#9c9387",
    textDecoration: "line-through"
  },
  "& .cm-md-toggle-body mark": {
    background: "#fff2b8",
    borderRadius: "3px",
    padding: "0 2px"
  },
  "& .cm-md-toggle-body table": {
    borderCollapse: "collapse",
    margin: "6px 0",
    maxWidth: "100%",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: "14px"
  },
  "& .cm-md-toggle-body th, & .cm-md-toggle-body td": {
    border: "1px solid #d8d2c8",
    padding: "6px 10px",
    textAlign: "left",
    verticalAlign: "top"
  },
  "& .cm-md-toggle-body th": {
    background: "#f4eee2",
    fontWeight: "600"
  },
  "& .cm-md-toggle-body tr:nth-child(even) td": {
    background: "#fbf8f1"
  },
  "& .cm-md-equation-widget-outer": {
    position: "relative",
    padding: "8px 0"
  },
  "& .cm-md-equation-widget-outer > .cm-md-edit-source": {
    position: "absolute",
    top: "10px",
    right: "32px",
    zIndex: "3",
    opacity: "0"
  },
  "& .cm-md-equation-widget-outer:hover > .cm-md-edit-source": {
    opacity: "1"
  },
  "& .cm-md-equation-widget": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    margin: "0 24px",
    minHeight: "44px",
    color: "#24221f",
    fontSize: "17px",
    lineHeight: "1.5"
  },
  "& .cm-md-equation-marker": {
    color: "#9c9387",
    fontFamily: "Georgia, serif",
    fontStyle: "italic",
    fontSize: "18px"
  },
  "& .cm-md-equation-source": {
    maxWidth: "100%",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    background: "transparent",
    color: "#24221f",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: "15px"
  },
  "& .cm-md-toc-widget-outer": {
    padding: "8px 0"
  },
  "& .cm-md-toc-panel": {
    margin: "0 24px",
    borderLeft: "2px solid #ded7ca"
  },
  "& .cm-md-side-toc-panel": {
    display: "none"
  },
  "& .cm-md-toc-header": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    padding: "2px 4px 4px 10px",
    color: "#9c9387",
    fontSize: "11px",
    fontWeight: "600",
    textTransform: "uppercase"
  },
  "& .cm-md-toc-toggle": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "22px",
    height: "22px",
    border: "0",
    borderRadius: "6px",
    background: "transparent",
    color: "#6f675c",
    cursor: "pointer",
    font: "inherit",
    fontSize: "18px",
    lineHeight: "1"
  },
  "& .cm-md-toc-toggle:hover": {
    background: "#f3eee4",
    color: "#24221f"
  },
  "& .cm-md-toc-widget": {
    padding: "8px 0",
    maxHeight: "none",
    overflow: "visible"
  },
  "& .cm-md-toc-collapsed .cm-md-toc-title, & .cm-md-toc-collapsed .cm-md-toc-widget": {
    display: "none"
  },
  "& .cm-md-toc-item": {
    display: "block",
    width: "100%",
    border: "0",
    background: "transparent",
    color: "#6f675c",
    textAlign: "left",
    font: "inherit",
    fontSize: "14px",
    lineHeight: "1.35",
    padding: "4px 8px",
    borderRadius: "6px",
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  "& .cm-md-toc-item:hover": {
    background: "#f3eee4",
    color: "#24221f"
  },
  "& .cm-md-toc-empty": {
    padding: "4px 12px",
    color: "#9c9387",
    fontSize: "14px"
  },
  "& .cm-md-attachment-preview-outer": {
    margin: "0 24px",
    padding: "8px 0"
  },
  "& .cm-md-attachment-preview-pdf": {
    display: "block",
    width: "100%",
    height: "480px",
    border: "1px solid #ddd6cc",
    borderRadius: "8px",
    background: "#fffdf9"
  },
  "& .cm-md-attachment-preview-video": {
    display: "block",
    width: "100%",
    maxHeight: "480px",
    borderRadius: "8px",
    background: "#000"
  },
  "& .cm-md-attachment-preview-audio": {
    display: "block",
    width: "100%"
  },
  "& .cm-md-lotion-view-widget": {
    position: "relative",
    padding: "8px 0"
  },
  "& .cm-md-list-bullet": {
    color: "#7b7368",
    fontWeight: "700",
    paddingRight: "4px"
  },
  "& .cm-md-task-checkbox": {
    margin: "0 6px 0 0",
    verticalAlign: "-1px",
    cursor: "pointer"
  },
  "& .cm-md-table-widget": {
    position: "relative",
    padding: "72px 0 8px 28px",
    overflowX: "auto"
  },
  "& .cm-md-table-widget > .cm-md-edit-source": {
    position: "absolute",
    top: "8px",
    right: "8px",
    zIndex: "7",
    opacity: "0"
  },
  "& .cm-md-table-widget:hover > .cm-md-edit-source, & .cm-md-table-widget > .cm-md-edit-source:focus-visible": {
    opacity: "1"
  },
  "& .cm-md-table-controls": {
    position: "absolute",
    top: "8px",
    right: "94px",
    zIndex: "7",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    opacity: "0"
  },
  "& .cm-md-table-widget:hover > .cm-md-table-controls, & .cm-md-table-controls:focus-within": {
    opacity: "1"
  },
  "& .cm-md-table-control": {
    border: "1px solid #ddd6cc",
    borderRadius: "6px",
    background: "#fffdf9",
    color: "#6f675c",
    font: "inherit",
    fontSize: "12px",
    lineHeight: "1",
    padding: "6px 8px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 1px 4px rgba(36, 34, 31, 0.08)"
  },
  "& .cm-md-table-control:hover, & .cm-md-table-control:focus-visible": {
    background: "#f3eee4",
    color: "#24221f",
    outline: "none"
  },
  "& .cm-md-table-drag-handle": {
    position: "absolute",
    zIndex: "8",
    width: "20px",
    height: "20px",
    border: "1px solid transparent",
    borderRadius: "5px",
    background: "rgba(255, 253, 249, 0.94)",
    boxShadow: "0 1px 4px rgba(36, 34, 31, 0.08)",
    cursor: "grab",
    opacity: "0",
    padding: "0",
    transition: "opacity 120ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease, transform 140ms ease"
  },
  "& .cm-md-table-drag-handle::before": {
    content: '""',
    position: "absolute",
    top: "5px",
    left: "6px",
    width: "3px",
    height: "3px",
    borderRadius: "50%",
    background: "#8b8378",
    boxShadow: "6px 0 0 #8b8378, 0 5px 0 #8b8378, 6px 5px 0 #8b8378, 0 10px 0 #8b8378, 6px 10px 0 #8b8378"
  },
  "& .cm-md-table-widget:hover .cm-md-table-drag-handle, & .cm-md-table-drag-handle:focus-visible, & .cm-md-table-drag-handle.is-dragging": {
    opacity: "1"
  },
  "& .cm-md-table-drag-handle:hover, & .cm-md-table-drag-handle:focus-visible, & .cm-md-table-drag-handle.is-dragging": {
    borderColor: "#cfc7bb",
    background: "#fffdf9",
    boxShadow: "0 5px 14px rgba(36, 34, 31, 0.18)",
    outline: "none"
  },
  "& .cm-md-table-drag-handle.is-dragging": {
    cursor: "grabbing"
  },
  "& .cm-md-table-row-drag-handle": {
    left: "-26px",
    top: "50%",
    transform: "translateY(-50%)"
  },
  "& .cm-md-table-row-drag-handle.is-dragging": {
    transform: "translateY(-50%) scale(1.08)"
  },
  "& .cm-md-table-column-drag-handle": {
    left: "50%",
    top: "-32px",
    transform: "translateX(-50%)"
  },
  "& .cm-md-table-column-drag-handle.is-dragging": {
    transform: "translateX(-50%) scale(1.08)"
  },
  "& .cm-md-table-drag-ghost": {
    position: "absolute",
    zIndex: "12",
    maxWidth: "260px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    border: "1px solid #cfc7bb",
    borderRadius: "6px",
    background: "rgba(255, 253, 249, 0.98)",
    color: "#3a342d",
    boxShadow: "0 12px 28px rgba(36, 34, 31, 0.22)",
    fontSize: "12px",
    fontWeight: "600",
    lineHeight: "1.2",
    padding: "7px 9px",
    pointerEvents: "none",
    transform: "translate(12px, -50%) scale(1)",
    transition: "left 70ms linear, top 70ms linear, transform 140ms ease, opacity 120ms ease"
  },
  "& .cm-md-table-row-drag-source > td, & .cm-md-table-column-drag-source": {
    background: "#fbf2df !important",
    boxShadow: "inset 0 0 0 1px rgba(176, 151, 92, 0.26)",
    opacity: "0.58",
    transition: "background 120ms ease, box-shadow 120ms ease, opacity 120ms ease"
  },
  "& .cm-md-table-row-drop-target > td": {
    background: "#f0eadf !important",
    boxShadow: "inset 0 0 0 2px rgba(89, 120, 181, 0.42)"
  },
  "& .cm-md-table-column-drop-target": {
    background: "#f0eadf !important",
    boxShadow: "inset 0 0 0 2px rgba(89, 120, 181, 0.42)"
  },
  "& .cm-md-table-widget table": {
    borderCollapse: "collapse",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: "14px"
  },
  "& .cm-md-table-widget th, & .cm-md-table-widget td": {
    border: "1px solid #d8d2c8",
    padding: "6px 10px",
    cursor: "text",
    overflow: "visible",
    position: "relative"
  },
  "& .cm-md-table-widget th[contenteditable]:focus, & .cm-md-table-widget td[contenteditable]:focus": {
    outline: "2px solid #2f6feb",
    outlineOffset: "-2px",
    background: "#fffdf7"
  },
  "& .cm-md-table-widget th": {
    background: "#f4eee2",
    fontWeight: "600"
  },
  "& .cm-md-table-widget tr:nth-child(even) td": {
    background: "#fbf8f1"
  },
  "& .cm-md-hr-widget-wrap": {
    padding: "12px 0"
  },
  "& .cm-md-hr-widget": {
    border: "0",
    borderTop: "2px solid #c8bc9e",
    margin: "0"
  },
  "& .cm-md-link-icon": {
    display: "inline-flex",
    alignItems: "center",
    marginRight: "4px",
    color: "#9c9387",
    verticalAlign: "-1px"
  },
  "& .cm-md-link-icon img": {
    width: "13px",
    height: "13px",
    objectFit: "cover",
    borderRadius: "2px"
  },
  "& .cm-md-link-icon-emoji": {
    fontSize: "13px",
    lineHeight: "1"
  }
});

export const markdownDecorations: Extension = [
  inlinePlugin,
  selectionVisibilityPlugin,
  selectedLineDecorationsField,
  revealedEmbedSourceField,
  blockDecorationsField,
  markdownDecorationsTheme
];

// ── helpers ────────────────────────────────────────────────────────────

function pickLinkIconWidget(url: string, resolver: LinkIconResolver | null): WidgetType | null {
  if (!url || url.startsWith("#")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
  const path = url.replace(/^\.\//, "");
  if (/^databases\/(?:user|system)\/[^/]+\/?$/.test(path) || /^(?:system\/)?databases\/db_[^/]+\/?$/.test(path)) {
    return new InternalLinkIconWidget(resolver?.(url), "database");
  }
  if (
    /^databases\/(?:user|system)\/[^/]+\/pages\/[^/]+\.md$/.test(path) ||
    /^system\/pages\/db_pages\/[^/]+\.md$/.test(path) ||
    /^pages\/db_[^/]+\/[^/]+\.md$/.test(path)
  ) {
    return new InternalLinkIconWidget(resolver?.(url), "page");
  }
  return null;
}

function parseKeyValueBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    out[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return out;
}

function parseCalloutBody(raw: string): { icon: string; markdown: string; background: string } {
  const normalized = raw.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const separator = lines.findIndex((line) => line.trim() === "---");
  if (separator === -1) {
    return { icon: "💡", markdown: normalized.trim(), background: "" };
  }
  const config = parseKeyValueBody(lines.slice(0, separator).join("\n"));
  const background = (config.background || "").trim().toLowerCase();
  return {
    icon: (config.icon || "💡").trim(),
    background: notionColorNamePattern.test(background) ? background : "",
    markdown: lines.slice(separator + 1).join("\n").trim()
  };
}

function parseToggleBody(raw: string): { summary: string; markdown: string; open: boolean } {
  const normalized = raw.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const separator = lines.findIndex((line) => line.trim() === "---");
  if (separator === -1) {
    return { summary: "Toggle", markdown: normalized.trim(), open: true };
  }
  const config = parseKeyValueBody(lines.slice(0, separator).join("\n"));
  return {
    summary: (config.summary || "Toggle").trim(),
    markdown: lines.slice(separator + 1).join("\n").trim(),
    open: (config.open || "true").trim().toLowerCase() !== "false"
  };
}

export function __testParseToggleBody(raw: string): { summary: string; markdown: string; open: boolean } {
  return parseToggleBody(raw);
}

type ToggleFenceChar = "`" | "~";

interface ToggleFenceMarker {
  char: ToggleFenceChar;
  length: number;
  info: string;
  closing: boolean;
}

interface ToggleFenceOpener {
  char: ToggleFenceChar;
  length: number;
}

function readLotionToggleSource(
  doc: Text,
  startLineNumber: number,
  parserBody: string,
  parserTo: number
): { body: string; to: number } {
  const startLine = doc.line(startLineNumber);
  const opener = parseLotionToggleOpener(startLine.text);
  if (!opener) return { body: parserBody, to: parserTo };

  const closeLine = findLotionToggleCloseLine(doc, startLineNumber, opener);
  if (!closeLine || closeLine.to <= parserTo) return { body: parserBody, to: parserTo };

  const bodyFrom = startLineNumber < doc.lines ? doc.line(startLineNumber + 1).from : startLine.to;
  return {
    body: doc.sliceString(bodyFrom, closeLine.from),
    to: closeLine.to
  };
}

export function __testReadLotionToggleSource(
  doc: Text,
  startLineNumber: number,
  parserBody: string,
  parserTo: number
): { body: string; to: number } {
  return readLotionToggleSource(doc, startLineNumber, parserBody, parserTo);
}

function parseLotionToggleOpener(text: string): ToggleFenceOpener | null {
  const marker = parseFenceMarkerLine(text);
  if (!marker || marker.closing || marker.info !== "lotion-toggle") return null;
  return { char: marker.char, length: marker.length };
}

function parseFenceMarkerLine(text: string): ToggleFenceMarker | null {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(text);
  if (!match) return null;
  const marker = match[2];
  const info = (match[3] ?? "").trim();
  return {
    char: marker[0] as ToggleFenceChar,
    length: marker.length,
    info,
    closing: info.length === 0
  };
}

function findLotionToggleCloseLine(
  doc: Text,
  startLineNumber: number,
  opener: ToggleFenceOpener
): ReturnType<Text["line"]> | null {
  let bodyStarted = false;
  let nested: ToggleFenceOpener | null = null;

  for (let lineNumber = startLineNumber + 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    if (!bodyStarted) {
      if (line.text.trim() === "---") bodyStarted = true;
      continue;
    }

    const marker = parseFenceMarkerLine(line.text);
    if (!marker) continue;

    if (nested) {
      if (marker.closing && marker.char === nested.char && marker.length >= nested.length) {
        nested = null;
      }
      continue;
    }

    if (marker.closing && marker.char === opener.char && marker.length >= opener.length) {
      return line;
    }

    if (!marker.closing) {
      nested = { char: marker.char, length: marker.length };
    }
  }

  return null;
}

function collectMarkdownHeadings(state: EditorState): TocHeading[] {
  const headings: TocHeading[] = [];
  let fence: string | null = null;
  for (let lineNo = 1; lineNo <= state.doc.lines; lineNo += 1) {
    const line = state.doc.line(lineNo);
    const text = line.text;
    const fenceMatch = /^( {0,3})(`{3,}|~{3,})/.exec(text);
    if (fenceMatch) {
      const marker = fenceMatch[2][0];
      if (fence === marker) fence = null;
      else if (!fence) fence = marker;
      continue;
    }
    if (fence) continue;
    const match = /^( {0,3})(#{1,6})\s+(.+?)\s*$/.exec(text);
    if (!match) continue;
    const headingText = cleanHeadingText(match[3]);
    if (!headingText) continue;
    headings.push({
      level: match[2].length,
      text: headingText,
      from: line.from + match[1].length
    });
  }
  return headings;
}

function cleanHeadingText(raw: string): string {
  return raw
    .replace(/\s+#+\s*$/, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\\(.)/g, "$1")
    .trim();
}

function isLineInBlockCode(state: EditorState, pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, 1);
  while (true) {
    if (node.name === "FencedCode" || node.name === "CodeBlock" || node.name === "CodeText") {
      return true;
    }
    const parent = node.parent;
    if (!parent) return false;
    node = parent;
  }
}

function addUrlRange(ranges: Range<Decoration>[], seen: Set<string>, from: number, to: number, url: string): void {
  const key = `${from}:${to}`;
  if (seen.has(key)) return;
  seen.add(key);
  ranges.push((url ? urlMarkDecoForUrl(url) : inlineDecorations.URL).range(from, to));
}

function activeLineKey(state: EditorState): string {
  const selection = state.selection.main;
  const from = state.doc.lineAt(selection.from).number;
  const to = state.doc.lineAt(selection.to).number;
  return `${from}:${to}`;
}

function canReuseBlockDecorationsForTextChange(tr: Transaction): boolean {
  if (
    tr.startState.doc.length === 0 ||
    tr.state.doc.length === 0 ||
    tr.changes.touchesRange(0, tr.startState.doc.length)
  ) {
    return false;
  }
  const beforeLines: string[] = [];
  const afterLines: string[] = [];
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    collectChangedLines(tr.startState.doc, fromA, toA, beforeLines);
    collectChangedLines(tr.state.doc, fromB, toB, afterLines);
  });
  return !shouldRebuildMarkdownBlockDecorationsForTextChange({
    lineCountChanged: tr.startState.doc.lines !== tr.state.doc.lines,
    beforeLines,
    afterLines
  });
}

function collectChangedLines(doc: Text, from: number, to: number, out: string[]): void {
  const safeFrom = Math.max(0, Math.min(from, doc.length));
  const safeTo = Math.max(safeFrom, Math.min(to, doc.length));
  let line = doc.lineAt(safeFrom);
  while (true) {
    out.push(line.text);
    if (line.to >= safeTo || line.to >= doc.length) break;
    line = doc.line(line.number + 1);
  }
}
