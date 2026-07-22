import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from "@codemirror/view";
import { vim, Vim } from "@replit/codemirror-vim";

// Hook Vim's yank/delete/paste to the OS clipboard. codemirror-vim's
// `clipboard=unnamed` option is half-implemented — only the literal
// `+` register triggers `navigator.clipboard.writeText/readText`, so
// we remap the common cut/copy/paste keys to use that register
// explicitly. Idempotent — runs once at module load.
try {
  const noremap = (Vim as unknown as {
    noremap: (lhs: string, rhs: string, ctx?: string) => void;
  }).noremap;
  for (const ctx of ["normal", "visual"]) {
    noremap("y", '"+y', ctx);
    noremap("d", '"+d', ctx);
    noremap("p", '"+p', ctx);
    noremap("P", '"+P', ctx);
  }
} catch (e) {
  console.warn("[lotion] vim clipboard remap failed:", e);
}
import { useLotionActions } from "../../context/lotion-actions";
import { perfLog } from "../../lib/perf-log";
import { useSettings } from "../../lib/settings";
import { SlashMenu } from "./SlashMenu";
import { bareUrlAt } from "./web-links";
import { classifyLink, databaseIdFromWorkspaceLink, pageIdFromWorkspacePath, tryNavigateWorkspaceLink } from "./workspace-link-routing";
import {
  clearFloatingToc,
  linkIconResolver,
  linkTitleResolver,
  markdownDecorationsEnabledFacet,
  lotionViewRegistry,
  markdownDecorations,
  refreshLinkMetadataEffect,
  showEmbedSourceFacet
} from "./markdown-decorations";
import { useLotionViewBridge } from "./useLotionViewBridge";
import {
  applySlashCommandTemplate,
  BASE_SLASH_COMMANDS,
  createChildPageInput,
  createDatabaseSlashCommands,
  createPageSlashCommands,
  type SlashPageParent
} from "../../../shared/slash-commands";
import { useI18n } from "../../lib/i18n";
import type { DatabaseSummary, PageMeta } from "../../../shared/types";

declare global {
  interface Window {
    __lotionTestImportDroppedFiles?: (files: File[]) => Promise<Array<{
      path: string;
      originalName: string;
      isImage: boolean;
    }>>;
    __lotionEditorSelectionText?: string;
    __lotionEditorSelectionUpdatedAt?: number;
  }
}

interface CodeMirrorMarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  initialViewState?: MarkdownEditorViewState;
  navigationAnchorPos?: number;
  navigationAnchorKey?: string;
  onViewStateChange?: (state: MarkdownEditorViewState) => void;
  /** Lookup tables so the editor can render the target page / database
   *  custom icon inside inline link widgets. */
  pages?: PageMeta[];
  databases?: DatabaseSummary[];
  currentPage?: SlashPageParent;
}

export interface CodeMirrorMarkdownEditorHandle {
  getViewState: () => MarkdownEditorViewState;
  focus: () => void;
}

export interface MarkdownEditorViewState {
  selectionAnchor?: number;
  selectionHead?: number;
  markdownAnchorPos?: number;
  hadFocus?: boolean;
}

/**
 * Thin React wrapper around a CodeMirror 6 EditorView. We mount once and
 * keep the same view across re-renders. External `value` changes (e.g.
 * navigating to a different page) replace the document via a dispatch;
 * internal edits are forwarded back through `onChange`.
 *
 * The `onChangeRef` indirection keeps the change handler current without
 * forcing a remount when the parent passes a new function reference.
 */
