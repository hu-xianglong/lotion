# UI Regression Lab And Renderer Coverage

Status: todo

Decision state: accepted, staged rollout

## Why

The current 80% coverage gate only covers package/core runtime code and builtin
plugins. Renderer/UI code under `src/renderer/**` is not part of that line
coverage target, so visual and interaction regressions can still ship even when
the package coverage gate passes.

We need a production-style UI quality layer that catches the bugs users see:
misaligned properties, awkward date inputs, unclear links, callout/source
rendering regressions, database table interaction issues, and imported Notion
parity gaps.

## Scope

1. Add a UI regression lab.
   - Use Electron/Playwright to open stable fixture pages.
   - Capture screenshots for representative row pages, normal pages,
     embedded databases, callouts, source links, long titles, empty fields,
     date fields, entity references, and sidebar/search states.
   - Store baselines and fail on meaningful screenshot drift.

2. Add renderer component coverage.
   - Introduce renderer test tooling for React components.
   - Cover high-risk components first:
     `RowPageProperties`, `FieldSettingsDialog`, `DatabaseTable`,
     `GlobalSearchPanel`, `PageEditor`, and `PropertyLinks`.
   - Track renderer line coverage separately before deciding whether to enforce
     an 80% threshold.

3. Add explicit UI assertions.
   - Read-only source fields should not render as editable inputs.
   - Editable date fields should align with other property rows and not
     overflow.
   - Source HTML/CSV paths and URL fields should look and behave like links.
   - Callouts should render as callouts, not visible source fences.
   - Missing embedded databases should produce actionable diagnostics.
   - Database table "load more" and row/page links should be visibly clickable.

4. Add Notion import golden UI fixtures.
   - Keep a small, stable imported workspace with known fragile cases.
   - Include nested databases/pages, original Notion HTML/CSV links, attachments,
     empty rows/pages, long Chinese titles, URL fields, date fields, callouts,
     and entity/page references.
   - Validate both imported data and rendered UI against the fixture.

5. Add layered gates.
   - Pre-commit: keep fast package coverage and focused changed tests.
   - Pre-push or manual queue gate: run focused UI smoke and selected screenshot
     checks.
   - Nightly/manual deep gate: run full import golden fixture, full screenshot
     diff, and UI performance checks.

## Suggested First Slice

Start with a small row-page property visual regression suite:

- Open a fixture row page with Original Notion HTML/CSV, date fields, empty
  fields, entity references, and source links.
- Assert read-only/editable differences in the DOM.
- Capture one baseline screenshot of the property panel.
- Add one focused command, for example `npm run test:ui-regression`.

## Verified Progress

Queue item 661 completed this first slice. The deterministic fixture now covers
Original Notion HTML/CSV, text and empty values, select/multi-select,
checkboxes, populated/empty dates, number, and entity reference rows. Its
desktop, compact, and wide property-panel PNGs have committed zero-diff
policies. Runtime and persisted contracts require complete nested geometry,
visibility, label/value alignment, source-link behavior, option-search
click/keyboard behavior, control ownership, and no overflow. A compact
scroll-owner capture bug and duplicate colored option-search pills were fixed
during verification.

Queue item 662 completed the embedded-database slice. The smoke still exercises
1/3/10 embedded views and full 20/50/100 pagination against 500-row databases,
while its deterministic screenshot records the complete header, tabs, sticky
columns, eight representative rows, summary, and real Load-more footer.
Runtime and persisted contracts reject clipped, transparent, overlapping,
mis-owned, offscreen, or horizontally overflowing regions. Reviewed desktop,
compact, and wide PNGs now have checksum-backed zero-diff policies plus a
deliberate pixel-mutation negative test.

Queue item 663 completed the generated-database-views slice. It preserves
idempotent asc/desc view creation, keyboard and click switching, reload
persistence, optimistic mutation convergence, injected failure rollback, and a
clean post-failure recovery. Its persisted complete-surface contract covers the
database header, properties, three tabs, active state, toolbar, three ordered
rows, summaries, and footer. Reviewed desktop, compact, and wide PNGs now have
checksum-backed zero-diff policies plus dirty-popover, clipping/ownership,
missing-baseline, and deliberate pixel-mutation negatives.

