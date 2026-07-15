# Notion Core Parity Sequence

Status: todo

Decision state: accepted, execute one item at a time

## Why

Lotion should close the highest-impact Notion gaps in a controlled order. Each
step must improve a daily workflow, keep the codebase testable, and add latency
coverage when it touches page rendering, database rendering, search, import, or
editing.

## Execution Order

Operational queue: `tasks/QUEUE.md`. Use that file as the source of truth when
working continuously; this document explains the product rationale.

1. Page embedded view picker and settings.
   - Source task: `tasks/todo/page-embedded-view-picker-and-settings.md`.
   - Add picker UI, embedded view header, Open/Refresh/Settings actions, and
     saved-view settings reuse.
   - Must keep embedded table and plugin-backed Kanban views editable.

2. Frontend architecture boundaries.
   - Source task: `tasks/todo/frontend-architecture-boundaries.md`.
   - Give page layout one owner, split `DatabaseTable`, and isolate the
     CodeMirror-to-React bridge.
   - This should happen before more layout-heavy Notion parity work.

3. Slash menu and insert blocks.
   - Add `/` insertion for headings, todo, divider, callout, table, code block,
     page link, and database view.
   - Keep markdown storage transparent and Git-friendly.

4. CodeMirror live preview writing surface.
   - Make normal writing feel closer to Notion while retaining Markdown as the
     storage format.
   - Cover links, checkboxes, headings, images, callouts, and embeds.

5. Page hierarchy and sidebar tree.
   - Parent/child metadata, real sidebar tree, breadcrumbs, child page creation,
     and drag-to-nest.
   - Preserve imported Notion hierarchy without letting title slashes become
     path segments.

6. Database view management and row-page polish.
   - View duplicate, rename, delete, default view, better field settings,
     row-page property panel polish, templates, and clearer row body boundaries.

7. Relation, rollup, and richer views.
   - Treat relation/rollup as a separate milestone because it changes the data
     model and query model more deeply than table rendering.
   - Timeline/list/gallery/calendar polish belongs here unless a smaller bug
     requires earlier work.

8. LLM-first workflows.
   - Ask current page/database, selected-text actions, AI fields, previewable
     diffs, and reversible workspace writes.

9. Git/local-first product surface.
   - Git sync plugin, backup status, history, restore, push/pull, and conflict
     handling.

## Latency Gates

- Every step that changes database loading, view queries, embedded views,
  search, page open, or editor decorations must either use an existing latency
  gate or add a focused one.
- `npm run test:latency` is the fast gate and should remain safe for the normal
  regression lane.
- `npm run benchmark:latency` is the manual detailed view-query benchmark.
- Focused latency coverage now includes page open, embedded database first
  render, editor scroll/edit, cell-edit commit, search service/search popup,
  rollup computation, and CSV read latency.
- Future UI-heavy work should add a new Electron/browser benchmark only when it
  touches a performance-sensitive surface that is not already covered.

## Current Next Step

The operational queue has completed items 1-237. In addition to the first-pass
Notion parity work (embedded views, hierarchy, slash/live-preview editing,
database view management, relation/rollup foundations, templates, gallery,
calendar, list views, LLM workflows, Git sync, and plugin surfaces), the queue
now has broad focused coverage for navigation/search/UI smoke flows and latency
hot paths. Entity backlinks have a public workspace API plus a page panel with
click-through navigation, source context, excerpts, backlink counts, source
path/type disambiguation, property field context, readable property excerpts,
property-row click-through, and duplicate source collapse. Import hardening now
also covers source HTML/CSV links, path mismatch and duplicate database audits,
system-only row skips, Markdown-export page icons/database links, page covers,
person fields, option colors, underline/strikethrough/link preview regressions,
Indify/media previews, toggle/callout/equation live previews, and Notion color
fidelity for highlights plus inline/paragraph/heading/quote/list/todo
`block-color-*` classes, nested colored list items, and callout backgrounds.
File access has been routed through the file service with an in-memory cache,
and package/plugin coverage gates are enforced before commit.

Do not restart from this document's original ordering. Continue by splitting a
small, ready task from one of the remaining discussion areas, then append it to
`tasks/QUEUE.md` and execute it through the same focused gate cycle.

Good next candidates only after product direction is clear:

- Richer command palette workflows beyond basic plugin command execution.
- Tag pages and richer backlink workflows.
- More polished gallery/calendar view controls.
- Plugin permissions and external plugin loading.
- Git history/restore/conflict workflows.
