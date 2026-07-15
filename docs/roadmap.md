# Lotion Roadmap

Forward-looking work, beyond the MVP. Items are grouped by area, not by
priority — most are written up enough that whoever picks one up can start.

## Performance — large database loads

Pre-fast-path baseline (Electron 37 / Node 20 / 500K-row fixture, measured
2026-05-17 before the main-process no-quote CSV parser fast path landed):

```
db_rows_500k · 500,000 rows · 175 MB CSV
├─ main: file read          351 ms
├─ main: CSV parse        2,384 ms      ← old char-by-char tokenizer
├─ main: build records      871 ms      ← 500K × 16-field object allocations
├─ main: schema + views       8 ms
├─ IPC structured clone   ~4,125 ms     ← contextBridge deep-clones whole bundle
└─ Renderer pipeline + paint ~100 ms    ← virtualization keeps DOM tiny
Total time to open                ≈ 7.7 s
```

Sort, filter, formula compute, and DOM render were already no longer hot in
that baseline — they
collectively take <100 ms on 500K. The remaining cost is **moving the
whole bundle from main to renderer on every database open**. The CSV fast path
reduces one cold-load stage for unquoted files, but it does not change the
architectural IPC ceiling.

Three tracks to investigate, in order of expected impact:

### 1. Lazy / windowed IPC (biggest win, architectural)

Right now `databases.get(id)` ships every row. With virtualization the
renderer only ever needs the ~30 rows in its viewport, plus any rows
involved in the active sort/filter.

Sketch:

- On database open, IPC returns only `schema`, `views`, and `recordCount`.
- New IPC: `databases.getRows(id, { sort, filters, start, count })` runs
  the existing filter + sort + slice pipeline in the main process and
  returns just the requested window.
- Renderer keeps a sparse cache of windows and asks for adjacent windows
  during scroll.
- Filter/sort changes invalidate the cache and re-query.

Expected: initial load ~7.7 s → <100 ms. Per-scroll IPC ~5 ms.

Trade-offs:

- Filter/sort move from renderer to main, so `view-query.ts` largely
  moves under `src/main/services/`. Renderer becomes a thin view of
  whatever rows main has cached.
- Cell edits round-trip through main as before, but the renderer no
  longer holds every row — the source of truth shifts cleanly to main.
- Need a strategy for the row count under filters (count is exact but
  has to be computed, so cache it).

### 2. Faster CSV ingest (tactical, no architectural change)

Status: the main-process CSV reader now ships the no-quote fast path. It
pre-scans for `"` and uses a line-then-comma split for unquoted files, with the
existing char-by-char tokenizer kept as the quoted fallback.

Remaining optional work:

- Read quoted CSV files as a `Buffer` and iterate bytes instead of a UTF-16
  string for the slow path.
- Add a larger ingest benchmark once the lazy/windowed IPC design starts,
  because parse time only matters after the first cold read.

Expected: ~2.4 s parse → ~0.4-0.8 s on the unquoted fast path.

This pairs with (1): even a windowed IPC has to parse the CSV once on
first open, so a faster parser still matters for cold start.

### 3. Positional IPC encoding (incremental, helps until (1) lands)

Today each row crosses IPC as `{ field1: v1, field2: v2, … }` — every
field's *key* is also cloned 500K times. Sending rows as flat tuples
and rehydrating to objects in the renderer would roughly halve the
clone cost.

Sketch:

- Main returns `{ schema, views, headers, rows: RecordValue[][] }`.
- Renderer hydrates `rows.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])))` — or skips hydration entirely if the table can read positional rows directly.

Expected: ~4.1 s IPC clone → ~1.5-2 s.

