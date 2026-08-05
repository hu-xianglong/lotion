# Testing Guidelines

This document describes how to test Lotion changes in general. It is not tied
to one feature. Use it as the default checklist whenever code, fixtures, or UI
behavior changes.

## Testing Mindset

Test the user-facing workflow first, then the storage contract behind it.
Lotion is local-first and plain-text-first, so a good test should answer both:

- Does the UI feel correct and responsive?
- Did the page, CSV, schema, view JSON, or workspace manifest persist the
  expected plain-text change?

Prefer focused checks over broad wandering. Start from the surface you changed,
then run a small regression pass over adjacent surfaces that share the same
state, storage, or renderer code.

## Standard Automated Checks

Run these from the repo root before handing off a meaningful change:

```bash
npm run typecheck
npm run test:fast
npm run build
```

`npm run test:fast` is the default fast regression lane. It runs focused Notion
HTML converter regressions plus demo workspace fixture validation, without
starting Electron or importing the full `.scratch` Notion export. The fixture
validator samples very large stress CSVs by default so routine checks do not
scan the whole 219MB demo workspace.

Use `npm run test:fixtures` whenever sample workspace data changes. It validates
page frontmatter, database schemas, CSV headers and values, view references,
embedded `lotion-view` blocks, select option colors, and known plugin-backed
view config.

Use `npm run test:fixtures:deep` when changing the stress CSV generator or when
you specifically need a full scan of the 20K/100K/500K fixture rows.

Use `npm run test:notion-html` for Notion HTML converter changes. It recompiles
the main-process converter only and checks known lossy-export regressions such
as missing image alt text, escaped attachment URLs, and escaped underscores in
attachment labels.

Use `node scripts/test-notion-import-service.mjs` for focused Notion import and
audit regressions. It covers CSV/HTML source mapping, empty page skipping,
split-export original-file preservation, row/database source links, and copied
original HTML resource links. For direct source/workspace audits, use
`npm run audit:notion -- --source <notion-export> --workspace <workspace>
--json <report.json> --markdown <report.md>` to write both machine-readable and
human-readable reports.

Use `npm run test:integration` for cross-service workflows. These tests use the
public customer API against temporary workspaces and should cover user-shaped
flows that cross import, storage, search, and page/database APIs.

Use `npm run test:hierarchy` when changing page/database path, parent entity,
search identity, sidebar tree, or Notion import hierarchy code. It validates the
system pages/entities databases and reports slash-title path warnings without
failing the default lane.

For docs-only changes, `git diff --check` is usually enough unless the docs
changed fixture instructions or code snippets that should be verified.

## Commit Coverage Hook

Install the tracked Git hooks once per clone:

```bash
npm run hooks:install
```

The pre-commit hook runs:

```bash
npm run test:coverage
```

This blocks commits when the package runtime coverage gate falls below its
configured threshold. The default threshold is 80% and can be overridden for
local experiments with `LOTION_PACKAGE_COVERAGE_THRESHOLD`.

For the customer API entry point only, run:

```bash
npm run test:coverage:customer-api
```

That narrower gate uses `LOTION_CUSTOMER_API_COVERAGE_THRESHOLD`.

## Local Test Releases

After a clean gate run, create a local tester handoff artifact with:

```bash
npm run release:test
```

This command runs `npm run test:fast`, `npm run test:ui-regression`,
`npm run test:production-visual`, `npm run build`, and `git diff --check`
before it writes any release directory. If one of those gates fails, no
successful release artifact is generated.

When CI or a local queue item has already run the same gates, use the faster
prechecked path:

```bash
npm run release:test:prechecked
```

Both commands write a non-production artifact under
`artifacts/test-releases/lotion-test-<timestamp>-<short-sha>/` with a
`release-manifest.json`, build-output or packaging-placeholder metadata,
recent UI smoke artifact links, checksums, and short release notes. The script
does not create a public GitHub Release, bump production version metadata, or
delete previous test releases.
When the latest UI suite artifact includes a production visual quality gate
result, `ui-artifacts.json` also links the gate JSON directly with its status,
filter, viewport set, and artifact-index path so tester handoffs can audit the
visual gate without browsing nested smoke folders.

## Commit-Bound Local App

For local manual testing, install the repository hooks and opt in to building an
openable `.app` after each successful commit:

```bash
npm run hooks:install
git config lotion.buildAppOnCommit true
```

The `post-commit` hook runs `npm run app:commit`. That command runs
`npm run build` and writes a local artifact under
`artifacts/commit-apps/lotion-test-<timestamp>-<short-sha>/`. On macOS the
artifact includes `Lotion Test Release.app`, plus `release-manifest.json` with
the commit SHA, branch, and dirty-worktree flag. A dirty flag means the built app
may include uncommitted local changes in addition to the commit named in the
manifest.

Disable local commit app builds with:

