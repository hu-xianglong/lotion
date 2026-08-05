# Per-Launch Startup Performance Diagnostics Tab

Status: done

Verification status: verified

Priority: P0

Source: user report that opening the real Lotion workspace feels slow

## Goal

Open one dedicated startup-performance tab after every Lotion launch so the
total startup duration and the slow workspace-loading operation remain visible
after the transient loading screen disappears.

## Acceptance

- Every renderer launch creates exactly one `Startup performance` tab.
- The diagnostics tab is selected after the restored page/database has
  completed its first paint, so the report measures the real restore path.
- The report preserves total duration and the workspace, index, navigation,
  and paint phase durations.
- The index phase separately times page listing, database listing, page-tree
  scanning, favorites, workspace recents, and active-workspace path lookup.
- Each index operation reports a useful item count and highlights the slowest
  operation.
- The diagnostics tab is session-only: it is omitted from persisted tabs and
  does not accumulate after reloads.
- The window-specific diagnostics tab cannot be moved to another window.
- The report is responsive, localized in English and Chinese, keyboard
  reachable, and does not create horizontal overflow.
- A real-workspace launch records enough evidence to identify the current
  startup bottleneck without exposing workspace content.

## Required Gates

- Renderer component coverage for the report and diagnostics tab behavior.
- Focused first-launch Electron smoke on desktop and compact viewports,
  including a second reload and screenshot evidence.
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Delivered

- Added one pinned `Startup performance` tab after the restored item completes
  its first paint.
- Preserved total, workspace, index, navigation, and paint timings after the
  loading screen disappears.
- Split the parallel index phase into page list, database list, page-tree scan,
  favorites, recent items, and workspace-path operations with durations and
  item counts.
- Added a responsive English/Chinese diagnostics surface that highlights the
  slowest index operation and reports the active workspace without showing
  page or database content.
- Kept the report window-local and session-only. It cannot be closed, dragged,
  or moved to another window, and persistence retains the last real content
  tab instead.
- Added component coverage plus desktop and compact Electron coverage across
  two consecutive renderer reloads with screenshot evidence.

## Verification

- `npm run smoke:first-launch-ui` passed desktop and compact viewports, two
  reloads each, with one selected diagnostics tab, six timed operations, no
  persisted diagnostics tab, correct workspace counts, and no horizontal
  overflow. Evidence:
  `artifacts/ui-smoke/first-launch-ui-2026-07-27T16-49-57-894Z/`.
- `npm run test:renderer-components` passed.
- `npm run test:startup-latency` passed; the 100-page fixture median total was
  6.09ms.
- `npm run typecheck` passed.
- `npm run test:fixtures` passed.
- `npm run test:latency` passed; 20k-row views stayed below 14ms, the 50k-row
  CSV median was 43.922ms, and 43,320-row page-index duplication remained
  append-only with a 44.997ms median.
- `npm run build` passed with 2,340 transformed modules.
- Final task-document validation and `git diff --check` are recorded by the
  task commit.

## Independent Verification — 2026-07-27

- Code-path review found that selecting the diagnostics tab from a restored
  content tab rewrites its `item` to `undefined`, turning the pinned report
  into a blank tab.
- Opening a page from the sidebar while diagnostics is selected replaces the
  diagnostics tab itself, so the launch no longer has exactly one startup
  report.
- `switchTab` now retains the refreshed startup item and return-tab identity.
  Navigation while diagnostics is selected now activates and updates its
  content return tab; it never replaces the pinned diagnostics tab.
- `npm run smoke:first-launch-ui` passed desktop and compact viewports with
  two renderer reloads each. The regression now covers content → diagnostics
  re-selection, diagnostics → sidebar page navigation with exactly one
  inactive startup tab, diagnostics re-selection after that navigation, and
  return to the original page. Evidence:
  `artifacts/ui-smoke/first-launch-ui-2026-07-27T16-57-10-906Z/`.
- `npm run test:renderer-components` passed.
- `npm run typecheck` passed.
- `npm run test:startup-latency` passed for 100 pages and 4 databases:
  6.584 ms median total, 22.538 ms maximum total (2,200 ms budget).
- `npm run test:fixtures` passed.
- `npm run test:latency` passed; the 43,320-row page-index duplicate benchmark
  measured 48.486 ms median and 53.648 ms maximum with 3 append writes and
  0 full rewrites.
- `npm run build` passed with 2,340 transformed modules.
- Final `npm run test:task-docs` and `git diff --check` passed after this
  verification record and queue update.
