# Notion HTML import — pitfalls

What we learned while making `notion-import-service.ts` faithful to the
HTML export. Each section is a real bug we hit + the fix shape, so the
next person doesn't fall into the same hole.

Reference companion: [notion-import-compat.md](./notion-import-compat.md)
lists feature-by-feature support status. This doc lists *traps*.

---

## 1. Notion's two CSV variants are not what they seem

For a single database, the HTML export ships two CSVs:

```
<title> <hash>.csv         ← columns in the user's *visible view* order
<title> <hash>_all.csv     ← columns in the *schema* declaration order
```

Both files contain the **same data, same rows**. Empirically, only the
column order differs — `_all.csv` does NOT include extra rows the user
hid via a filter. Naming is misleading.

**Picked**: prefer `.csv` (view order) for visual fidelity to the user's
Notion view; `_all.csv` is a fallback when the regular variant is
absent.

---

## 2. Row counts via `wc -l` lie

Notion CSV cells routinely contain literal newlines (long-form rich
text, multi-line URL field). `wc -l` counts physical newlines and
double- or 50×-overcounts row totals.

Always use a real CSV parser. We tripped on this in
`scripts/audit-notion-import.mjs` — it reported 示例面试笔记 as src=438 imp=48
("lost 390 rows!") when actually both sides had 48; the source CSV's
443 physical lines were one row whose body cell wrapped 9 times.

**Fix**: every row-count comparison goes through `parseCsv()`.

---

## 3. Notion's filename sanitiser destroys row matching by title

CSV cell:        `2023/08/29 [13] 读书于此`
HTML filename:   `2023 08 29 [13] 读书于此 <hash>.html`

`/`, `:`, `?`, `*`, `<`, `>`, `|`, `"` are all replaced by space or
removed when Notion writes the filename. Title-string equality between
the CSV and the filename stem (or even `<h1 class="page-title">`)
fails for any row whose title contains one of those characters.

**Fix**: match on the parsed `<h1>` title rather than the filename
stem (the H1 keeps slashes), AND normalise whitespace (trim + collapse
runs) on both sides before lookup.

```ts
const titleKey = (t: string) => t.replace(/\s+/g, " ").trim();
```

This alone wasn't enough for every DB (see #4), but it caught the
biggest bucket.

---

## 4. Property-subset match for empty-title rows

Some DBs (`每日习惯`, an unbroken-streak diary) have an **always-empty
title column** — rows are differentiated only by `日期` and `🗓`. With
title-only matching every row collapsed to "Untitled" and only one
HTML actually got attached.

**Fix**: a "subset match" fallback. Index every HTML row's
`<key, value>` property pairs into `Map<"key␟value", RowEntry[]>`.
For each CSV row, intersect the candidate sets for each non-empty cell.
If exactly one row survives, claim it.

Tricky parts:
- Property-equality must use the same `normVal` normalisation
  (whitespace collapse) used elsewhere.
- `consumed` set must be checked inside the intersection so an HTML
  row doesn't get claimed twice across CSV rows.
- Iteration order matters — claim early gets the unique match;
  later collisions fall through to "append unmatched".
- Empty-title CSV rows must prefer empty-title HTML candidates. A sparse
  row with only `Date + Status` can otherwise steal a titled HTML row
  like `Alex` that shares those same properties, leaving the real
  `Alex` CSV row to import as a second CSV-only row.

---

## 5. Append-unmatched-HTML can double-count rows

After matching CSV rows, the importer appends any HTML the matcher
didn't claim — those are typically rows the user filtered out of the
visible view but still exported as bodies.

If matching MISSED a CSV row (whitespace mismatch etc.), that CSV row
gets an empty-body record, AND the corresponding HTML stays unclaimed
and gets appended → **one Notion row appears twice in the imported
DB** (once with empty body, once with body).

**Fix**: CSV is the source of truth for row existence and scalar field
values. HTML is only joined in to attach body/icon/source links. Improve
the matcher so an empty-title CSV row cannot claim a titled HTML row;
if HTML remains unclaimed, treat it as extra body material to audit,
not proof that another CSV row exists.

Defence-in-depth: the audit script
(`scripts/audit-notion-import.mjs`) flags any DB whose imp > 5× src.

---

## 6. Blank CSV titles are still blank titles

When CSV title is empty AND HTML's `<h1>` is empty, we used to fall
back to the first non-empty property values (`Date · Status`) and then
dedupe synthesized labels with `(2)`, `(3)`. That made blank Notion row
pages look like user-authored pages with meaningful names, and it also
made import diffs harder to audit.

**Fix**: if the source CSV has a title column and the cell is empty,
keep the imported title as `Untitled`. Do not synthesize names from
other properties, and do not add `(2)` suffixes just to make labels
unique. Row/page identity is the id plus database context; the title is
only a label.

```ts
title = csvTitle || parsed?.title || matchTitle ||
  (hasNotionTitleColumn ? "Untitled" : propFallback || "Untitled");
```