```bash
git config lotion.buildAppOnCommit false
```

## Manual App Smoke Test

Start the app:

```bash
npm run dev
```

Use the Electron window for real app testing. A normal browser tab pointed at
the Vite URL does not have Electron's preload API and should only show the
friendly runtime error.

For a clean demo workspace, run:

```bash
npm run demo:reset
```

Then reopen or reload the Electron window.

For an automated Electron UI regression pass, keep the app running and run:

```bash
npm run smoke:ui
```

This suite covers the Notion import audit panel, global search popup,
embedded database tables/views, editor scrolling and editing regression coverage, sidebar
file-tree navigation, database row-page navigation, source/attachment links,
Markdown live preview, and image lightbox behavior, plus the plugin manager
detail/settings surface.
The URL-field and source/attachment smokes enable the debug shell dry-run hook:
they click the actual UI links and assert the requested URL/path was recorded
without launching the system browser, Finder, or another external app.
The Notion import audit smoke writes an artifact contract into
`harness-result.json` so CI and local review can verify that each viewport
captured non-empty passing and failing audit-result screenshots, preserved the
summary rows, exposed source/workspace/issue Open buttons, recorded shell-open
dry-run requests for those paths, and kept visible diagnostic details such as
`cell_loss` issue kinds in the manifest.
The source attachment smoke also writes an artifact contract into
`harness-result.json` so CI can verify that each viewport captured a non-empty
property-panel screenshot, preserved Original Notion HTML/CSV source metadata,
recorded source/document open requests, and rendered PDF, video, audio, and
image previews.
The row-page navigation smoke writes an artifact contract into
`harness-result.json` so CI can verify desktop and compact property-panel
screenshots, row open timing, direct table editing, source-link opens,
entity-reference navigation, date edit persistence, and property focus
evidence.
The URL field smoke writes an artifact contract into `harness-result.json` so
CI can verify editable table URL cells, row-page URL properties, top-level page
URL properties, open-link requests, link-style geometry, and desktop/compact
screenshots.
The white theme smoke writes an artifact contract into `harness-result.json` so
CI can verify desktop and compact screenshots for page, global search, database,
and plugin surfaces plus default light-theme token evidence.
The editor regression smoke writes an artifact contract into
`harness-result.json` so CI can verify desktop and compact real-editor editing
evidence, link click/edit behavior, autosave/reload persistence, empty row-page
first typing, large-document scroll stability, and non-empty editor screenshots.
The editor link-click smoke writes an artifact contract into
`harness-result.json` so CI can verify direct URL links open, direct page links
navigate inside Lotion, blank-space line clicks enter editing, link Markdown is
preserved, horizontal overflow is absent, and desktop/compact editor
screenshots exist.
The editor scroll smoke writes an artifact contract into `harness-result.json`
so CI can verify large-document scroll latency, scrollability, embedded table
survival after scrolling, long-task evidence, horizontal overflow checks, and
desktop/compact editor screenshots.
The search UI smoke writes an artifact contract into `harness-result.json` so
CI can verify desktop and compact search-result screenshots, backend candidate
checks, large-result rendering latency, search input latency, sort controls,
keyboard navigation, jump-to-line navigation, and horizontal overflow evidence.
The navigation anchor smoke writes an artifact contract into
`harness-result.json` so CI can verify Back restores the clicked markdown
anchor/scroll position, Forward returns to the second page, horizontal overflow
is absent before/after navigation, and desktop/compact editor screenshots
exist.
The page secondary smoke writes an artifact contract into `harness-result.json`
so CI can verify collapsed/expanded secondary panel states, imported source-link
and backlink mounting, editor typing while the panel is collapsed, floating TOC
navigation, horizontal overflow checks, and desktop/compact/laptop panel
screenshots.
The focused UI regression lane (`npm run test:ui-regression`) includes the
Notion import audit, row-page navigation, row-property visual, source
attachment, Markdown preview, search UI, search-title, embedded database table,
settings center, plugin manager, LLM Chat, Advanced Search, URL field, editor
white theme, page backlinks, page secondary, editor regression, editor
link-click, editor scroll, and navigation anchor smoke surfaces.