Queue item 664 completed the integrated Database Interaction slice and the
default-suite baseline rollout. The smoke now waits for the standalone `Tasks`
database instead of accepting Home's embedded table, waits for the 120ms
settings/filter/sort surface animation to finish, and persists phase-specific
control ownership/opacity/viewport geometry for all nine screenshots. Direct
tab and compact overflow-menu switching, sort persistence, reload, stale
conflicts, fixture breadth, and timing evidence remain covered. Reviewed
Settings-scope PNGs for all three viewports have checksum-backed zero-diff
policies plus transparent-phase, missing-baseline, and deliberate pixel
mutation negatives.

Queue item 666 corrected the renderer coverage evidence itself. The former
130-file denominator double-counted 63 macOS `/Users` and `/private/Users`
source-map aliases. The gate now canonicalizes to the exact current 67-file
TypeScript/TSX inventory, rejects missing/unexpected sources and ambiguous
non-zero aliases, and records raw/canonical/alias counts through production,
nightly, and release artifacts. The corrected verified baseline is 62.78%
lines/statements, 24.67% functions, and 63.44% branches with 63/67 files
executed.

Queue item 667 converted `plugin-host/browser-settings.ts` from a true zero-hit
file into a transactional persistence contract. Failed localStorage writes,
failed deletes, cyclic or special `toJSON` serialization, JSON-lossy values,
malformed loads, reload, isolation, and defensive snapshots are now exercised
against the real renderer source. The file reached 96.49% line coverage, and
the verified aggregate rose to 62.98% lines/statements, 25.22% functions,
63.84% branches, and 64/67 files executed.

Queue item 668 removed the unused `renderer/lib/markdown.ts` basic renderer
instead of manufacturing tests for a code path with no consumer. The active
CodeMirror Markdown path retained its complete desktop/compact UI contract and
zero-diff baseline evidence. The exact renderer inventory is now 66 files,
64 covered, with 63.21% lines/statements, 25.24% functions, and 63.87%
branches.

Queue item 669 hardened the active Create View workflow. Real-source component
coverage now exercises generated names, initial semantics, exact submission
input, synchronous duplicate suppression, non-Error failure normalization, and
retry. The Electron multi-view smoke injects an atomic bundle-write failure in
desktop and compact viewports, submits twice synchronously, proves zero
accidental views, keeps the alerting dialog open, and then proves retry creates
exactly one view. `CreateViewDialog.tsx` reached 86.71% line and 78.57% branch
coverage; the verified aggregate is 63.53% lines/statements, 25.28% functions,
63.98% branches, and 64/66 files executed.

Queue item 670 applied the same persistence discipline to every Property
Manager schema mutation: create, reorder, delete, restore, and permanent
delete. Pure real-source contracts cover filtering, scoped create inputs,
reorder planning, duplicate suppression, failure normalization, retry, and
in-flight dismissal blocking. The desktop/compact Electron smoke proves an
injected atomic write failure creates zero fields and retry creates exactly
one. `PropertyManagerDialog.tsx` reached 85.56% line and 83.33% branch coverage;
the verified aggregate is 63.93% lines/statements, 25.36% functions, 64.35%
branches, and 64/66 files executed.

Queue item 671 hardened every persistent View Context Menu action with one
synchronous single-flight guard, visible failure/retry state, and in-flight
dismissal blocking. The desktop/compact Electron smoke injects an atomic
bundle-write failure, proves two same-tick Duplicate clicks create zero views,
retains the menu and error, and verifies retry creates exactly one.
`ViewContextMenu.tsx` reached 41.08% line, 75% function, and 94.44% branch
coverage; the verified aggregate is 63.99% lines/statements, 25.56% functions,
64.63% branches, and 64/66 files executed.

Queue item 672 hardened Database Settings page-open-mode and lock persistence
with the same synchronous single-flight and recovery contract. The
desktop/compact Electron smoke persists Center peek, injects an exact metadata
write failure, proves two same-tick Lock clicks leave the database unlocked and
the menu recoverable, then verifies retry locks exactly once.
`DatabaseSettingsMenu.tsx` reached 34.45% line, 75% function, and 91.66% branch
coverage; the verified aggregate is 64.00% lines/statements, 25.75% functions,
64.79% branches, and 64/66 files executed.