---

## 7. Nested inline DBs share names with top-level DBs

A user's `每日习惯` (Morning Habits) row pages may each contain an
inline `播客` sub-database (notes on podcasts the user listened to
that day). Notion's export structure:

```
晨间日记/每日习惯/<diary-row>/播客/<podcast-note>.html
```

Our original `enclosingDbHash(dir)` walked the ancestor chain looking
for a title match against a global `Map<string, string> dbByTitle`.
For the podcast note above, `播客` matched the **top-level** 播客 DB —
attributing 20,461 row HTMLs to a DB that should have had 125.

**Fix**: index by **absolute path**, not by title.

```ts
// For each registered DB, compute its row folder = dirname(csv) + "/" + dbTitle
const dbHashByRowFolder = new Map<string, string>();
// Then enclosingDbHash exact-matches the HTML's direct parent
function enclosingDbHash(dir: string) {
  return dbHashByRowFolder.get(normalizeAbs(dir)) ?? null;
}
```

Any HTML deeper than one level inside a DB folder is by definition
*not* a row of that DB.

---

## 8. User's "Created time" column collides with the system field

Lotion's DatabaseSchema reserves three system fields: `id`,
`created_time` (auto-stamped on row creation), `updated_time`. Many
Notion DBs have a USER property named literally "Created time" (a
Notion auto-property exposed as a regular column).

When the importer added that user column via `uniqueFieldId`, it got
ID `created_time_2`. Then the record-builder did

```ts
const field = fields.find(f => f.name === header);
```

which matches the FIRST field with name "Created time" — the SYSTEM
field — and writes the user's data into the system slot. The
`created_time_2` column is created and shipped to disk but is always
empty. 51 of 149 DBs hit this.

**Fix**: carry a `Map<csvHeader, fieldId>` through the record-builder so
we never look up by name again. For real Notion auto-time properties,
map `Created time` to Lotion's `created_time` and `Last edited time` to
`updated_time` while keeping the Notion display name. Other user
columns that still collide with system names should be renamed to
`${header} (Notion)`.

---

## 9. Formula columns get wiped by `applyFormulasToRecords`

Lotion's formula evaluator (`shared/formula.ts`) used to return `""`
when the field had no formula expression. That's fine for a freshly-
added formula field with no expression yet — but **catastrophic** for
imported formula columns where Notion ships the pre-computed value
without an expression to recompute against. Every subsequent write
(`updateCell`, `ensureHiddenField` for page_file, …) re-ran the
evaluator and wiped Notion's data.

Concrete repro: 每日习惯's `一年剩余 / 周数 / 天数` columns showed
`226 / 20 / 139` right after import, then became `Empty` the moment
you opened any row page (which triggers `ensureHiddenField`).

**Fix**: when `field.formula` is empty, return `record[field.id]` —
i.e. preserve whatever's already in the cell. New formula fields still
render Empty (no value present); imported formula fields keep their
Notion-computed values until the user writes an expression.

---

## 10. Phantom standalone-DB pages

For each DB, Notion's HTML export also writes a standalone page
HTML whose body is *just* the inline database view (a single
`<div class="collection-content-wrapper">…</div>`). These show up as
"phantom" pages in the sidebar — visually identical to the DB itself.

**Fix**: detect collection-only pages (`isCollectionWrapperOnly`),
skip them when there's already a kept DB with the same title, and
**carry their icon forward** to the database's `schema.icon` so the
DB sidebar entry isn't iconless (e.g. 成功日记's `cancel.png`).

Detector handles three structural variants Notion uses:

```html
<div class="collection-content">…</div>                ← board view
<table class="collection-content">…</table>            ← table view
<div class="collection-content-wrapper">…<table…>…</div>  ← wrapper
```