Use `npm run test:production-visual` before a release candidate or after a
high-risk visual regression. It runs a filtered production visual gate over the
release-critical visual system surfaces: Design System, White Theme, Search,
Search & AI, Markdown preview/imported toggle rendering, embedded database
views, generated database views, row-page property visuals, page secondary
chrome, Notion Import, Settings Center, Plugin Manager, LLM Chat, and Advanced
Search. The gate defaults to desktop, compact, and wide viewport coverage
without changing the default viewport set for every focused smoke. It fails
unless every required surface has coverage for all production visual viewports,
non-empty screenshot artifact contracts, no horizontal overflow evidence, zero
console errors, focused reproduce commands, and a machine-readable production
gate result linked from the UI suite artifact index. This is narrower than the full
`test:ui-regression` suite, but stricter about visual artifact completeness for
the selected surfaces.
It also runs `npm run test:renderer-coverage` before Electron. That gate uses
V8 coverage plus the renderer component bundle source map to report all
`src/renderer/**` source files, including files with zero executed lines. The
machine-readable report is written to
`artifacts/coverage/renderer/renderer-coverage-gate.json`, grouped by shared UI,
database, page/editor, search, plugin-host, and renderer state surfaces. The
gate canonicalizes macOS `/Users` and `/private/Users` source-map aliases,
requires the canonical paths to equal the current TypeScript/TSX source
inventory, and rejects incompatible non-zero aliases. Its artifacts record raw
entry, canonical file, covered file, and alias counts so coverage identity is
reviewable rather than inferred from a percentage.
The
current absolute floors are 30% lines/statements, 20% functions, and 55%
branches. In addition, every run compares all four percentages with the
committed verified baseline in `test/baselines/renderer-coverage.json` and
fails on any decrease, even when the loose absolute floor still passes. The
JSON/Markdown artifacts include the baseline path, verified source task,
current values, and percentage-point deltas. Baseline updates must point to a
new verified task and must not be used to accept an unexplained regression.
These gates are not a claim that the longer-term 80% target has been reached.
Override the absolute floors only for a deliberate
diagnostic run with `LOTION_RENDERER_COVERAGE_LINES`,
`LOTION_RENDERER_COVERAGE_STATEMENTS`,
`LOTION_RENDERER_COVERAGE_FUNCTIONS`, or
`LOTION_RENDERER_COVERAGE_BRANCHES`.
For a focused debug pass, set `LOTION_UI_VIEWPORTS=desktop` or a named custom
viewport such as `LOTION_UI_VIEWPORTS=review:1280x900`; the production visual
contract will require the selected viewport names while the default release gate
continues to require desktop, compact, and wide.
The Advanced Search smoke writes an artifact contract into `harness-result.json`
so CI can verify selected-viewport screenshots for not-built guidance, Ollama
provider errors, local rebuild readiness, stale semantic results, empty results,
LanceDB adapter errors, external provider errors, and page/database/row
navigation evidence.
Use the focused commands when debugging a single surface:

```bash
npm run smoke:ui-harness-foundation
npm run smoke:ui-harness-console-failure
npm run smoke:notion-import-ui
npm run smoke:search-ui
npm run smoke:search-title-ui
npm run smoke:embedded-view-ui
npm run smoke:editor-scroll-ui
npm run smoke:editor-regression-ui
npm run smoke:navigation-anchor-ui
npm run smoke:sidebar-navigation-ui
npm run smoke:row-page-navigation-ui
npm run smoke:row-page-property-visual-ui
npm run smoke:source-attachments-ui
npm run smoke:markdown-preview-ui
npm run smoke:page-path-slash-ui
npm run smoke:page-secondary-ui
npm run smoke:plugin-manager-ui
npm run smoke:llm-chat-ui
npm run smoke:advanced-search-ui
npm run smoke:url-field-ui
npm run smoke:white-theme-ui
npm run smoke:design-system-ui
npm run smoke:real-demo-workspace-ui
npm run smoke:real-notion-import-ui
npm run smoke:image-lightbox-ui
npm run test:renderer-coverage
```

### Shared UI Harness

New or migrated UI smokes should use `scripts/ui-harness.mjs`. The harness:

- creates deterministic temporary workspaces and cleans them up;
- restores the previously open workspace after the smoke;
- connects to an existing Electron CDP endpoint or starts `npm run dev` when
  no app is running;
- runs core flows across `desktop` and `compact` viewports by default. The
  default compact viewport stays above Lotion's Electron `minWidth` so it
  tests a real small-window state instead of an impossible mobile layout;
- captures failure artifacts under `artifacts/ui-smoke/<suite>-<timestamp>/`:
  screenshot, DOM snapshot, readable and structured console logs, dev log,
  state, and thrown error.
- writes a standard `harness-result.json` manifest for each run with suite
  status, renderer URL, expected viewport presets, observed viewport coverage,
  console/page-error issue counts, and a compact result summary.

Use `LOTION_UI_VIEWPORTS=desktop`, `LOTION_UI_VIEWPORTS=compact`, or custom
entries such as `narrow:640x760` to narrow a local run. Set
`LOTION_UI_HARNESS_NO_AUTOSTART=1` when you want the smoke to fail instead of
starting the app automatically.

Run `npm run smoke:ui-harness-foundation` when changing the harness itself. It
uses a deterministic workspace and validates desktop/compact coverage,
geometry/no-overflow, editor focus, autosave, and the generated
`harness-result.json` artifact. It also asserts that the smoke emitted no
renderer `console.error` or `pageerror` events, so runtime failures do not hide
behind a visually passing screenshot.