Queue item 673 hardened every persistent Column Header Menu action with one
synchronous single-flight guard, visible failure/retry state, and pending
dismissal blocking. The desktop/compact Electron smoke injects an atomic bundle
write failure, invokes Duplicate property twice synchronously, proves zero live
and reloaded copies, and verifies retry creates exactly one.
`ColumnHeaderMenu.tsx` reached 46.73% line, 66.66% function, and 90.90% branch
coverage; the verified aggregate is 64.00% lines/statements, 25.87% functions,
64.94% branches, and 64/66 files executed.

Queue item 674 hardened Group Settings save with a synchronous single-flight
guard, visible retained failure/retry state, complete pending control disabling,
and dismissal blocking. The Electron smoke injects a view-write failure, saves
twice synchronously, proves persisted groups remain empty while the two-level
draft stays intact, then verifies retry persists exactly one configuration.
`GroupSettingsDialog.tsx` reached 47.82% line, 40% function, and 90.90% branch
coverage; the verified aggregate is 64.02% lines/statements, 26.00% functions,
65.09% branches, and 64/66 files executed.

Queue item 675 hardened Deleted Rows restore/permanent delete with one
dialog-wide synchronous guard, complete competing-action disabling, visible
failure/retry, and pending dismissal blocking. The desktop/compact Electron
smoke injects a restore bundle-write failure, invokes Restore twice
synchronously, proves the row remains an unresolved tombstone, and verifies
retry restores it exactly once with body and metadata intact.
`DeletedRowsDialog.tsx` reached 63.49% line, 66.66% function, and 80% branch
coverage; the verified aggregate is 64.07% lines/statements, 26.12% functions,
65.16% branches, and 64/66 files executed.

Queue item 676 hardened Row Context Menu rename/duplicate/delete with one
synchronous single-flight guard, visible retained failure/retry, and pending
dismissal blocking. The desktop/compact Electron smoke injects a duplicate
bundle-write failure, invokes Duplicate twice synchronously, proves zero hidden
copies, and verifies retry creates exactly one independent row while retaining
the full Deleted Rows recovery contract.
`RowContextMenu.tsx` reached 64.17% line, 66.66% function, and 90.90% branch
coverage; the verified aggregate is 64.08% lines/statements, 26.25% functions,
65.31% branches, and 64/66 files executed.

Queue item 677 hardened Filter Popover persistence with a synchronous
single-flight guard, local retained failure/retry, pending dismissal blocking,
and owned debounce flushing before close. The desktop/compact Electron smoke
proves a queued value persists before Escape closes the popover, injects a
view-write failure with unchanged revision/value and retained draft, then
invokes Retry twice while dispatching Escape/outside click and observes exactly
one recovered revision. `FilterPopover.tsx` records 66.53% line, 25.71%
function, and 66.66% branch coverage; the verified aggregate is 64.08%
lines/statements, 26.31% functions, 65.41% branches, and 64/66 files executed.

Queue item 678 hardened Sort Popover persistence with a synchronous
single-flight guard, local retained failure/retry, complete pending control
disabling, and Escape/outside-click dismissal blocking. The desktop/compact
Electron smoke injects a view-write failure while changing the active direction
to ascending, proves revision and stored sorts remain unchanged while the draft
stays visible, then invokes Retry twice while dispatching both dismissal paths
and observes exactly one recovered revision. `SortPopover.tsx` records 74.82%
line, 16.00% function, and 84.37% branch coverage; the verified aggregate is
64.10% lines/statements, 26.36% functions, 65.52% branches, and 64/66 files
executed.

Queue item 679 hardened all View Settings persistence actions with one
synchronous single-flight guard, complete pending control disabling, local
failure/Retry state, and backdrop/header/cancel dismissal blocking. Debugging
the real Electron failure uncovered a second race: the bundle rollback changed
the `view` prop and the hydration effect erased the failed local draft. The
dialog now deliberately retains same-view drafts across failed refreshes while
still hydrating idle or switched views, and a competing action cannot replace
the Retry operation. The desktop/compact smoke injects a view-write failure,
submits twice, proves name/revision rollback with the edited name retained,
dispatches backdrop dismissal during both attempts, and observes exactly one
recovered revision. `ViewSettingsDialog.tsx` records 70.41% line, 12.50%
function, and 57.74% branch coverage; the verified aggregate is 64.15%
lines/statements, 26.48% functions, 65.63% branches, and 64/66 files executed.