…and tolerates trailing `<br>` whitespace siblings (they appear after
the collection block but don't count as content).

---

## 11. Inline DB view → fenced `lotion-view` block, not a link

Initial implementation emitted `[📂 <title>](databases/db_<id>)` for
embedded collection blocks. This routed clicks to "open the DB in a
new tab", but the user saw a plain text link instead of the inline
table Notion has.

Lotion already has `lotion-view` fenced blocks (used by
`PageEditor.insertView`) that render an inline database widget. Switch
the converter to emit:

````markdown
```lotion-view
database: db_<id>
view: view_default
```
````

Gotchas:
- Turndown will mangle raw triple-backticks (escape or wrap in its own
  fence). Emit a `{{LOTIONVIEW:notion-db:<hash>}}` *sentinel paragraph*
  during HTML→MD conversion, then expand it to the real fenced block
  in `cleanNotionBody` AFTER turndown has finished.
- The sentinel must contain NO underscores. Turndown emit-escapes them
  to `\_` and the post-process regex breaks. (We used `LOTIONVIEW`,
  not `LOTION_VIEW`.)
- The substituted `database:` value must be the **logical** schema id
  (`db_<random8>`). Do not add another `db_` when deriving filesystem
  paths; the folder is now the schema id itself when the id already has
  that prefix.

---

## 12. Field type inference from `<tr class="property-row-<TYPE>">`

CSVs strip all type info: every cell is a string. The HTML row pages
embed types in the property table's row classes:

```html
<tr class="property-row property-row-multi_select"><th>标签</th>…</tr>
<tr class="property-row property-row-date"><th>日期</th>…</tr>
<tr class="property-row property-row-formula"><th>天数</th>…</tr>
```

Parse the suffix and store as `propertyTypes: Record<string,string>`.
Union across all parsed rows of a DB to handle rows with partial
property tables. Map to Lotion FieldType:

| Notion                 | Lotion              |
|-----------------------|---------------------|
| multi_select / select / date / number / formula / created_time / url | (same) |
| checkbox               | checkbox (`Yes`/`No` normalized to `true`/`false`) |
| last_edited_time       | updated_time        |
| relation               | entity_ref          |
| status                 | select              |
| person                 | person (static names; no user directory yet) |
| rollup / files / email / phone | text |

`status → select` loses the colour metadata but at least gives the
user a dropdown to edit. `relation → entity_ref` is static import-time
linking, not a live Notion-style relation/rollup graph.

Markdown exports do not include `property-row-<TYPE>` classes, so the
importer also has a conservative CSV-only fallback when HTML metadata
is absent: infer `url`, `checkbox`, `number`, and `date` only when all
non-empty CSV values match that type. HTML-derived types still win
whenever they exist.

---

## 13. Empty inline views may have no CSV

Notion can export an inline linked database view whose current filter
matches zero rows. The HTML still contains the collection wrapper and
column headers, but there may be no matching CSV/hash for that view.
If the importer only resolves inline collections through CSV-backed
databases, the page shows "database not found" and the empty view
vanishes.

**Fix**: during the metadata parse, record every inline collection's
hash, title, headers, and row count. When `rowCount === 0` and no
CSV-backed database owns that hash, synthesize a tiny empty database
with the same title and columns, write it for the embedded widget, and
keep it out of the sidebar manifest.

---

## 14. Image links wrapped in clickable `<a>`

Every Notion image in HTML is emitted as `<a href="X"><img src="Y"></a>`
so the user can click to view full-size. The `href` typically points
somewhere relative to a sub-page that isn't part of the export — it
404s offline and clutters the markdown.

**Fix**: in the DOM strip pass, unwrap the `<a>` if its only child is
the `<img>`. The image's `src` is the actual export-relative path
which the rewrite pass resolves to
`attachments/notion/<sha24>-<safe-original-name>.<ext>`.

---

## 15. Notion's one-`<ul>`-per-`<li>` exporter

Notion's HTML emits every list item in its own `<ul>` (and again for
nested levels):

```html
<ul class="bulleted-list"><li>双力臂</li></ul>
<ul class="bulleted-list"><li>双力臂<ul class="bulleted-list"><li>执行</li></ul></li></ul>
```

Turndown emits a blank line between *separate* lists, so a 12-item
bullet list rendered with blank lines between every entry → looks
loose. Nested lists got the same treatment.

**Fix**: a recursive merge pass that walks the DOM, finds adjacent
sibling `<ul>` / `<ol>` with the same `classList`, and moves the
second's children into the first. Combined with a post-process regex
that collapses whitespace-only lines between bullet siblings
(`/\n[ \t]+\n([ \t]*(?:-|\d+\.)\s)/`), nested lists render tight.

---

## 16. `simple-table` needs a `<thead>` to convert

GFM's turndown-table rule only fires when the table has a `<thead>`.
Notion's `<table class="simple-table">` does not — the first `<tr>`
inside `<tbody>` is the header but isn't tagged as such. Without
intervention turndown dumps the raw HTML.

**Fix**: a pre-pass that promotes the first row of every
`.simple-table` to `<thead>` and converts its `<td>` cells to `<th>`.

---

## 17. Notion CDN icons and Prism noise

`<img src="https://www.notion.so/icons/calendar_gray.svg">` and the
Prism CDN `<script src="…prism.min.js">` / `<link rel="stylesheet"
href="…prism.min.css">` are injected into every Notion HTML page. The
CDN icons 404 offline; the Prism tags are inert. Strip both in the
DOM-cleaning pass before turndown sees them.

---

## 18. Page icons need attachment indexing + page metadata

`<header><div class="page-header-icon"><img class="icon" src="…"></div>`
points at a relative path inside the export. The importer must:

1. Resolve the icon path against the page's source directory.
2. Look up the resolved absolute path in the attachments rewrite map
   to get `attachments/notion/<sha24>-<safe-original-name>.<ext>`.
3. Store the resolved icon in the right page metadata lane:
   free pages use the system `pages` database `icon` field, database
   row pages use the hidden `row_icon` system column, and skipped
   phantom database pages use the database schema's `icon` field.

Do not write icon frontmatter during import. The unified page/row model keeps
metadata in CSV/schema records, while markdown files stay body-only.