Run `npm run smoke:design-system-ui` when changing frontend design tokens,
shared primitive CSS, or the Design System lab. It opens the real management
surface through the shared Electron harness, covers desktop and compact
viewports, checks focus and horizontal overflow, validates tokenized white
surfaces, and writes review screenshots under `artifacts/ui-smoke/`.

Run `npm run smoke:real-demo-workspace-ui` for the isolated real Lotion Demo
Space quality pass. It fingerprints the complete source, rejects symlinks,
creates a copy-on-write temporary clone, and only opens that clone in Electron.
The runner verifies Home plus the real 500K-row database on desktop and compact,
including latency, bounded rendered rows, virtual spacers, horizontal overflow,
console errors, and four screenshots. Its `harness-result.json` stores redacted
source/clone fingerprints, pre/post source equality, per-viewport stress
metrics, and the reproduce command. Set `LOTION_REAL_WORKSPACE_PATH` only when
testing an equivalent workspace at a non-default location; the path itself is
never persisted in the result summary.

Run `npm run smoke:real-notion-import-ui` for the isolated real Notion Import
quality pass. It applies the same complete fingerprint, symlink rejection, and
copy-on-write clone boundary, then checks the native Chinese vision-check row,
an exact importer-regression toggle/media page seeded only in the disposable
clone, and the real Notion Import modal on desktop and compact. The artifact
contract records the stale source-page absence, seed provenance, toggle
collapse/re-expand and loaded-image evidence, modal ownership, six screenshots,
zero-overflow measurements, and pre/post source equality without persisting the
source path.

`withLotionUIHarness` fails by default when renderer `console.error` or
`pageerror` events are observed. Use `failOnConsoleErrors: false` only for a
diagnostic smoke that intentionally exercises this path, and record the reason
in the task notes. `npm run smoke:ui-harness-console-failure` intentionally
emits a renderer console error and verifies the failed manifest plus
`console.json` failure artifact.

For visual-regression slices, use `captureElementSnapshot` with
`assertElementSnapshotBaseline` so screenshots are paired with a CI-readable
manifest check for viewport, geometry range, and required metadata. For a
stable, intentionally reviewed surface, also call `assertPngVisualBaseline`
from `scripts/lib/visual-diff.mjs` with the actual screenshot, committed
expected baseline, diff path, pixel threshold, and allowed diff ratio. It
writes a PNG diff plus machine-readable JSON for both passing and failing
comparisons; failures retain paths to actual, expected, diff, and metadata
artifacts. Run `npm run test:visual-diff` when changing this policy. The
production visual command runs these contract tests before launching Electron.

The Design System desktop, compact, and wide surfaces are committed production
baselines. Their reviewed 912x908, 744x1991, and 912x908 PNGs plus
checksum-backed policies live under `test/baselines/production-visual/`. The
real Design System smoke compares all three element screenshots at a strict
zero-pixel tolerance and
records policy, actual, expected, diff, and diff-metadata paths in the child
manifest, aggregate UI index, production visual gate, and release summary.
Default production runs fail if any required evidence is absent or any
committed PNG checksum changes. Custom diagnostic viewports retain structural
contracts until separately reviewed stable baselines are accepted.

The White Theme suite also commits the deterministic main-page phase at
desktop, compact, and wide. Search, database, and LLM plugin phases remain
separate structural/theme screenshots. Before the page capture, the runner
blurs asynchronous editor focus, resets hidden programmatic scroll containers,
and waits for the collapsed floating TOC transition to settle; the artifact
contract records the zero scroll offsets and collapsed TOC state. The three
`white-theme-page-*.json` policies use strict zero perceptual-diff thresholds
and are required by the default production and release evidence.

The unified Settings Center commits its final Plugins state for desktop,
compact, and wide. The runner waits for the active-tab CSS transition to
finish, removes transient focus, verifies all seven plugin rows are fully
inside the captured center, and records zero nav/pane scroll offsets. It also
proves the Search & AI `Advanced` tab was visible and enabled before opening
its settings deep link. The three `settings-center-*.json` policies are strict
zero-diff production requirements.

The Plugin Manager also commits its complete final list surface at desktop,
compact, and wide. Before capture, the runner resets the owning management
scroller, proves all seven plugin rows, all fourteen provider icons, the
summary, and the last extension-point section are inside the manager, then
temporarily exposes the full overflow surface. This avoids a stable but invalid
scroll-container screenshot where the tab strip hid the title/summary and most
providers while leaving a blank tail. The original inline styles are restored
after capture. The three `plugin-manager-*.json` policies require strict zero
diffs in child, production, and release evidence.