export const CodeMirrorMarkdownEditor = forwardRef<CodeMirrorMarkdownEditorHandle, CodeMirrorMarkdownEditorProps>(function CodeMirrorMarkdownEditor({
  value,
  onChange,
  initialViewState,
  navigationAnchorPos,
  navigationAnchorKey,
  onViewStateChange,
  pages,
  databases,
  currentPage
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onViewStateChangeRef = useRef(onViewStateChange);
  onViewStateChangeRef.current = onViewStateChange;
  const initialViewStateRef = useRef(initialViewState);
  // Slash-menu state lives in React; the CM updateListener pokes it
  // via a stable ref so we don't have to rebuild extensions when
  // React's state changes.
  const [slash, setSlash] = useState<SlashState>({ open: false });
  const slashStateRef = useRef<((next: SlashState) => void) | null>(null);
  slashStateRef.current = setSlash;
  const { vimMode, rawMarkdown, showEmbedSource } = useSettings();
  const { t } = useI18n();
  const actions = useLotionActions();
  const lotionViewBridge = useLotionViewBridge();
  const slashCommands = useMemo(
    () => [
      ...BASE_SLASH_COMMANDS,
      ...createPageSlashCommands(pages ?? []),
      ...createDatabaseSlashCommands(databases ?? [])
    ],
    [databases, pages]
  );
  // Keep the latest navigation actions + raw-mode flag accessible from
  // the CM click handler (which closes over them once at mount time).
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const rawMarkdownRef = useRef(rawMarkdown);
  rawMarkdownRef.current = rawMarkdown;
  // Resolver for link-target icons (custom PNG/JPG → lotion-file:// URL).
  // Refs so CM extensions read the latest lookup tables without remount.
  const pagesRef = useRef(pages);
  const databasesRef = useRef(databases);
  pagesRef.current = pages;
  databasesRef.current = databases;
  // Compartments let us swap extensions in/out without tearing down
  // the editor (which would lose undo history + cursor position).
  const vimCompartment = useRef(new Compartment());
  const lineNumbersCompartment = useRef(new Compartment());
  const decorationsCompartment = useRef(new Compartment());
  const embedSourceCompartment = useRef(new Compartment());

  function reportEditorViewState(view: EditorView) {
    onViewStateChangeRef.current?.(readEditorViewState(view));
  }

  function rememberEditorSelection(view: EditorView) {
    const selection = view.state.selection.main;
    if (selection.empty) {
      if (view.hasFocus) {
        delete window.__lotionEditorSelectionText;
        delete window.__lotionEditorSelectionUpdatedAt;
      }
      return;
    }
    const text = view.state.doc.sliceString(selection.from, selection.to).trim();
    if (!text) return;
    window.__lotionEditorSelectionText = text;
    window.__lotionEditorSelectionUpdatedAt = Date.now();
  }

  useImperativeHandle(ref, () => ({
    getViewState() {
      const view = viewRef.current;
      return view ? readEditorViewState(view) : initialViewStateRef.current ?? {};
    },
    focus() {
      viewRef.current?.focus();
    }
  }), []);

  useEffect(() => {
    if (!containerRef.current) return;
    const restoredSelection = normalizeRestoredSelection(initialViewStateRef.current, value.length);

    const state = EditorState.create({
      doc: value,
      selection: restoredSelection,
      extensions: [
        // Link interceptor must come first — both the vim extension
        // and CM's default mouse handling claim mousedown otherwise,
        // and our `[text](pages/...md)` navigation never gets a look.
        EditorView.domEventHandlers({
          paste(event, view) {
            const markdown = markdownFromHtmlClipboard(event.clipboardData);
            if (!markdown) return false;
            event.preventDefault();
            event.stopPropagation();
            replaceSelectionWithBlock(view, markdown);
            reportEditorViewState(view);
            return true;
          },
          dragover(event) {
            if (!hasDroppedFiles(event.dataTransfer)) return false;
            event.preventDefault();
            event.dataTransfer!.dropEffect = "copy";
            return true;
          },
          drop(event, view) {
            const files = droppedFiles(event.dataTransfer);
            if (files.length === 0) return false;
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
            event.preventDefault();
            event.stopPropagation();
            void importDroppedAttachments(view, files, pos);
            return true;
          },
          focus(_event, view) {
            reportEditorViewState(view);
            return false;
          },
          mousedown(event, view) {
            if (event.button !== 0) return false;
            if (linkTargetFromEvent(event)) {
              event.preventDefault();
              return true;
            }
            return false;
          },
          click(event, view) {
            if (event.button !== 0) return false;
            const target = linkTargetFromEvent(event);
            if (!target) return false;
            const url = linkUrlFromTarget(view, event, target);
            if (!url) return false;
            const kind = classifyLink(url);
            if (kind === "internal-md" || kind === "internal-db") {
              event.preventDefault();
              return tryNavigateWorkspaceLink(url, actionsRef.current);
            }
            if (kind === "external") {
              event.preventDefault();
              void window.lotion.shell.openLink(url);
              return true;
            }
            return false;
          }
        }),
        // vim must come early — it owns the keymap and would otherwise
        // be shadowed by defaultKeymap.
        vimCompartment.current.of(vimMode ? vim() : []),
        lineNumbersCompartment.current.of(rawMarkdown ? lineNumbers() : []),
        highlightActiveLine(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        rectangularSelection(),
        EditorState.allowMultipleSelections.of(true),
        EditorView.lineWrapping,
        // markdownLanguage = CommonMark + GFM bundle (Table, TaskList,
        // Strikethrough, Autolink). The default base is plain CommonMark,
        // which silently drops tasks / strikethrough / tables.
        markdown({ base: markdownLanguage }),
        lotionViewRegistry.of(lotionViewBridge.registry),
        embedSourceCompartment.current.of(showEmbedSourceFacet.of(showEmbedSource)),
        markdownDecorations,
        decorationsCompartment.current.of(markdownDecorationsEnabledFacet.of(!rawMarkdown)),
        linkIconResolver.of((url) => {
          // Resolve to the target page/database icon value, or undefined.
          const path = url.replace(/^\.\//, "");
          const pageId = pageIdFromWorkspacePath(path);
          if (pageId) {
            const page = pagesRef.current?.find((p) => p.id === pageId);
            return page?.icon;
          }
          const databaseId = databaseIdFromWorkspaceLink(path);
          if (databaseId) {
            const database = databasesRef.current?.find((db) => db.id === databaseId);
            return database?.icon;
          }
          // Row-page links need a database row lookup; this editor only
          // receives page/database summaries, so fall back to the page glyph.
          return undefined;
        }),
        linkTitleResolver.of((url) => {
          const path = url.replace(/^\.\//, "");
          const pageId = pageIdFromWorkspacePath(path);
          if (pageId) {
            return pagesRef.current?.find((page) => page.id === pageId)?.title;
          }
          const databaseId = databaseIdFromWorkspaceLink(path);
          if (databaseId) {
            return databasesRef.current?.find((database) => database.id === databaseId)?.name;
          }
          return undefined;
        }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const nextMarkdown = update.state.doc.toString();
            perfLog("cm.docChanged", {
              docLength: update.state.doc.length,
              lines: update.state.doc.lines,
              selection: update.state.selection.main.head
            });
            onChangeRef.current(nextMarkdown);
            lotionViewBridge.scheduleSync(nextMarkdown);
          }
          // Slash-menu detection: if the line up to the cursor matches
          // `/<filter>`, open the menu anchored at the cursor coords. The
          // filter may contain spaces so visible hints like "Markdown 表格"
          // are searchable, but pure whitespace after `/` still closes.
          if (update.docChanged || update.selectionSet) {
            const view = update.view;
            rememberEditorSelection(view);
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            const prefix = update.state.doc.sliceString(line.from, head);
            const match = /^(\s*)\/([^/]*)$/.exec(prefix);
            const query = match?.[2] ?? "";
            if (match && (query === "" || /\S/.test(query))) {
              const coords = view.coordsAtPos(head);
              if (coords) {
                slashStateRef.current?.({
                  open: true,
                  lineFrom: line.from,
                  slashPos: line.from + match[1].length,
                  endPos: head,
                  query,
                  anchor: { left: coords.left, top: coords.bottom + 4 }
                });
              }
            } else {
              slashStateRef.current?.({ open: false });
            }
            reportEditorViewState(view);
          }
        })
      ]
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    const onScroll = () => reportEditorViewState(view);
    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
    const cancelRestore = restoreEditorViewPosition(view, initialViewStateRef.current);

    return () => {
      cancelRestore();
      view.scrollDOM.removeEventListener("scroll", onScroll);
      lotionViewBridge.dispose();
      clearFloatingToc(view.dom);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || typeof navigationAnchorPos !== "number" || !Number.isFinite(navigationAnchorPos)) return;
    const anchor = clampPosition(navigationAnchorPos, view.state.doc.length);
    view.dispatch({
      selection: { anchor, head: anchor },
      effects: EditorView.scrollIntoView(anchor, { y: "start", yMargin: 24 })
    });
    scrollMarkdownAnchorIntoView(view, anchor);
    reportEditorViewState(view);
  }, [navigationAnchorKey, navigationAnchorPos]);

  // Hot-swap the vim extension when the setting flips, without remounting.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: vimCompartment.current.reconfigure(vimMode ? vim() : [])
    });
  }, [vimMode]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: embedSourceCompartment.current.reconfigure(showEmbedSourceFacet.of(showEmbedSource))
    });
  }, [showEmbedSource]);

  // Hot-swap markdown decorations: off in raw mode (pure source), on
  // otherwise (Obsidian-style cursor-aware preview).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        decorationsCompartment.current.reconfigure(markdownDecorationsEnabledFacet.of(!rawMarkdown)),
        lineNumbersCompartment.current.reconfigure(rawMarkdown ? lineNumbers() : [])
      ]
    });
  }, [rawMarkdown]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: refreshLinkMetadataEffect.of(undefined) });
  }, [databases, pages]);

  // External value updates (page switch, programmatic edits) → replace the
  // doc. Skip when the editor already reflects this value so we don't tear
  // down the undo history during ordinary typing.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    if (!/```lotion-toc\s*\n/.test(value)) clearFloatingToc(view.dom);
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: Math.min(view.state.selection.main.anchor, value.length) }
    });
  }, [value]);

  useEffect(() => {
    lotionViewBridge.sync(value);
  }, [lotionViewBridge, value]);

  return (
    <>
      <div ref={containerRef} className="codemirror-editor" data-testid="markdown-editor" aria-label="Markdown editor" />
      <div ref={lotionViewBridge.preloadHostRef} className="cm-md-lotion-view-preload" aria-hidden="true" />
      {slash.open && (
        <SlashMenu
          anchor={slash.anchor}
          query={slash.query}
          commands={slashCommands}
          onClose={() => {
            setSlash({ open: false });
            viewRef.current?.focus();
          }}
          onPick={(cmd) => {
            const view = viewRef.current;
            if (!view) return;
            if (cmd.id === "new-page" && currentPage) {
              setSlash({ open: false });
              void (async () => {
                try {
                  const page = await actions.createPage(
                    createChildPageInput(currentPage, t("common.untitled")),
                    { open: false }
                  );
                  const linkCommand = createPageSlashCommands([page.meta])[0];
                  if (!linkCommand || !viewRef.current) return;
                  const edit = applySlashCommandTemplate({
                    doc: view.state.doc.toString(),
                    lineFrom: slash.lineFrom!,
                    slashFrom: slash.slashPos!,
                    slashTo: slash.endPos!,
                    command: linkCommand
                  });
                  view.dispatch({
                    changes: { from: edit.from, to: edit.to, insert: edit.insert },
                    selection: { anchor: edit.cursor }
                  });
                  await actions.selectPage(page.meta.id);
                } catch (error) {
                  console.error("[lotion] failed to create page from slash command:", error);
                  view.focus();
                }
              })();
              return;
            }
            const edit = applySlashCommandTemplate({
              doc: view.state.doc.toString(),
              lineFrom: slash.lineFrom!,
              slashFrom: slash.slashPos!,
              slashTo: slash.endPos!,
              command: cmd
            });
            view.dispatch({
              changes: { from: edit.from, to: edit.to, insert: edit.insert },
              selection: { anchor: edit.cursor }
            });
            setSlash({ open: false });
            view.focus();
          }}
        />
      )}
    </>
  );
});