Queue item 680 hardened Row Template save and delete with a shared synchronous
single-flight guard, retained local error/Retry state, complete pending control
disabling, and backdrop/header/cancel dismissal blocking. The audit also found
that template CSV/Markdown storage bypassed every existing persistence fault
injection, leaving the UI path impossible to verify. The database bundle
failure hook now fails template mutations before their first filesystem write
and reports the normal typed persistence error. Desktop/compact Electron
coverage submits a new template twice under that failure, proves zero stored
templates and a retained name draft, dispatches backdrop dismissal during both
attempts, then proves Retry creates exactly one template and cleans it before
the baseline capture. `RowTemplateDialog.tsx` records 73.50% line, 22.72%
function, and 69.56% branch coverage; the verified aggregate is 64.16%
lines/statements, 26.58% functions, 65.77% branches, and 64/66 files executed.

Queue item 681 hardened every persistent Field Settings action—save, per-view
wrap, and hide—with one synchronous single-flight guard, local retained
failure/Retry state, complete pending control disabling, and
backdrop/header/cancel dismissal blocking. The former save path left the dialog
permanently busy when `onSave` rejected because its state reset was after the
unguarded await. The desktop/compact Electron smoke now injects an atomic
bundle-write failure into a field rename, double-submits, proves the stored
field name and view visibility remain unchanged while the edited name remains
in the dialog, then retries while competing with Hide and backdrop dismissal.
Exactly one renamed field remains visible after recovery.
`FieldSettingsDialog.tsx` records 50.08% line, 18.18% function, and 60.34%
branch coverage; the verified aggregate is 64.17% lines/statements, 26.67%
functions, 65.90% branches, and 64/66 files executed.

Queue item 682 hardened Database Table bulk Apply, Duplicate, and Delete with a
shared synchronous single-flight guard, pending ownership, disabled controls,
and a retained Retry operation for atomic failures. The recovery policy
deliberately keeps service-returned partial row failures non-retryable because
replaying them could duplicate rows or reapply changes that already committed.
The desktop/compact Electron smoke injects an atomic bundle-write failure into
a two-row duplicate, double-clicks the action, proves the stored 160-row
database and two-row selection remain unchanged, then double-clicks Retry and
observes exactly two new copies. `DatabaseTable.tsx` records 45.24% line,
14.20% function, and 49.78% branch coverage; the verified aggregate is 64.21%
lines/statements, 26.77% functions, 65.97% branches, and 64/66 files executed.

Queue item 683 hardened Database View Tabs drag reorder with a synchronous
single-flight guard, retained failure/Retry state, and complete view-control
blocking until an atomic failure is retried or dismissed. The former
fire-and-forget callback swallowed rejection, and a second same-tick drop could
persist a new order after the first request had already reported failure. The
desktop/compact Electron smoke now injects a multi-view write failure,
double-drops Blank review before Default, proves both stored order and every
view revision remain unchanged, then double-clicks Retry and requires exactly
one revision increment. `DatabaseChrome.tsx` records 73.93% line, 32.14%
function, and 57.14% branch coverage; the verified aggregate is 64.24%
lines/statements, 26.83% functions, 66.02% branches, and 64/66 files executed.

Queue item 684 hardened blank, template, grouped table/list, and Kanban row
creation. Group-local New formerly persisted an empty row before a second
fallible assignment write; it now sends validated initial values in the atomic
add. React entries share a synchronous single-flight guard, retained visible
Retry, and competing-control blocking, while Kanban has equivalent
column-local recovery. The Electron grouping smoke injects a bundle-write
failure, double-clicks Add, proves the complete record ID sequence remains
unchanged, then double-clicks Retry and requires exactly one fully assigned
`Todo / Medium` row. `DatabaseTable.tsx` records 46.02% line, 14.91% function,
and 50.61% branch coverage; the verified aggregate is 64.27%
lines/statements, 26.88% functions, 66.09% branches, and 64/66 files executed.