The LLM Chat suite commits its completed conversation/write-preview phase at
desktop, compact, and wide. The runner records transcript client/scroll
geometry plus each message's bounds and requires both the user and assistant
messages to be fully visible. On short viewports the assistant uses a wider,
height-aware layout so history, controls, one-line quick actions/activity,
the full two-line write preview, status, and composer do not collapse the
transcript. Snapshot capture also removes transient hover/focus, waits for
animations and two paint frames, and uses integer-aligned header metrics.
The three `llm-chat-conversation-*.json` policies require strict zero
perceptual diffs in child, production, and release evidence.

The Advanced Search suite commits its populated stale-result phase at desktop,
compact, and wide. The runner records the results viewport's client, scroll,
and offset geometry plus every result card's bounds and full-visibility state.
Its responsive control grid stays two-column while the 860px modal fits,
preventing the compact 1040x820 layout from pushing both results below the
modal boundary. Snapshot capture removes transient pointer/focus state and
waits for animations and two paint frames. The three
`advanced-search-stale-results-*.json` policies require strict zero perceptual
diffs in child, production, and release evidence.

The unified Search & AI suite commits its populated LLM Chat handoff state at
desktop, compact, and wide. Search-result and selected-source subtitles use
logical page/database/row identity and never render workspace storage paths,
CSV/Markdown filenames, or embedded entity IDs. The runner records the active
primary tab, both tab bounds, selected-source title/subtitle/overflow geometry,
and any visible storage-identity matches. Snapshot capture removes transient
pointer/focus state and waits for animations and two paint frames. The three
`search-ai-chat-handoff-*.json` policies require strict zero perceptual diffs
in child, production, and release evidence.

The global-search suite commits its populated 10,000-result state at desktop,
compact, and wide. The filter strip wraps rather than horizontally clipping
the trailing sort control. The runner records the panel, filter strip, all six
filters, sort label/select, results viewport, and visible-row bounds; it rejects
filter/sort overlap, controls outside their owning surface, or horizontal
filter overflow. Snapshot capture removes transient pointer/focus state and
waits for animations and two paint frames. The three
`global-search-results-*.json` policies require strict zero perceptual diffs in
child, production, and release evidence.

The Page Secondary suite commits a selected local Git restore-preview at
desktop, compact, and wide, while retaining the supplemental laptop viewport
as structural coverage. Each fixture is a real temporary Git repository with
two deterministic page revisions. The smoke selects the older revision,
captures the logical `Page snapshot · …` label, added/removed diff lines and
Restore action, accepts the confirmation, then proves the restored Markdown
persisted and the success message survived the history refresh. Backlink
excerpts render Markdown labels without internal destinations. The artifact
contract records status/version/preview/Restore geometry, expansion,
visibility, opacity, overflow, and storage-leak matches. The three
`page-history-restore-preview-*.json` policies require strict zero perceptual
diffs in child, production, and release evidence.

The GitHub Backup suite commits the complete local-mock restore-preview modal
at desktop, compact, and wide. Each run creates two backups, replaces transient
commit time/SHA display with deterministic fixture evidence, selects the older
version, and captures the connection form, backed-up status, two-version
history, logical `Page snapshot · …` identity, diff, and Restore action. The
runtime contract separately proves the modal stays inside the viewport, the
backdrop owns the viewport, the modal body owns vertical scrolling, and the
selected preview controls are visible before restore. It then accepts the
confirmation, verifies persisted Markdown and preview clearing, and exercises
the GitHub API not-configured state. The three
`github-backup-restore-preview-*.json` policies require strict zero perceptual
diffs in child, production, and release evidence.

The Notion Import audit suite commits the empty-import command modal at desktop,
compact, and wide while preserving its passing and blocking audit scenarios.
The modal contract records title, Close, all three checked import options, both
source selectors, Cancel, and the initially disabled Scan exports action. It
requires positive geometry for every control, containment in its owning
surface, dialog/backdrop isolation, viewport containment, modal-body vertical
scroll ownership, visible/opaque content, and no horizontal overflow. The three
`notion-import-command-modal-*.json` policies require strict zero perceptual
diffs in child, production, and release evidence.

The Markdown Preview suite commits the imported-highlight selected-source state
at desktop, compact, and wide. Before capture, the runner proves the exact DOM
selection and raw Markdown source are present, the selected line/highlight/Edit
source button have positive geometry inside the editor and scroller, neither
the selection nor highlight overlaps Edit source, and document/editor
horizontal overflow is absent. It also keeps the hover-only button visible and
hides only the owning scroller's transient scrollbar during capture. The three
`markdown-preview-selected-source-*.json` policies require strict zero
perceptual diffs in child, aggregate production, and release evidence.

Run `npm run smoke:row-page-property-visual-ui` for the focused row-page
property visual lab. It creates a deterministic workspace with Original Notion
HTML/CSV source links, date fields, empty values, entity refs, select/tag
pills, number/text fields, and checkboxes. The smoke captures desktop and
compact screenshots plus DOM geometry metadata so source-link affordances,
value-column alignment, focus behavior, and no-overflow regressions can be
reviewed from CI artifacts. Production runs also include wide.