type SlashState =
  | { open: false }
  | {
      open: true;
      lineFrom: number;
      slashPos: number;
      endPos: number;
      query: string;
      anchor: { left: number; top: number };
    };

// ── helpers ──────────────────────────────────────────────────────────

function markdownUrlAt(state: EditorState, pos: number): string | null {
  for (const side of [-1, 1] as const) {
    const url = markdownUrlAtSide(state, pos, side);
    if (url) return url;
  }
  return bareUrlAt(state.doc, pos);
}

function linkTargetFromEvent(event: MouseEvent): HTMLElement | null {
  const target = event.target instanceof Element ? event.target : null;
  return target?.closest<HTMLElement>(".cm-md-link, .cm-md-url, .cm-md-link-icon, [data-md-url]") ?? null;
}

function linkUrlFromTarget(view: EditorView, event: MouseEvent, linkEl: HTMLElement): string | null {
  const urlEl = linkEl.closest<HTMLElement>("[data-md-url]") ?? linkEl;
  const directUrl = urlEl.dataset.mdUrl;
  if (directUrl) return directUrl;
  try {
    return markdownUrlAt(view.state, view.posAtDOM(linkEl));
  } catch {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    return pos === null ? null : markdownUrlAt(view.state, pos);
  }
}

function markdownUrlAtSide(state: EditorState, pos: number, side: -1 | 1): string | null {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, side);
  while (true) {
    if (node.name === "URL" && node.parent?.name !== "Link") {
      return state.doc.sliceString(node.from, node.to).trim() || null;
    }
    if (node.name === "Link") {
      const urlNode = markdownLinkDestinationUrlNode(node);
      return urlNode ? state.doc.sliceString(urlNode.from, urlNode.to).trim() || null : null;
    }
    if (!node.parent) break;
    node = node.parent;
  }
  return null;
}