This becomes redundant once (1) is in (windows are small enough that
encoding shape doesn't matter), so treat it as a stopgap.

## Shared database-bundle store — shipped

The minimal shared store has landed in
`src/renderer/context/database-cache.tsx`. The standalone database
view, row-page properties, and embedded Markdown views now read from
one renderer-side `Map<databaseId, DatabaseBundle>`. Mutating IPC calls
go through the cache wrapper and write the returned bundle back into
that shared map, so every open surface showing the same database
re-renders from the same source.

What this fixed:

- Editing a cell from an embedded view updates the full database view
  without requiring a tab switch.
- Multiple embedded views that point at the same database stay in sync.
- Row pages derive schema + record data from the cached bundle instead
  of carrying a stale snapshot.
- Concurrent loads for the same database are deduped through one
  in-flight promise.

This does not solve the large-dataset IPC ceiling. The renderer still
holds full `DatabaseBundle` objects, which means opening a 500K-row
CSV still pays the parse + clone cost described above.

### Follow-up — lazy / windowed IPC

This is the same architectural shift listed under "Performance —
large database loads". Once a windowed IPC layer exists, the shared
store should become a sparse cache of "windows the renderer has asked
for" rather than full bundles, and main-process push notifications can
invalidate windows when underlying data changes. That naturally solves
both the consistency problem and the large-dataset memory / latency
problem at once.

## Markdown editor — replace the textarea with a real editing surface

Today the page body editor is a plain `<textarea>` showing raw Markdown,
with a parallel preview pane via Edit / Split / Preview toggle. It
works, but it's the most obvious "this is an MVP" feel in the app —
there's no inline rendering, no syntax highlighting, no inline image
preview, no autocomplete, no find/replace, no embedded-view rendering
inside the editor itself.

This is well-trodden territory. The library landscape:

| Library | Storage model | Fit for Lotion |
|---|---|---|
| **CodeMirror 6** | Plain text; editor decorates Markdown inline | ✅ Files stay as `.md`. What Obsidian uses. |
| **TipTap** (ProseMirror) | Internal JSON/HTML, serialize to Markdown on save | ⚠️ Round-trip can drop formatting. WYSIWYG. |
| **Lexical** (Meta) | Internal state, Markdown plugin | ⚠️ Same round-trip caveat. |
| **Milkdown** (ProseMirror) | Markdown-native | ✅ Smaller ecosystem than CodeMirror. |
| **BlockNote** | Block-first, JSON | ❌ Block-first, not Markdown-first. |

### Recommendation — CodeMirror 6 with `@codemirror/lang-markdown`

For Lotion specifically:

- **Files stay plain `.md` on disk.** No serializer means no
  round-trip loss; the file is exactly what the user typed.
- **Embedded views compose cleanly.** A ` ```lotion-view ` fenced code
  block can get its own CodeMirror decoration that mounts the existing
  `<DatabaseTable>` inline — the editor surface and the preview pane
  collapse into one.
- **It scales.** CodeMirror handles 100K-line documents fine; the
  current textarea is already slow on long pages.
- **Obsidian is a working reference implementation.** Live Preview is
  CodeMirror 6 + decorators; everything they do inline-editing-wise
  is feasible by reading their source / community plugins.

### Suggested milestone breakdown

1. **Day 0.5 — drop-in replacement.** Swap the textarea for a
   `EditorView` mounted to a div, wire two-way sync with React state,
   register the `markdown()` extension for syntax highlighting. Already
   a real editor: monospace, syntax-aware indent, Cmd+F find, native
   undo stack. Cost: half a day, mostly plumbing.

2. **Days 1-3 — Obsidian-style Live Preview decorators.** Headings
   render with larger font; `**bold**` and `*italic*` show their effect
   while the markers stay in the buffer, auto-hiding when the cursor
   leaves the line; checkboxes toggle on click; links render as styled
   spans. This is where the editor stops feeling like Markdown and
   starts feeling like a document. ~80% of the perceived Obsidian gap
   closes here.

3. **Days 3-7 — polish.** Inline image previews. Embedded `lotion-view`
   block decoration that renders the actual table inside the editor
   (replaces the Split-view affordance). Theme tuned to match the rest
   of the app. Optional Vim / Emacs keymaps via existing extension
   packages. Cmd+P quick-open. Cmd+K command palette.

### Out of scope for this track

- Block-based editing à la Notion. That's a different mental model and
  would force a Markdown serializer.
- Collaborative editing (Yjs / CRDT). Worth considering if multi-device
  sync ever lands, but standalone work.
- Mobile / touch input edge cases. Lotion is desktop Electron for now.

### Out-of-band parallels worth doing alongside

- Wikilink support (`[[Page Name]]` autocomplete + click-to-navigate +
  backlinks panel). Reuses the page/database search index. Small
  feature, big perceived value. Independent of the editor choice but
  trivial to add once CodeMirror is in.
- Tag support (`#tag` autocomplete + per-tag pages). Same shape as
  wikilinks.

## Workspace storage — Git's ceiling on binary content

Lotion's user-requirements.md commits to "Git-native" backup and sync.
That works beautifully for everything text-shaped — pages, schemas,
views, formulas, even big CSVs up to the per-file limit. It works
poorly for binary attachments. Images, scanned PDFs, audio notes, and
short video clips compound fast; a serious user's workspace can
realistically reach **tens of GB** within a year. Git handles that
volume badly, and GitHub specifically caps it:

- 100 MB hard limit per file.
- ~1 GB recommended / 5 GB soft cap per repo.
- 2 GB hard cap per push.
- Repo size is current files **plus all history** — deleting a large
  file in a new commit does not shrink the repo until history is
  rewritten.

So the moment we ship image upload (or any kind of attachment), naïve
"commit it as a blob next to the Markdown" will quietly break Git
backup for the first user who pastes a 4K screenshot, and will hit the
GitHub repo cap for the first user with a few hundred screenshots.

This is worth designing *before* attachment support lands, not after.

### Options

1. **Git LFS for binary attachments.** Standard answer for the
   GitHub-hosted case. Pointer files live in Git, content lives in an
   LFS object store. Trade-offs: users need `git-lfs` installed; LFS
   has its own storage + bandwidth quotas (1 GB free, paid above);
   the LFS server must outlive the workspace for old versions of
   deleted attachments to remain restorable. Setup is a one-time
   `git lfs track "attachments/**"` plus an LFS-aware remote.

2. **Self-hosted Git remote** (Gitea, Forgejo, GitLab CE). No
   artificial size limits beyond the user's disk. Best fit for power
   users, but Lotion can only guide setup — not run the server.

3. **Content-addressable blob store with Git references.** Pages and
   databases stay in Git (small, plain text, perfect for diff + merge).
   Attachments go to a side store keyed by SHA — could be local-only,
   S3, IPFS, or a separate Git LFS-style server. The Markdown
   references a stable path; the file itself lives elsewhere. This
   mirrors how Obsidian, Logseq, and static-site generators handle
   media under the hood. Cleanest separation of "small things Git is
   great at" vs "big things Git is mediocre at."

4. **Non-Git sync for large files.** Use Git for text + metadata,
   something else (rsync, Syncthing, S3) for binaries. Splits the
   "one backup story" the user-requirements.md promised, but unblocks
   media without entangling Git.

### Suggested direction

Treat the workspace as **two stores under one logical workspace**:

- A Git-backed *metadata store* covering pages, schemas, views, and
  small data files. This is what Lotion's "Git-native" promise really
  governs — diffability, branching, conflict resolution, plain-text
  inspection.
- A pluggable *attachment store* covering anything binary, addressed
  by content hash, with at least two backends shipped by default:
  - **Local-only** (the file lives in `workspace/attachments/` and is
    intentionally not synced).
  - **Git LFS** (transparent to the user, with a one-screen setup
    flow that runs `git lfs install`).

Lotion's Markdown stays pure text — attachments are referenced by
content-addressed paths such as
`attachments/notion/<sha24>-<safe-original-name>.<ext>` (or a
Lotion-specific URL scheme that the renderer resolves through the
attachment store). The store is a plugin in the same sense as backup
providers and LLM providers, so power users can swap in S3 / IPFS /
WebDAV later.

Concrete things to figure out when this work starts:

- Hash + filename scheme (SHA-256 hex feels right; first two chars as
  a subdirectory to keep listings manageable).
- Garbage collection — when a page that references an attachment is
  deleted, when does the file actually go?
- How "open in another device" handles a missing attachment (the
  metadata store is Git-synced but the LFS / blob store may be cold);
  ideally: a soft-broken placeholder + a "fetch from remote" action.
- Whether attachments live inside the workspace directory or in an
  app-managed shared cache outside (affects portability if the user
  zips up the workspace).

This is in the road *because* it's a design question that's cheap to
answer now and expensive to retrofit after attachments ship.

## Internal page links — follow-up work

The editor now intercepts `[text](pages/...md)` clicks and routes them
through the page navigator (handler on `mousedown`, history-aware
back/forward stack). What's left, in roughly increasing cost:

1. **Back/forward tooltips.** Hover the sidebar arrow buttons → show
   the target page's title (e.g. "Back to Markdown Showcase"). 30
   minutes; needs only the cached history stack.

2. **`Cmd`-click navigation in raw-markdown mode.** Today the handler
   short-circuits when raw mode is on so the user can edit URL text
   freely. Cmd+click (or Ctrl+click on Linux/Win) should still
   navigate. Same modifier-detection branch as the existing
   `cursorLine === clickLine` skip.

3. **Link autocomplete.** When the user types `](` inside a `[…]`,
   pop a fuzzy-search picker over every `.md` path in the workspace
   (top-level pages + row pages, plus a "New page…" option to create
   one). Reuses the existing pagesTree data. Bigger UI lift — needs
   a positioned popover wired into the CM6 selection state, but the
   pieces (portal popover, search index, history-aware navigation)
   all exist already. ~1 day.

4. **`[[Wiki link]]` syntax.** Obsidian-style shorthand: `[[Page
   Title]]` resolves by title to a page id and renders as a clickable
   link in live preview. Adds a parser extension on top of
   lang-markdown and a title→id lookup. Trade-off: LLM-generated
   content sticks to standard `[](path)`, so `[[]]` is mostly for
   human typing ergonomics. ~½ day if we skip backlinks; backlinks
   panel adds another day.

5. **Broken-link affordance.** Today clicking a link to a non-
   existent page is a silent no-op. Two options: (a) just color it
   red to flag it, no behavior change; (b) prompt-on-click "Create
   page 'X'?" → create file + navigate. (b) is more Obsidian-like
   but lands you in the page-creation flow which has its own UX.

6. **Backlinks panel.** Per page, list every `.md` that links to it.
   Either eagerly index on workspace load (cheap, ~ms for 500 pages)
   or scan on demand. Display in a right-rail or below the page
   editor. Pairs naturally with the wikilink work.

## Custom icons — row pages + polish

Page and database icons ship today (frontmatter / schema.json field +
`lotion-file://` protocol + sidebar / header / inline-link rendering).
Two follow-ups still pending:

1. **Per-row icons.** Row pages currently share their database's
   default page glyph in the sidebar Files tree and inline links.
   Storage shape: add a hidden system column `icon` to the database's
   CSV (parallel to the existing `page_file` column), and a matching
   `system: true, hidden: true` entry in the schema's `fields`. New
   databases get the column at create time; existing databases need a
   one-time migration when the first row's icon is set — append the
   field to the schema, write the column to the CSV with empty
   strings for every row, then update the chosen row.

   UI lives in two spots: a 56px icon button in the row page's
   editor header (already a `PageEditor` host — wire `onPickIcon` to
   a new `icons:setForRowPage(databaseId, rowId)` IPC), and the
   sidebar's expanded Database folder where each row's icon
   replaces the page glyph. Cost: ~½ day once the migration is in
   place.

2. **Icon GC / dedup.** `IconsService.copyIntoWorkspace` already
   content-addresses by SHA-256, so re-uploading the same image is a
   no-op. But removing the last reference doesn't delete the file —
   `attachments/icons/` grows monotonically. A workspace-scan
   reference-count sweep (run on app startup or behind a "Clean up
   unused icons" button) would catch that. Low priority until a real
   workspace has hundreds of icon swaps.

3. **Emoji picker as an alternative.** Notion lets you set an emoji
   without uploading a file. We could add an emoji picker dropdown
   next to the file picker — emojis just store as a Unicode string
   in the same `icon` field, prefixed `emoji:` to distinguish from
   image paths. The renderer side branches on prefix. Cheap (~2h)
   and removes the "I need an actual image file to use this feature"
   friction.

## Other deferred work

- **Plugin runtime** — plugin manifest, permission prompts, loading,
  sandboxing. See `docs/user-requirements.md` and `docs/design.md`.
- **Assistant + tool calling** — workspace chat, formula generation,
  permission-gated actions.
- **Semantic search** — local embedding index, plugin-provided
  providers, refresh on edits.
- **Git sync UI** — remotes, push/pull, conflict resolution surface.
- **More view types** — timeline, list, graph, and richer plugin-backed
  views. Table, calendar, gallery, and Kanban now have first-pass
  implementations.
- **Page nesting + backlinks** — see "Internal page links — follow-up
  work" above for the link-side; nesting is its own story.
- **Block editor** beyond the current Markdown textarea.
- **Native packaging + auto-update**.
- **Wrap-aware virtualization** — current row virtualization assumes a
  fixed row height. For views with `wrapFieldIds`, measure row heights
  and cache them so the spacer math stays accurate.
- **Multi-key sort with one pass** — currently a stable sort runs once
  per sort key. Switching to a single comparator that walks all keys
  is one allocation cheaper per view switch.