The complete row-property capture resets the row-page and details scroll
owners, temporarily exposes the full details overflow surface, forces a repaint,
and restores the original scroll/style state after capture. This prevents a
compact false positive where the 52vh details viewport clipped the first rows
and the transparent screenshot showed the page title instead. The persisted
contract requires panel/content/properties ownership, all twelve row and
label/value geometries, important source/input/option/search/entity control
geometries, visibility/opacity, non-overlap, and zero horizontal overflow.
Selected values remain colored pills; their per-value search actions are
separate muted `⌕ + value` controls with verified click and keyboard behavior.
The three `row-page-property-panel-*.json` policies are strict zero-diff
production and release requirements.

The row-page property visual smoke also writes a machine-readable artifact
contract into `harness-result.json`. The contract checks that every configured
viewport produced a non-empty screenshot and metadata for source links, date
rows, empty values, entity refs, row count, source-open captures, focus
summaries, and value-column alignment. Run
`node --test test/ui-harness-artifacts.test.mjs` when changing this contract or
the shared screenshot helpers. Set `LOTION_ROW_PROPERTY_SKIP_BASELINE=1` only
while intentionally preparing a reviewed replacement baseline.

The aggregate `npm run smoke:ui` runner also checks that each selected child
smoke emits a passed `harness-result.json` with all required viewport presets
and no renderer `console.error` or `pageerror` events.
Use `LOTION_UI_SUITE_FILTER=<name>` for focused aggregate runs while preserving
that child-manifest compliance gate.

Aggregate UI suite runs also write `ui-suite-artifacts.json` and
`ui-suite-artifacts.md` next to the suite `harness-result.json`. These files
index every child manifest, viewport coverage, console-error count, artifact
contract status, missing artifact-contract count, and screenshot byte totals so
CI failures can be reviewed without manually browsing each timestamped artifact
folder. The Markdown index also includes the runner environment (Node version,
platform/architecture, CI flag, selected viewport presets, suite filter, and
selected child scripts), total/child elapsed time, the slowest child smokes, the
child artifact root, representative screenshot paths, missing per-viewport
screenshot diagnostics, bounded console issue excerpts, and a focused reproduce
command such as
`LOTION_UI_SUITE_FILTER=smoke-search-ui.mjs npm run smoke:ui` for quick local
debugging and latency triage. If a child smoke has not yet been upgraded to
screenshot artifact contracts, the aggregate Markdown details column should
explicitly say `missing artifact contract` instead of silently showing an
empty details cell.
The aggregate contract checks the environment's selected viewport names against
the same required viewport names used for child manifests, so a CI lane cannot
silently run the UI suite with only one viewport while still producing a
passing artifact index.
If a child artifact contract omits a screenshot for an observed required
viewport such as `compact`, the aggregate gate fails and the Markdown details
call out `missing screenshots=compact`.
When a child smoke fails, its `harness-result.json` records structured
`failureArtifacts` paths for `README.md`, `failure.png`, `dom.html`, console
logs, state, and error stack; the aggregate index preserves those paths so the
failure screenshot and readme are directly discoverable from CI artifacts.
For Notion import audit runs, the aggregate details should include both
`phase=passing` and `phase=diagnostic` rows plus issue-kind counts such as
`cell_loss=1`, so import failures are reviewable from the suite index alone.
The suite manifest contains an `artifactIndex` pointer to both files.

For user-facing UI changes, coded UI coverage is required. Prefer the shared
harness over one-off Playwright setup, and cover at least desktop/laptop plus a
compact/narrow viewport unless the surface is genuinely desktop-only and the
task records why. Assertions should check concrete behavior: primary controls
visible and interactable, dialogs or panels within the viewport, no horizontal
overflow, no overlapping critical controls, keyboard/focus behavior, and
readable empty/loading/error/status states.

Use `assertStablePageLayout` from `scripts/ui-harness.mjs` as the default
layout health check for page-like surfaces. It combines document horizontal
overflow checks with viewport assertions for critical and visible elements, and
returns a compact geometry/focus summary that is included in the harness
manifest result.

Use `assertFocusWithin` for keyboard-focus assertions instead of ad hoc
`document.activeElement` snippets. It treats normal focused descendants and
CodeMirror's `.cm-focused` wrapper as valid, which keeps editor-focused tests
consistent across real browser runs.

Editor changes need real editing coverage, not just a page-open check. At a
minimum, cover first typing, insertion, Enter/Backspace, undo/redo, paste,
autosave persistence, reload consistency, page switching without data loss,
empty-page first typing, large-document scroll stability, and layout geometry.
`npm run smoke:editor-regression-ui` is the first migrated suite using this
harness and should be extended as editing behavior grows.