function markdownLinkDestinationUrlNode(
  linkNode: { getChildren(name: string): Array<{ from: number; to: number }> }
): { from: number; to: number } | null {
  const urls = linkNode.getChildren("URL");
  return urls.length > 0 ? urls[urls.length - 1] : null;
}

function hasDroppedFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  if (dataTransfer.files?.length > 0) return true;
  return Array.from(dataTransfer.types ?? []).includes("Files");
}

function droppedFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer?.files?.length) return [];
  return Array.from(dataTransfer.files).filter((file) => !!file.name);
}

async function importDroppedAttachments(view: EditorView, files: File[], pos: number): Promise<void> {
  try {
    const attachments = await (window.__lotionTestImportDroppedFiles ?? window.lotion.attachments.importDroppedFiles)(files);
    if (attachments.length === 0) return;
    const markdown = attachments.map((attachment) => {
      const label = markdownLabel(attachment.originalName);
      return attachment.isImage
        ? `![${label}](${attachment.path})`
        : `[${label}](${attachment.path})`;
    }).join("\n");
    const insertPos = Math.max(0, Math.min(pos, view.state.doc.length));
    const insert = blockInsertion(view.state.doc.toString(), insertPos, markdown);
    view.dispatch({
      changes: { from: insertPos, insert },
      selection: { anchor: insertPos + insert.length },
      scrollIntoView: true
    });
    view.focus();
  } catch (error) {
    console.error("[lotion] failed to import dropped attachment:", error);
  }
}