---

## 18. Renderer link click handler needs an `internal-db` lane

After the `lotion-view` switch (#11) a separate need came up: pure
markdown links to a DB (e.g. cross-references from a journal row to a
DB) should open the DB view, not a CSV file. Lotion's
`CodeMirrorMarkdownEditor` previously bucketed every link as
`internal-md` / `external` / `ignore`. CSV paths were "external" →
handed to the OS shell → opened Excel.

**Fix**: add a fourth `internal-db` bucket matching `databases/db_<id>`
paths, route it through `actions.selectDatabase(id)`. `LotionActions`
already had `selectDatabase`; just plumb it through `LinkActions`.

---

## 19. Vite dev server vs. file:// production loading

Unrelated to import but bites every "let me just look at it" loop: the
default `npm run dev` loop runs Vite as a dev server and Electron
loads `http://127.0.0.1:5173/`. First page load takes 30-45 s while
Vite transforms 500+ TS/JSX modules on demand.

For just **viewing** an imported workspace, use `npm start`:
- `vite.config.ts` has `base: "./"` so build output uses relative
  asset paths
- `window.ts` falls through to `loadFile('dist/renderer/index.html')`
  when `VITE_DEV_SERVER_URL` is not set
- Page loads in ~220 ms (200× faster)

`npm run dev` is for editing code (HMR worth the cold start).

---

## 20. Run the audit after touching the importer

`scripts/audit-notion-import.mjs` re-runs after every importer change:

```
node scripts/audit-notion-import.mjs \
  --source .scratch/export-html \
  --imported .scratch/notion-html-test
```

Checks:
- Per-DB row count source vs. import (catches both row explosion via
  `factor > 5×` and row loss via `< 50% of source`).
- Per-column populated-cell count source vs. import (catches
  whole-column data loss like the "Created time" collision).
- Row-level and database-level `notion_original_csv` /
  `notion_original_html` links still point to copied workspace files.
- Audited copied original HTML still resolves relative `src` / `href`
  resources such as images and sibling attachment folders.
- Exits non-zero on hard issues (explosions, missing source).

Add a real fixture-based integration test next — until then, this is
the regression guard.

---

## 21. Notion splits exports across `-Part-N` zips

Big workspaces ship as

```
.../Export-<uuid>-Part-1/Export-<uuid>/<rest>     ← CSVs live here
.../Export-<uuid>-Part-2/Export-<uuid>/<rest>     ← row HTMLs live here
```

…where `<rest>` is identical across parts. A row HTML for a 每日习惯 row
on 2024/04/08 sits under Part-2, but the inline 播客 sub-DB's CSV that
same row references lives in Part-1. Indexing the row-folder lookup by
**absolute path** misses every cross-part case (Part-1's CSV folder
doesn't have a `startsWith` relationship to Part-2's row dir).

**Fix**: key by *logical path* — everything after the trailing
`Export-<uuid>` segment. `logicalPath(p)` walks the path right-to-left
looking for the last `^Export-[0-9a-f-]+(?:-Part-\d+)?$` segment and
returns the suffix joined with `/`. Now Part-1 and Part-2 entries for
the same logical row compare equal.

---

## 22. Recursive sub-content floods the page list

Notion's export is recursive: every page that has child content gets a
`<title>/` sibling folder. A DB row that has rich body content with
sub-pages ships as

```
<DB row folder>/<row title>.html        ← the row
<DB row folder>/<row title>/<sub>.html  ← sub-pages reachable from
<DB row folder>/<row title>/<sub>/…     ← the row's body
```

Treating every non-row HTML as a top-level page exploded the workspace
to 31,734 page entries (the user really had 53). Distinguish:

- **Row** — direct parent matches a registered DB's row folder.
- **Top-level page** — neither a row nor under any DB row folder.
- **Sub-content** (drop) — under some DB row folder but deeper than
  the row level.

The single `isUnderAnyDbContent(dir)` helper handles the third bucket:
`dir.startsWith(dbRowFolder + "/")` for any registered DB → drop. After
this, page count went 31,734 → 53. The dropped sub-content is reachable
in the workspace only via its parent row's body (good enough; Lotion
has no nested-page model anyway).

---

## 23. Recursive top-level pages — what to keep