## Scope By Change Type

Use this matrix to decide what to test.

### Pages And Markdown

When changing page rendering, the editor, Markdown parsing, links, icons,
covers, or embedded blocks:

- Open `Markdown Lab` and edit normal Markdown.
- Switch raw Markdown / live preview settings if the change touches rendering.
- Open `Markdown Showcase` for tables, links, images, task lists, and mixed
  Markdown features.
- Click internal page/database links and verify they navigate through Lotion,
  not the OS file handler.
- Verify the saved `.md` file remains readable plain text.

### Embedded Views

When changing `lotion-view`, page rendering, database cache, or view host code:

- Run `npm run smoke:embedded-view-ui`. The default production lane exercises
  1/3/10 embedded views with 500 rows per database, verifies render latency,
  default `Name`/`Notes`/`Score` order, Open/Refresh/Settings semantics and
  scoped settings traversal, persisted 20/50/100 pagination, and the visible
  `Load 50 more` affordance.
- Its representative screenshot is a deterministic complete-table capture:
  title/subtitle, view tabs, sticky column header, rows 0-7, summary, and the
  real `100 of 500 rows` footer are required to be visible, opaque, owned by
  their expected containers, non-overlapping, and inside the viewport.
  Virtualized spacer rows and rows after the first eight are hidden only during
  capture; runtime pagination and performance assertions still use the full
  dataset.
- Desktop, compact, and wide `embedded-view-table-*.png` baselines are
  checksum-backed and require zero differing pixels in the default production
  gate. Set `LOTION_EMBEDDED_VIEW_SKIP_BASELINE=1` only while intentionally
  preparing and manually reviewing replacement baselines.
- Open `Home` and verify multiple embedded table views render.
- Open `Database Lab` and verify embedded editable tables still work.
- Open `Status Board` for stress-style embedded views.
- Open `Kanban Plugin Test` for an embedded plugin-backed view.
- Use the embedded view's `Open` action and confirm it navigates to the source
  database.
- Edit from an embedded view, then check the full database view shows the same
  data without copying records.

### Databases, Fields, And Records

When changing database storage, field editors, CSV parsing, formulas, row pages,
or schema handling:

- Run `node scripts/smoke-database-created-views-ui.mjs` when changing generated
  views or view persistence. It verifies that `Created date asc` and
  `Created date desc` are created exactly once, keyboard/click switching
  produces the expected row order, the active descending view survives reload,
  serialized filter/resize mutations converge across surfaces, and injected
  write failures roll back.
- After failure verification, the smoke explicitly clears the test filter and
  reloads before visual capture. The complete-surface contract requires the
  database title/subtitle, properties, all three view tabs, active descending
  state, toolbar actions, table header, newest/middle/oldest rows, summaries,
  and `3 of 3 rows` footer to remain visible, opaque, correctly owned,
  non-overlapping, clean of popovers/errors, and inside the viewport.
- Reviewed `database-created-views-{desktop,compact,wide}.png` baselines are
  checksum-backed and permit zero differing pixels. Use
  `LOTION_DATABASE_CREATED_VIEWS_SKIP_BASELINE=1` only while intentionally
  preparing and reviewing a replacement.
- Run `node scripts/smoke-database-interaction-ui.mjs` for the integrated
  settings/filter/sort lane. It waits for the database service and a standalone
  `Tasks` table before interacting, verifies direct-tab and compact
  overflow-menu view switching, persistence/reload and stale-revision conflict
  behavior, and records first-paint/menu/save/switch timings.
- All three settings/filter/sort screenshots wait until their surface
  animations have finished. Their contracts require the surface, phase-specific
  controls, owning standalone table, and active `Default` tab to be visible,
  opaque, correctly owned, non-overlapping, and within the viewport. The
  Settings scope screenshot is the representative committed baseline for each
  viewport; use `LOTION_DATABASE_INTERACTION_SKIP_BASELINE=1` only during
  intentional baseline review.
- Open `Field Type Lab` and edit each supported field type.
- Add a row, edit a cell, and delete a non-critical row in `Tasks`.
- Rename a non-system column and confirm `schema.json` changes while CSV
  headers stay stable field IDs.
- Check select and multi-select dropdowns, option colors, option order, and
  option deletion.
- Open `CSV Edge Case Lab` for commas, quotes, empty values, long text,
  numbers, and booleans.
- Open a row page and confirm row properties and the backing database row stay
  in sync.

### Formulas

When changing formula parsing, evaluation, field settings, or record mutation:

- Open `Formula Lab` and verify arithmetic and multi-branch `CASE WHEN`.
- Open `Tasks` and verify formulas react to `priority` and `status` changes.
- Edit a formula from the column settings surface.
- Confirm formula fields are read-only in cells but editable through field
  settings.