function markdownLabel(value: string): string {
  return (value || "attachment").replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function blockInsertion(doc: string, pos: number, body: string): string {
  const before = pos > 0 ? doc[pos - 1] : "";
  const after = pos < doc.length ? doc[pos] : "";
  const prefix = before && before !== "\n" ? "\n" : "";
  const suffix = after && after !== "\n" ? "\n" : "";
  return `${prefix}${body}\n${suffix}`;
}

function replaceSelectionWithBlock(view: EditorView, markdown: string): void {
  const selection = view.state.selection.main;
  const doc = view.state.doc.toString();
  const before = selection.from > 0 ? doc[selection.from - 1] : "";
  const after = selection.to < doc.length ? doc[selection.to] : "";
  const prefix = before && before !== "\n" ? "\n" : "";
  const suffix = after && after !== "\n" ? "\n" : "";
  const insert = `${prefix}${markdown.trimEnd()}\n${suffix}`;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: { anchor: selection.from + insert.length },
    scrollIntoView: true
  });
  view.focus();
}

function markdownFromHtmlClipboard(dataTransfer: DataTransfer | null): string | null {
  const html = dataTransfer?.getData("text/html")?.trim();
  if (!html || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const markdown = blockNodesToMarkdown(Array.from(doc.body.childNodes), 0);
  const normalized = collapseMarkdownWhitespace(markdown);
  return normalized.trim() ? normalized : null;
}

function blockNodesToMarkdown(nodes: Node[], depth: number): string {
  return nodes
    .map((node) => blockNodeToMarkdown(node, depth).trimEnd())
    .filter(Boolean)
    .join("\n\n");
}

function blockNodeToMarkdown(node: Node, depth: number): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return markdownInlineText(node.textContent ?? "").trim();
  }
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    return `${"#".repeat(level)} ${inlineMarkdownForBlockElement(node)}`;
  }
  if (tag === "p") return inlineMarkdownForBlockElement(node);
  if (tag === "br") return "\n";
  if (tag === "hr") return "---";
  if (tag === "img") return inlineNodeToMarkdown(node).trim();
  if (tag === "details") return detailsToToggleMarkdown(node);
  if (tag === "dl") return descriptionListToMarkdown(node);
  if (tag === "dt" || tag === "dd") return descriptionListChildToMarkdown(node);
  if (tag === "figure" && notionCalloutFigure(node)) return calloutFigureToMarkdown(node);
  if (tag === "figure") return blockNodesToMarkdown(Array.from(node.childNodes), depth);
  if (tag === "figcaption") return inlineMarkdownForBlockElement(node);
  if (tag === "ul" || tag === "ol") return listToMarkdown(node, tag === "ol", depth);
  if (tag === "li") return listItemToMarkdown(node, false, 1, depth);
  if (tag === "blockquote") {
    const body = blockNodesToMarkdown(Array.from(node.childNodes), depth).trim();
    return body.split("\n").map((line) => line ? `> ${line}` : ">").join("\n");
  }
  if (tag === "pre") return fencedCodeBlock(preTextContent(node), codeLanguageFromPre(node));
  if (tag === "table") return tableToMarkdown(node);
  if (hasBlockChildren(node)) return blockNodesToMarkdown(Array.from(node.childNodes), depth);
  return inlineMarkdownForBlockElement(node);
}

function inlineChildrenToMarkdown(element: Element): string {
  return Array.from(element.childNodes).map((node) => inlineNodeToMarkdown(node)).join("").replace(/[ \t]+\n/g, "\n");
}

function inlineNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return markdownInlineText(node.textContent ?? "");
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return wrapInline("**", inlineChildrenToMarkdown(node));
  if (tag === "em" || tag === "i") return wrapInline("*", inlineChildrenToMarkdown(node));
  if (tag === "s" || tag === "strike" || tag === "del") return wrapInline("~~", inlineChildrenToMarkdown(node));
  if (tag === "code") return inlineCode(node.textContent ?? "");
  if (tag === "kbd") return inlineCode(node.textContent ?? "");
  if (tag === "u" || tag === "ins") return wrapInlineHtml("u", inlineChildrenToMarkdown(node));
  if (tag === "sup" || tag === "sub") return wrapInlineHtml(tag, inlineChildrenToMarkdown(node));
  if (notionInlineColorElement(node)) return wrapNotionColorMarkdown(node, inlineChildrenToMarkdown(node));
  if (tag === "mark" || highlightedInlineElement(node)) return wrapInlineHtml("mark", inlineChildrenToMarkdown(node));
  if (tag === "a") {
    const href = normalizeClipboardUrlForMarkdown(node.getAttribute("href")?.trim());
    const label = inlineChildrenToMarkdown(node).trim() || href || "";
    return href ? `[${escapeMarkdownLabel(label)}](${escapeMarkdownUrl(href)})` : label;
  }
  if (tag === "img") {
    const src = normalizeClipboardUrlForMarkdown(node.getAttribute("src")?.trim());
    if (!src) return "";
    const alt = node.getAttribute("alt")?.trim() || "image";
    return `![${escapeMarkdownLabel(alt)}](${escapeMarkdownUrl(src)})`;
  }
  if (hasBlockChildren(node)) return blockNodesToMarkdown(Array.from(node.childNodes), 0);
  return inlineChildrenToMarkdown(node);
}