After (#22) you may notice your workspace still has a chunk of
"pages-inside-pages" that came from Notion sub-pages of regular
top-level pages (not DB rows). The user had ~50 such pages organised
inside a top-level `数据库/` page. Those are GOOD to keep — they're
the user's actual content tree.

The rule we converged on: drop only HTMLs that live below a *DB row
folder*. HTMLs that live below a top-level page's `<title>/` content
folder become top-level pages themselves (Lotion has no parent-page
hierarchy). Trade-off: the parent-child structure flattens, but every
page is reachable from the sidebar.

---

## 24. The 数据库 index page links to other DBs by HTML path

A "manual index" page (the user's `数据库` top-level page) consists of
~50 markdown links to each database's standalone HTML file:

```html
<a href="数据库/公开文章 3e1d409c…html">公开文章</a>
```

Notion knows these are DB references; we have to figure that out from
the link target. **Three layered rewrites**, each catching what the
previous one misses:

1. **Phantom-page redirect**: when we skip a standalone DB-HTML as
   collection-wrapper-only, register its `sourcePath → databases/db_<id>`
   in the rewrites map. Index links to that source path now resolve.

2. **Title fallback** for `lotion-view` sentinels: the converter emits
   `{{LOTIONVIEW:notion-db:<hash>:<base64-title>}}`. Notion's "linked
   database" feature (a view of an existing DB shown inline elsewhere)
   uses a hash that has no CSV of its own — but the title matches a
   kept DB. The rewriter tries `notion-db:<hash>` first, then
   `notion-db-title:<base64>`.

3. **Hash fallback** for `.html` links: a link path may diverge from
   the file's actual location (`数据库/生活反思 <hash>.html` in the
   link, `收集箱/生活反思 <hash>.html` on disk). The 32-hex Notion hash
   is unique per entity. Register `notion-hash:<hash>` for every kept
   page + DB; the link rewriter falls back to it when the absolute
   path lookup misses.

Result on the user's 数据库 index: all 50 links now route through the
workspace: 43 database links and 7 page links. One of those database
links (`工作反思`) is a synthesized 0-row DB because Notion omitted the
empty database file from the export.

## 24a. HTML exports can link to hashes that are not in the export

Concrete repro: the source `数据库 …html` page contains:

```html
<a href="数据库/工作反思 5aa911c6e6044ed6a975bcf8f5323d2c.html">工作反思</a>
```

No selected export part contains a file with that hash. In this case
the page is the user's database index, and most sibling
`figure.link-to-page` links resolve to databases, so this missing
hash is treated as an empty database that Notion omitted.

**Fix**: collect link-to-page hints before body conversion. When a
database-heavy index has a missing Notion hash, synthesize a 0-row DB
with the link label as its name and register `notion-hash:<hash>` to
that DB path. For other orphan Notion-shaped links, keep the safer
external fallback to `https://www.notion.so/<hash>`.

## 24b. `link-to-page` icons are not always on the target page

Notion can render small icons inside the index page's
`figure.link-to-page` anchor even when the target page/database header
does not carry an icon. Some icon paths are also stale:
`数据库/工作收集箱/file.png` in the link, but the actual attachment is
`收集箱/file.png`.

**Fix**: collect icon hints from `figure.link-to-page`, attach them to
the target page or skipped-phantom database, and fall back by unique
attachment basename when the exact icon path misses. The renderer then
uses the target entity icon for visible internal links.

---

## 25. Turndown escapes `]` inside link labels

When a DB title contains `]` (e.g. `播客：[纽约]无人是客`), turndown
emits the markdown link as `[播客：\[纽约\]无人是客](url)` — escaping
the literal brackets so CommonMark parses the label correctly. Our
link-rewrite regex used `\[([^\]]*)\]\(...\)` and stopped at the first
unescaped `]` in the label — which happened to be `\]` it didn't know
about. The link never matched and stayed URL-encoded.

**Fix**: extend the regex to `(?:\\.|[^\]\\])*` — consume any
backslash-escaped character as one token, then non-`]` non-`\` text.
The live-preview renderer also replaces inactive-line `Escape` nodes
with just the escaped character, so `[播客：\[纽约\]无人是客](...)`
renders as `播客：[纽约]无人是客` instead of showing the backslashes.

---

## 26. `[label](URL)` where label === URL renders invisibly

Notion exports bare-URL pastes as `<a href="X">X</a>`. Turndown's
default rule emits `[X](X)`. Lotion's live-preview decorator hides the
URL portion of every link on inactive lines so the label reads as
plain text — but when label === URL, the user sees "小宇宙链接：" with
*nothing* after it.

**Two-part fix**:

- Converter: detect `<a>` where text === href and emit the URL as
  plain text (no markdown link syntax).
- Renderer: GFM linkify in `@codemirror/lang-markdown` *does* tag bare
  URLs as `URL` nodes. The decorator was hiding them too (it assumed
  every URL node was the `(href)` half of `[label](href)`). Now we
  check `node.parent.name === "Link"`; only hide when there's a Link
  parent. Stand-alone URLs stay visible with the `cm-md-url` class
  (colour + click handler) but un-hidden.

---

## 27. Click navigation: database URLs use canonical folder names

Markdown link `[label](databases/<folder>)` is classified as
`internal-db`. User database ids normally already include `db_`, so the
folder should be exactly `db_<random>`, not a double-prefixed variant.

Broken version: prepend `db_` during link rewrite and then let
`DatabaseService` prepend another `db_` during path lookup.

Fixed version: use the shared path helper. If an id already starts with
`db_`, the folder name is the id; system ids such as `pages` still live
under `db_pages`.

---

## 28. Sample-screenshot regression-checking flow

The bug list above isn't theoretical — every entry came from sampling
~15 imported top-level pages in Lotion's UI and eyeballing what was
missing or wrong vs. the source HTML. The drill:

```bash
# Walk each page, force its tab, screenshot to /tmp/sample-pages/<title>.png
bash /tmp/sample-pages.sh
```

Then `Read /tmp/sample-pages/<title>.png` one at a time and look for:
- Missing inline DB tables (renders as `📂 (database not found)`).
- URL-encoded `%E5%85%AC%E5%BC%80%E6%96%87%E7%AB%A0` link bodies.
- Invisible URL labels.
- Mis-attributed row data (a DB exploded to 20k rows).

When the eyeball pass turns up nothing, *then* commit. The audit
script catches numerical regressions; visual checks catch the rest.

---

# Notion **Markdown** export — separate set of pitfalls

The importer accepts both formats; the bug shape differs. Verified
on the user's MD-format export (`.scratch/export-csv-md/`, 40,838
`.md` files, 24,034 `.csv` files, 1,496 images) running through the
same `NotionImportService.runImport`.

## 29. MD export inflates the page count

Same source, same importer:

```
HTML:  53 top-level pages, 149 DBs, 12,059 DB rows, 1,751 attachments
MD:    27,427 pages,       149 DBs,                 1,682 attachments
```

The MD source has 40,838 `.md` files; the deep-nested ones
(`<DB>/<row>/<child>/<grandchild>.md`) all get classified as
top-level pages because:

1. `isUnderAnyDbContent` keys off `dbHashByRowFolder`, populated
   from CSV-file locations. In MD that part of the layout matches
   HTML, so it works.
2. **BUT** phantom-page detection (skip a page whose body is just
   an embedded DB wrapper) only runs on `.html` — `parseNotionHtml`
   is the gate. MD-format DB-wrapper pages are plain markdown like
   `[<DBName>](<DBName>%20<hash>.csv)`. They survive into
   `pagePlans`.
3. Sub-content nesting works DIFFERENTLY in MD. Notion stores a
   nested page's body in a *separate* `.md` next to the parent's;
   HTML inlines them via `<div class="collection-content">`. Our
   flatten-everything page builder picks every separate file up.

**Fix status:**
- Done: MD phantom DB-wrapper detection. After stripping an optional
  title and leading icon-only aside, a page whose only body content is
  a local Markdown link to a Notion-hashed `.csv` is skipped and its
  source path redirects to the canonical Lotion database view.
- Not done: treat any `.md` whose path is under a known DB row folder *and
  whose parent dir is the row's own sub-folder* as DB-row
  sub-content, drop from pagePlans.

## 30. MD `[Name](X.csv)` should open the DB view, not the raw CSV

Every inline-DB in MD ships as `[<Name>](X/Y/<hash>.csv)`. The
importer now rewrites Markdown body links against the same source
rewrite table as imported property values. Database CSV source paths
map to the Lotion database view path (`databases/user/<name>--db_<id>`)
instead of the raw imported `data.csv` file. Non-database CSV files
still use the attachment rewrite path.

## 31. MD-format audit reports false `[NOSRC]` mismatches

Audit reports `[NOSRC]` for `起床时间`, `屏幕时间统计`,
`生活反思`, `训练日记` — Lotion has the DB by that name, but the
audit's source walker doesn't pick the same source CSV.

Root cause: 22,980 raw DBs detected in MD (vs 1,184 in HTML).
Notion's MD export ships many more CSV variants — one per
visible-view-config and per page-embed instance, not just per
logical DB. `chooseDatabasesByTitle` picks the largest-row-count
candidate per title, but with so many duplicates the "largest" can
be the wrong variant.

**Fix shape (not done):**
- Score candidates: prefer the CSV whose sibling folder matches the
  row inventory, prefer parents nearest a top-level page.
- Or: dedup CSV files by content hash up-front (same shape as the
  attachment SHA-dedup).

## 32. MD pages have no icon / properties header

HTML pages carry `<header><img class="icon">` and `<table
class="properties">`. MD has neither — the entire body is markdown.

- Some Notion MD templates emit a leading icon-only `<aside>` with an
  `<img>` or `<span class="icon">`. Sniff only that leading wrapper,
  resolve the icon through the attachment map, store it in page/row
  icon metadata, and remove the wrapper from the body.
- Row properties come from the CSV columns; the MD body is just the
  page content. (This part already works.)

Do not scan arbitrary later `<aside>` blocks for icons; those can be real
callouts and should stay in the markdown body.

---

## 33. HTML page icons can be emoji, not images

Notion emits two different header icon shapes:

```html
<div class="page-header-icon"><img class="icon" src="..."></div>
<div class="page-header-icon"><span class="icon">...</span></div>
```

The first is an exported attachment or Notion CDN image. The second
is an emoji glyph. We originally only read `img.icon`, so row pages
like `财务看板` imported without their icon even though the source HTML
had the emoji in the page header.

**Fix**: parse `iconEmoji` from `header .page-header-icon span.icon`,
store it as `emoji:<glyph>`, and teach `EntityIcon` plus markdown link
widgets to render that value as text rather than passing it through
`lotion-file://`.

Database row pages need one extra step: their body `.md` files have no
frontmatter, so the importer stores the row page icon in a hidden
system CSV column `row_icon`. Table title cells and row-page headers
read that hidden cell; rows without a custom icon fall back to the
default row-page glyph.

---

## 34. Turndown escapes underscores in attachment filenames

Notion attachment links like `Notepad3_240424_222434.pdf` can come
through Turndown as:

```markdown
[Notepad3\_240424\_222434.pdf](attachments/notion/...)
```

That is technically valid markdown, but it makes imported files look
like they still contain stray backslashes. Don't globally remove
backslash escapes — labels with `\[...\]` still need them so markdown
can parse the link label.

**Fix**: after Turndown, only for links whose target is
`attachments/notion/...`, unescape `\_` inside the link label. The
target path stays unchanged and safe.

---

## 35. HTML image exports often omit alt text

The MD exporter may emit an image as:

```markdown
![生产力 (6).png](...)
```

The HTML exporter for the same block can emit only:

```html
<img src=".../%25E7%2594%259F%25E4%25BA%25A7%25E5%258A%259B_(6).png">
```

with no `alt` and no `<figcaption>`. If we pass that straight through
Turndown, the imported body becomes `![](...)`, losing the useful
filename explanation.

**Fix**: before Turndown, fill missing image `alt` from the original
image `src` basename, not from the rewritten attachment path (which has
Lotion's hash prefix). Decode repeatedly because Notion may double-
encode CJK filenames as `%25E7...`. Only normalize Notion's copy suffix
shape `_(6)` to ` (6)`; preserve ordinary underscores such as
`Notepad3_240424_222434.pdf`.

---

## 36. Turndown escapes parentheses in attachment URLs

Image targets with copy suffixes can come out of Turndown as:

```markdown
![生产力 (6).png](attachments/notion/...-生产力_\(6\).png)
```

That looks like harmless Markdown escaping, but the editor's Lezer URL
slice keeps the backslashes. The renderer then asks `lotion-file://` for
a path containing literal backslashes, so the image fails to load and
the browser shows the alt text instead.

**Fix**: after Turndown, normalize `attachments/notion/...` Markdown
targets by stripping Markdown backslash escapes inside the target. Keep
the existing label cleanup for ordinary links, but do not change image
labels there — image labels are the alt text and should stay exactly as
the filename-derived explanation.

---

## 37. Callouts flatten into a loose emoji paragraph

Notion exports a callout as a flex figure:

```html
<figure class="block-color-gray_background callout" style="white-space:pre-wrap;display:flex">
  <div style="font-size:1.5em"><span class="icon">💡</span></div>
  <div style="width:100%">Callout body</div>
</figure>
```

Plain Turndown has no concept of "callout", so it emits the icon as a
standalone paragraph followed by the body. In pages like 每日习惯 this
looked like:

```markdown
💡

写下昨天最成功的...
```

That loses the block boundary permanently; after import the renderer
cannot reliably tell whether the emoji/body pair was a real Notion
callout or ordinary text.

**Fix**: special-case `figure.callout` during HTML conversion and emit
a `lotion-callout` fenced block:

````markdown
```lotion-callout
icon: 💡
background: gray
---
Callout body
```
````

Then the CodeMirror renderer collapses that fence into a callout widget
when the cursor is outside the block. Preserve the background color from
the same `block-color-*_background` class on the `<figure>`; otherwise a
Notion callout can import with the right icon/body but the wrong visual
weight. Existing already-imported markdown that was flattened before
this fix needs re-import (or a targeted migration) to recover the
callout boundary.

---

## 38. TOC anchors are export-local

Notion's `<nav class="table_of_contents">` links point at HTML element
IDs like `#28eb5987-...`. Those anchors do not survive markdown
conversion, and even if they did, CodeMirror's live preview is not a
static HTML document with matching DOM IDs. Copying the original nav
would create a stale, non-clickable TOC.

**Fix**: replace the Notion nav with a `{{LOTIONTOC}}` sentinel during
HTML conversion, expand it to a `lotion-toc` fenced block during import,
and let the renderer generate the visible TOC from the current markdown
headings. This keeps the imported block at the original Notion position
while making clicks scroll to the real editor line.

---

## 39. Source-only embeds should not become plain URLs

Some Notion embeds export as a bare source figure instead of an iframe:

```html
<figure>
  <div class="source">
    <a href="https://indify.co/widgets/live/countdown/...">...</a>
  </div>
</figure>
```

Turndown sees only a link and emits a plain URL. Lotion has URL preview
heuristics, but they are cursor-sensitive editor decorations and can be
missed in long imported pages. On pages like `2026/5/19 [31.139][1.226]
晨间日记`, the three Indify widgets appeared as text links instead of
the visible countdown/progress widgets from the source HTML.

**Fix**: before Turndown, detect known embeddable source figures and
replace them with an explicit `lotion-iframe` fenced block:

````markdown
```lotion-iframe
url: https://indify.co/widgets/live/countdown/...
height: 300
title: Indify countdown
```
````

Keep this whitelist narrow. A random `<figure><div class="source">`
link may be an ordinary citation; only convert hosts/widgets the
renderer can safely embed.

---

## 40. Plain text square brackets should not keep Turndown escapes

Notion body text can intentionally use bracketed counters or checks:

```html
<p>校验: [80.320.4174.29220]</p>
```

Turndown escapes those brackets to avoid accidentally creating Markdown
link syntax:

```markdown
校验: \[80.320.4174.29220\]
```

That is semantically valid Markdown, but Lotion's editor can show the
escape backslashes on the active line, so the imported page visibly
differs from the source HTML.

**Fix**: after Turndown, unescape `\[` and `\]` only on ordinary text
lines that do not contain Markdown link/reference targets, and skip
fenced code blocks. This keeps plain bracketed text readable without
rewriting real links or code samples.

---

## 41. Currency-formatted numbers are still numbers

`Asset Tracker` exposed a bad import shape that the coarse audit missed.
The source CSV has `Balance` / `Original Amount` values formatted for
display:

```csv
Fidelity Investment Account,Investment,"$233,357.56",...
Credit Card,Credit Card,"-$8,300.00",...
```

The row HTML correctly marks those properties as
`property-row-number`, so the imported Lotion schema infers `number`.
But `normalizeImportedCellValue()` only normalizes dates, so the CSV
writer stores `"$233,357.56"` and `"202,816.06"` into fields declared as
numbers. The UI can render the text, but formulas, summaries, numeric
sorts, and numeric edits now receive display-formatted strings instead
of canonical numeric values.

There is a second Asset Tracker-specific mismatch: the Notion row page
folder contains an extra empty-title `Untitled ...html` row with only
`Created time`, while the CSV has no matching data row. Unclaimed HTML
rows are normally preserved because they may be filtered-out rows, but
this system-only shape is not user data. The importer now skips it when
`skipEmptyRowsAndPages` is enabled and writes an `Empty row page body`
entry to the Import review database instead of creating a noisy
`Untitled` row.

**Fix**:

1. Normalize number fields during import: strip currency symbols,
   thousands separators, and accounting/negative currency forms before
   writing `number` cells, while preserving unparseable text.
2. Teach the audit to validate numeric columns, not only row count and
   populated-cell count.
3. Treat unclaimed HTML rows with empty title and only system-ish
   properties as blank row pages: skip them, record the source in Import
   review, and keep `scripts/test-notion-import-service.mjs` covering the
   regression.

---

## 42. Empty and copied nested pages bloat the imported markdown tree

Large Notion exports can contain thousands of row pages with no body
content, plus copied nested pages that have different Notion page hashes
but identical title/body content. Importing each one as a physical
`.md` file creates a noisy filesystem, slows link validation/search,
and makes duplicate pages look like real user-authored notes.

Two cases need different treatment:

1. Empty bodies are metadata-only pages/rows. Keep the page or row
   record, but skip writing the body file; Lotion creates it on first
   edit.
2. Duplicate standalone/nested pages can be deduped by `title + cleaned
   body` and all source links for skipped copies should rewrite to the
   first canonical page.

Do not content-dedupe database rows. Repeated row bodies can be real
independent records, and merging them would make later edits ambiguous.

---

## 43. `block-color-*` is a block class, not only inline style

Notion uses the same color class family in several shapes:

```html
<p class="block-color-yellow_background">Paragraph</p>
<h2 class="block-color-green_background">Heading</h2>
<blockquote class="block-color-blue_background">Quote</blockquote>
<ul class="bulleted-list">
  <li class="block-color-red">Risk<ul><li>Child</li></ul></li>
</ul>
<ul class="to-do-list">
  <li class="block-color-yellow_background"><div class="checkbox checkbox-on"></div>Done</li>
</ul>
```

If the importer only handles `<span class="block-color-*">`, Turndown
will keep the text but silently drop the visual cue. If it wraps a whole
`<li>` naively, nested child lists end up inside an inline span and the
Markdown hierarchy becomes fragile.

**Fix**: before Turndown, wrap the colored block's own text content in
safe inline spans (`data-lotion-color` / `data-lotion-bg`). For list
items, keep the checkbox input and nested child lists outside the span:

```markdown
-   [x] <span data-lotion-bg="yellow">Done</span>
-   <span data-lotion-bg="blue">Parent</span>
    -   Child
```

The live-preview renderer owns the CSS for these safe spans. Importer
tests should cover each block shape separately because the DOM rewrite
order matters: checkbox normalization, `li > p` unwrapping, and adjacent
list merging can all change the final Markdown.