### Views

When changing views, filters, sort, search-in-view, column sizing, or plugin
view providers:

- Open `Tasks`.
- Switch between table views and plugin-backed views.
- Create a new view and rename it.
- Use `View settings` to change visible fields, field order, sort, filter, and
  provider-specific config.
- Confirm all places referencing the same view reflect the change.
- Check that view JSON persists presentation/config only, not copied records.

### Search And Navigation

When changing search, sidebar, tabs, recents, favorites, or routing:

- Use global search for page, database, row, and row-page hits.
- Verify clicking each hit opens the expected Lotion surface.
- Test sidebar search terms listed in `samples/demo-space/TEST_COVERAGE.md`.
- Use back/forward navigation and tab switching after opening mixed surfaces.
- Confirm manual testing does not leave unintended fixture `recents`.
- Run `npm run test:hierarchy` if the change touches parent/path metadata or
  entity identity.

### Backup, Import, And Workspace Files

When changing Git backup, workspace manifest, import, file protocols, icons, or
covers:

- Click `Backup` after a small edit and verify the status message.
- Inspect `git status --short` in the sample workspace when relevant.
- For Notion HTML conversion changes, start with `npm run test:notion-html`.
- For import changes, run the importer on a small fixture and inspect warnings.
- Confirm copied icons/covers use workspace-relative paths and still render
  after reload.

### Performance And Stress

When changing database loading, view-query, virtualization, CSV parsing, or IPC:

- Open the 2K-row fixture for quick UI feedback.
- Open larger generated fixtures only when the code path affects scale.
- Watch console timing logs for database load and view switch regressions.
- Run `npm run test:latency` before finishing changes to database loading,
  view-query, embedded views, search, or editor decorations.
- Use `npm run benchmark:latency` when you need detailed per-view timing output
  while diagnosing a regression.
- Run focused latency checks for the surface you touched:
  - `npm run test:page-open-latency`
  - `npm run test:search-latency`
  - `npm run test:cell-edit-latency`
  - `npm run test:csv-read-latency`
  - `npm run test:rollup-latency`
- Run the corresponding benchmarks when diagnosing a regression:
  - `npm run benchmark:page-open-latency`
  - `npm run benchmark:search-latency`
  - `npm run benchmark:cell-edit-latency`
  - `npm run benchmark:csv-read-latency`
  - `npm run benchmark:embedded-view-ui`
  - `npm run benchmark:editor-scroll-ui`
  - `npm run benchmark:editor-latency`
- Avoid committing regenerated stress data by hand; use scripts.

## Fixture Data Rules

Sample data should map to real MVP use cases, not random examples.

- Add or update `samples/demo-space/TEST_COVERAGE.md` when a new fixture exists
  to test a user workflow.
- Keep sample records small and readable unless the fixture is explicitly for
  scale testing.
- Use deterministic IDs, dates, option colors, and view names.
- Do not commit runtime `recents` written to `samples/demo-space/lotion.json`
  during manual testing.
- If a new field type or view type is added, include at least one fixture that
  persists its schema/config and one page or database route where it can be
  manually inspected.

## Visual QA

For frontend changes, verify at least one desktop-sized Electron window. For
layout-sensitive changes, also check a narrower width.

Look specifically for:

- Text clipped inside buttons, tabs, headers, or compact panels.
- Popovers clipped by scroll/overflow containers.
- Tables or plugin views collapsing to zero height in embedded contexts.
- Layout shifting while hovering, editing, or switching views.
- Empty states, loading states, and error states that still fit the UI.

### Production Visual Gates

- Run `npm run test:production-visual` for the portable deterministic
  PR/release visual gate. It does not require private local workspaces.
- Run `npm run test:production-visual:nightly` for the full local deep gate.
  It requires the named `Lotion Demo Space` and `Notion Import` workspaces,
  runs both through isolated byte-identical clones, and fails instead of
  silently skipping when either prerequisite is unavailable.
- Override the default real-workspace locations with
  `LOTION_REAL_DEMO_WORKSPACE_PATH` and
  `LOTION_REAL_NOTION_WORKSPACE_PATH` when needed.
- Review the generated
  `artifacts/ui-smoke/production-visual-nightly-*/production-visual-nightly.md`
  matrix for fixture/workspace, theme, viewport, screenshot, baseline mode,
  status, and reproduce-command evidence.
- Portable deterministic surfaces use committed perceptual baselines. Private
  real-workspace screenshots use structural contracts and source-safety
  fingerprints; they are not committed as portable baselines.

## Handoff Checklist

Before finishing a change, record:

- What changed.
- Which automated checks passed.
- Which manual surfaces were inspected.
- Any known warnings, skipped checks, or remaining risk.

If a check was skipped, say why. If a bug was found and fixed during manual
testing, mention the final verification, not every wrong turn.