function listToMarkdown(list: HTMLElement, ordered: boolean, depth: number): string {
  const items = Array.from(list.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName.toLowerCase() === "li");
  let index = ordered ? orderedListStart(list) : 1;
  return items.map((item) => {
    const itemIndex = ordered ? orderedListItemValue(item) ?? index : index;
    index = itemIndex + 1;
    return listItemToMarkdown(item, ordered, itemIndex, depth);
  }).join("\n");
}

function listItemToMarkdown(item: HTMLElement, ordered: boolean, index: number, depth: number): string {
  const nested: string[] = [];
  const inlineParts: string[] = [];
  const taskCheckbox = taskCheckboxForListItem(item);
  for (const child of Array.from(item.childNodes)) {
    if (child instanceof HTMLElement && (child.tagName.toLowerCase() === "ul" || child.tagName.toLowerCase() === "ol")) {
      nested.push(listToMarkdown(child, child.tagName.toLowerCase() === "ol", depth + 1));
    } else if (child instanceof HTMLElement && hasBlockChildren(child)) {
      inlineParts.push(blockNodeToMarkdown(child, depth).replace(/\n+/g, " ").trim());
    } else {
      inlineParts.push(inlineNodeToMarkdown(child));
    }
  }
  const marker = ordered ? `${index}. ` : taskCheckbox ? (taskCheckbox.checked ? "- [x] " : "- [ ] ") : "- ";
  const itemBody = inlineParts.join("").trim();
  const line = `${"  ".repeat(depth)}${marker}${itemBody ? wrapNotionColorMarkdown(item, itemBody) : " "}`;
  return [line, ...nested].filter(Boolean).join("\n");
}