Queue item 685 hardened inline cell persistence with a table-owned serial queue,
synchronous active/tail deduplication, retained visible failure state, and
single-flight Retry or explicit Discard. A failed write now pauses later edits
instead of racing whole-bundle persistence; Retry replays the exact failed head
and resumes in order, while Discard preserves disk and remounts the editor from
the last stored value. The three-viewport Electron interaction lab injects two
real bundle failures per viewport and proves rollback, visible queued count,
duplicate-Retry suppression, ordered persistence, stored-value preservation,
and draft reset. `DatabaseTable.tsx` records 48.58% line, 18.13% function, and
56.02% branch coverage; the verified aggregate is 64.42% lines/statements,
27.27% functions, 66.53% branches, and 64/66 files executed.

Queue item 686 hardened top-level Page Properties tag/date/URL persistence with
a synchronous single-flight controller, retained visible failure/Retry state,
complete property-control blocking, and explicit Discard rollback. The
four-viewport Page Secondary Electron flow injects two real metadata failures
per viewport and proves disk rollback, retained draft, duplicate-Retry
suppression, exact recovery, Discard disk preservation, and draft reset before
restoring the strict history baseline state. `PageProperties.tsx` records
83.02% line, 46.66% function, and 65.00% branch coverage; the verified
aggregate is 64.49% lines/statements, 27.51% functions, 66.70% branches, and
64/66 files executed.

Queue item 687 hardened row-page property persistence with a panel-owned serial
queue, retained visible failure state, inert competing controls, exact Retry,
and explicit Discard rollback. The three-viewport complete-panel Electron suite
injects two real bundle-write failures per viewport and proves stored-value
rollback, retained draft, duplicate-Retry suppression, exact recovery, Discard
disk preservation, editor remount, and restored fixture value. The audit also
identified that successful recovery legitimately changes the system
`updated_time`; strict initial-state visual captures now precede transactional
mutation in the same session, keeping all three committed baselines at zero
pixel difference. `RowPageProperties.tsx` records 87.09% line, 39.13% function,
and 81.03% branch coverage; the verified aggregate is 64.52%
lines/statements, 27.72% functions, 66.73% branches, and 64/66 files executed.

Queue item 688 hardened shared select and multi-select option schema mutations
for both row-page properties and standalone database cells. Color, delete, and
reorder now use synchronous ownership, visible retained failure state, blocked
competing actions and dismissal, exact single-flight Retry, and explicit
Discard. The three-viewport Electron suite injects two atomic field-update
failures per viewport and proves stored-schema rollback, exact retry
persistence, duplicate suppression, discard preservation, control reset, and
normal baseline restoration. The run also caught and fixed inherited
`aria-disabled` on recovery buttons. `RowPageProperties.tsx` records 89.74%
line, 50.00% function, and 81.66% branch coverage; the verified aggregate is
64.53% lines/statements, 27.94% functions, 66.76% branches, and 64/66 files
executed.

Queue item 689 hardened page and row-page title persistence with exact-entity
synchronous ownership, transactional Markdown/metadata rollback, retained
visible failure state, duplicate-safe Retry, and explicit Discard. The
four-viewport Page Secondary Electron suite injects two rename failures per
viewport and proves byte-preserving rollback, exact retry, discard
preservation, two stable Git versions, and five stable backlinks. Stress runs
also found and fixed backlink graph publication across rapid title round trips,
logical-versus-physical page-index path matching, macOS watcher filename
coalescing, and stale Git-history response overwrite. `PageEditor.tsx` records
61.76% line, 32.05% function, and 61.40% branch coverage; the verified
aggregate is 64.57% lines/statements, 28.18% functions, 67.00% branches, and
64/66 files executed.

Queue item 690 hardened shared page/database/row cover reposition persistence
with exact-entity synchronous ownership, retained visual failure state,
duplicate-safe Retry, explicit Discard, and stale-generation invalidation. The
four-viewport Page Secondary suite injects two real metadata failures per
viewport and proves disk rollback, exact recovery, discard preservation,
post-Discard drag reset, TOC-safe cover actions, and baseline restoration.
Stress also exposed and fixed hidden Page Properties recovery feedback.
`CoverArea.tsx` records 68.18% line, 46.15% function, and 82.14% branch
coverage; the verified aggregate is 64.60% lines/statements, 28.40% functions,
67.24% branches, and 64/66 files executed.
