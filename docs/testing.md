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
npm run smoke:image-lightbox-ui
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

`withLotionUIHarness` fails by default when renderer `console.error` or
`pageerror` events are observed. Use `failOnConsoleErrors: false` only for a
diagnostic smoke that intentionally exercises this path, and record the reason
in the task notes. `npm run smoke:ui-harness-console-failure` intentionally
emits a renderer console error and verifies the failed manifest plus
`console.json` failure artifact.

For visual-regression slices, use `captureElementSnapshot` with
`assertElementSnapshotBaseline` so screenshots are paired with a CI-readable
manifest check for viewport, geometry range, and required metadata. Pixel-level
diffing can be layered on later; the manifest gate should catch obvious layout
drift without requiring manual screenshot inspection.

Run `npm run smoke:row-page-property-visual-ui` for the focused row-page
property visual lab. It creates a deterministic workspace with Original Notion
HTML/CSV source links, date fields, empty values, entity refs, select/tag
pills, number/text fields, and checkboxes. The smoke captures desktop and
compact screenshots plus DOM geometry metadata so source-link affordances,
value-column alignment, focus behavior, and no-overflow regressions can be
reviewed from CI artifacts.

The row-page property visual smoke also writes a machine-readable artifact
contract into `harness-result.json`. The contract checks that every configured
viewport produced a non-empty screenshot and metadata for source links, date
rows, empty values, entity refs, row count, source-open captures, focus
summaries, and value-column alignment. Run
`node --test test/ui-harness-artifacts.test.mjs` when changing this contract or
the shared screenshot helpers.

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

## Handoff Checklist

Before finishing a change, record:

- What changed.
- Which automated checks passed.
- Which manual surfaces were inspected.
- Any known warnings, skipped checks, or remaining risk.

If a check was skipped, say why. If a bug was found and fixed during manual
testing, mention the final verification, not every wrong turn.