function orderedListStart(list: HTMLElement): number {
  const raw = list.getAttribute("start")?.trim();
  const value = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function orderedListItemValue(item: HTMLElement): number | null {
  const raw = item.getAttribute("value")?.trim();
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function detailsToToggleMarkdown(details: HTMLElement): string {
  const summary = Array.from(details.children).find((child): child is HTMLElement =>
    child instanceof HTMLElement && child.tagName.toLowerCase() === "summary"
  ) ?? null;
  const summaryText = (summary?.textContent ?? "").replace(/\s+/g, " ").trim() || "Toggle";
  const bodyNodes = Array.from(details.childNodes).filter((node) => node !== summary);
  const body = blockNodesToMarkdown(bodyNodes, 0).trim();
  return [
    "```lotion-toggle",
    `summary: ${summaryText}`,
    `open: ${details.hasAttribute("open") ? "true" : "false"}`,
    "---",
    body,
    "```"
  ].join("\n");
}

function descriptionListToMarkdown(list: HTMLElement): string {
  const lines: string[] = [];
  let terms: string[] = [];
  for (const child of Array.from(list.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const tag = child.tagName.toLowerCase();
    if (tag === "dt") {
      const term = descriptionListChildToMarkdown(child).replace(/\n+/g, " ").trim();
      if (term) terms.push(term);
      continue;
    }
    if (tag !== "dd") continue;
    const description = descriptionListChildToMarkdown(child).trim();
    const label = terms.length > 0 ? terms.join(", ") : "Definition";
    const body = description.replace(/\n+/g, "\n  ");
    lines.push(body ? `- **${label}**: ${body}` : `- **${label}**`);
    terms = [];
  }
  for (const term of terms) lines.push(`- **${term}**`);
  return lines.join("\n");
}

function descriptionListChildToMarkdown(child: HTMLElement): string {
  return hasBlockChildren(child)
    ? blockNodesToMarkdown(Array.from(child.childNodes), 0)
    : inlineChildrenToMarkdown(child).trim();
}

function notionCalloutFigure(node: HTMLElement): boolean {
  return Array.from(node.classList).some((className) => className.toLowerCase() === "callout");
}

function calloutFigureToMarkdown(figure: HTMLElement): string {
  const icon = figure.querySelector(".icon")?.textContent?.trim() || "💡";
  const color = notionInlineColorElement(figure);
  const background = color?.kind === "bg" ? color.color : "";
  const bodyNodes = Array.from(figure.childNodes).filter((child) => {
    if (!(child instanceof HTMLElement)) return true;
    return !child.querySelector(".icon");
  });
  const body = blockNodesToMarkdown(bodyNodes, 0).trim();
  return fencedCalloutMarkdown(icon, body, background);
}

function fencedCalloutMarkdown(icon: string, body: string, background = ""): string {
  const lines = [
    "```lotion-callout",
    `icon: ${icon.trim() || "💡"}`
  ];
  if (background) lines.push(`background: ${background}`);
  lines.push("---", body.trim(), "```");
  return lines.join("\n");
}

function taskCheckboxForListItem(item: HTMLElement): HTMLInputElement | null {
  const checkboxes = Array.from(item.querySelectorAll("input[type='checkbox']"));
  return checkboxes.find((input): input is HTMLInputElement =>
    input instanceof HTMLInputElement && input.closest("li") === item
  ) ?? null;
}

function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  const cells = rows.map((row) => Array.from(row.querySelectorAll("th,td")).map((cell) => inlineChildrenToMarkdown(cell).trim()));
  if (cells.length === 0 || cells[0].length === 0) return "";
  const width = Math.max(...cells.map((row) => row.length));
  const normalizeRow = (row: string[]) => Array.from({ length: width }, (_, index) => escapeTableCell(row[index] ?? ""));
  const header = normalizeRow(cells[0]);
  const body = cells.slice(1).map(normalizeRow);
  return [
    `| ${header.join(" | ")} |`,
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function hasBlockChildren(element: Element): boolean {
  return Array.from(element.children).some((child) => BLOCK_HTML_TAGS.has(child.tagName.toLowerCase()));
}

function normalizeClipboardUrlForMarkdown(value: string | undefined): string | undefined {
  if (!value) return value;
  const origin = window.location.origin;
  const originPrefix = `${origin}/`;
  if (origin && value.startsWith(originPrefix)) return value.slice(originPrefix.length);
  return value;
}

const BLOCK_HTML_TAGS = new Set([
  "article",
  "blockquote",
  "div",
  "details",
  "dd",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul"
]);

function markdownInlineText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function wrapInline(marker: string, value: string): string {
  const trimmed = value.trim();
  return trimmed ? `${marker}${trimmed}${marker}` : "";
}

function wrapInlineHtml(tag: "mark" | "u" | "sup" | "sub", value: string): string {
  const trimmed = value.trim();
  return trimmed ? `<${tag}>${trimmed}</${tag}>` : "";
}

function inlineMarkdownForBlockElement(element: HTMLElement): string {
  return wrapNotionColorMarkdown(element, inlineChildrenToMarkdown(element));
}

const NOTION_COLOR_CLASS_PATTERN = /^block-color-(gray|brown|orange|yellow|green|blue|purple|pink|red)(?:_background)?$/i;
const NOTION_HIGHLIGHT_CLASS_PATTERN = /^highlight-(gray|brown|orange|yellow|green|blue|purple|pink|red)$/i;

function wrapInlineColorSpan(kind: "color" | "bg", color: string, value: string): string {
  const trimmed = value.trim();
  return trimmed ? `<span data-lotion-${kind}="${color}">${trimmed}</span>` : "";
}

function wrapNotionColorMarkdown(element: HTMLElement, value: string): string {
  const notionColor = notionInlineColorElement(element);
  const trimmed = value.trim();
  if (!trimmed) return "";
  return notionColor ? wrapInlineColorSpan(notionColor.kind, notionColor.color, trimmed) : trimmed;
}

function notionInlineColorElement(element: HTMLElement): { kind: "color" | "bg"; color: string } | null {
  for (const className of Array.from(element.classList)) {
    const notionColor = NOTION_COLOR_CLASS_PATTERN.exec(className);
    if (notionColor) {
      return {
        kind: className.toLowerCase().endsWith("_background") ? "bg" : "color",
        color: notionColor[1].toLowerCase()
      };
    }
    const notionHighlight = NOTION_HIGHLIGHT_CLASS_PATTERN.exec(className);
    if (notionHighlight) {
      return { kind: "bg", color: notionHighlight[1].toLowerCase() };
    }
  }
  return null;
}

function highlightedInlineElement(element: HTMLElement): boolean {
  if (element.tagName.toLowerCase() !== "span") return false;
  const style = element.getAttribute("style") ?? "";
  return /background(?:-color)?\s*:/i.test(style);
}

function inlineCode(value: string): string {
  const fence = value.includes("`") ? "``" : "`";
  return `${fence}${value.replace(/\s+/g, " ").trim()}${fence}`;
}

function codeLanguageFromPre(pre: HTMLElement): string {
  const code = pre.querySelector("code");
  const raw = code?.getAttribute("data-language")?.trim()
    || pre.getAttribute("data-language")?.trim()
    || Array.from(code?.classList ?? [])
      .find((className) => className.startsWith("language-") || className.startsWith("lang-"))
      ?.replace(/^lang(?:uage)?-/, "")
    || "";
  return /^[A-Za-z0-9_+#.-]+$/.test(raw) ? raw : "";
}

function preTextContent(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.tagName.toLowerCase() === "br") return "\n";
  return Array.from(node.childNodes).map((child) => preTextContent(child)).join("");
}

function fencedCodeBlock(value: string, language = ""): string {
  const body = value.replace(/\n+$/g, "");
  return `\`\`\`${language}\n${body}\n\`\`\``;
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function escapeMarkdownUrl(value: string): string {
  return value.replace(/\)/g, "%29");
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, "<br>");
}

function collapseMarkdownWhitespace(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readEditorViewState(view: EditorView): MarkdownEditorViewState {
  const selection = view.state.selection.main;
  return {
    selectionAnchor: selection.anchor,
    selectionHead: selection.head,
    markdownAnchorPos: readTopMarkdownAnchor(view),
    hadFocus: view.hasFocus
  };
}

function normalizeRestoredSelection(
  snapshot: MarkdownEditorViewState | undefined,
  docLength: number
): { anchor: number; head?: number } | undefined {
  const rawAnchor = snapshot?.selectionAnchor ?? snapshot?.selectionHead;
  if (typeof rawAnchor !== "number" || !Number.isFinite(rawAnchor)) return undefined;
  const anchor = clampPosition(rawAnchor, docLength);
  const rawHead = snapshot?.selectionHead;
  const head = typeof rawHead === "number" && Number.isFinite(rawHead)
    ? clampPosition(rawHead, docLength)
    : anchor;
  return { anchor, head };
}

function restoreEditorViewPosition(view: EditorView, snapshot: MarkdownEditorViewState | undefined): () => void {
  if (!snapshot) return () => undefined;
  const rawAnchor = snapshot.markdownAnchorPos ?? snapshot.selectionHead ?? snapshot.selectionAnchor;
  const markdownAnchor = typeof rawAnchor === "number" && Number.isFinite(rawAnchor)
    ? clampPosition(rawAnchor, view.state.doc.length)
    : null;
  let canceled = false;
  const correctionFrames = new Set<number>();

  const restore = () => {
    if (canceled) return;
    if (markdownAnchor === null) return;
    view.dispatch({
      effects: EditorView.scrollIntoView(markdownAnchor, { y: "start", yMargin: 24 })
    });
    const frame = requestAnimationFrame(() => {
      correctionFrames.delete(frame);
      if (!canceled) scrollMarkdownAnchorIntoView(view, markdownAnchor);
    });
    correctionFrames.add(frame);
  };

  const cancelForUserIntent = () => {
    canceled = true;
  };
  view.dom.addEventListener("wheel", cancelForUserIntent, { passive: true });
  view.dom.addEventListener("touchstart", cancelForUserIntent, { passive: true });
  view.dom.addEventListener("mousedown", cancelForUserIntent);
  window.addEventListener("keydown", cancelForUserIntent);

  const animationFrame = requestAnimationFrame(restore);
  const focusAnimationFrame = snapshot.hadFocus
    ? requestAnimationFrame(() => {
      if (!canceled) view.focus();
    })
    : null;
  const timers = [80, 250, 700, 1400, 2600, 4200].map((delay) => window.setTimeout(restore, delay));
  return () => {
    canceled = true;
    cancelAnimationFrame(animationFrame);
    if (focusAnimationFrame !== null) cancelAnimationFrame(focusAnimationFrame);
    for (const frame of correctionFrames) cancelAnimationFrame(frame);
    correctionFrames.clear();
    for (const timer of timers) window.clearTimeout(timer);
    view.dom.removeEventListener("wheel", cancelForUserIntent);
    view.dom.removeEventListener("touchstart", cancelForUserIntent);
    view.dom.removeEventListener("mousedown", cancelForUserIntent);
    window.removeEventListener("keydown", cancelForUserIntent);
  };
}

function readTopMarkdownAnchor(view: EditorView): number {
  const host = editorViewportHost(view);
  const hostRect = host.getBoundingClientRect();
  const contentRect = view.contentDOM.getBoundingClientRect();
  const fallback = view.state.selection.main.head;
  const x = clampNumber(contentRect.left + 12, hostRect.left + 12, hostRect.right - 12);
  const yCandidates = [
    hostRect.top + 12,
    hostRect.top + Math.min(160, Math.max(24, hostRect.height * 0.25)),
    hostRect.top + Math.min(320, Math.max(48, hostRect.height * 0.5))
  ];

  for (const y of yCandidates) {
    const pos = view.posAtCoords({ x, y }, false);
    if (typeof pos === "number" && Number.isFinite(pos)) {
      return clampPosition(pos, view.state.doc.length);
    }
  }
  return fallback;
}

function scrollMarkdownAnchorIntoView(view: EditorView, pos: number): void {
  const anchor = clampPosition(pos, view.state.doc.length);
  const host = editorViewportHost(view);
  const hostRect = host.getBoundingClientRect();
  const coords = view.coordsAtPos(anchor);
  if (!coords) {
    view.dispatch({ effects: EditorView.scrollIntoView(anchor, { y: "start", yMargin: 24 }) });
    return;
  }
  host.scrollTop += coords.top - hostRect.top - 24;
}

function editorViewportHost(view: EditorView): HTMLElement {
  const rowSurface = view.dom.closest(".row-page-surface");
  return rowSurface instanceof HTMLElement ? rowSurface : view.scrollDOM;
}

function clampPosition(position: number, docLength: number): number {
  return Math.max(0, Math.min(position, docLength));
}

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) return value;
  return Math.max(min, Math.min(value, max));
}
