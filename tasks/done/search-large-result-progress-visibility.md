# Search Large-Result Progress Visibility

Status: done

Priority: highest

Reported by user: searching for terms like `每日习惯` can produce tens of
thousands of results, and the UI needs visible progress instead of feeling stuck.

## Goal

Make global search feel production-ready for very large result sets by showing
clear progress/loading feedback, keeping input and keyboard navigation
responsive, and avoiding visual overload when many results match.

## Acceptance

- Add a visible search progress indicator for large or long-running searches.
- Progress must communicate useful state, such as searching/indexing/loading
  batches, visible result count, total or capped result count when known, and
  completion/error state.
- The search panel must remain responsive while a query like `每日习惯` returns
  thousands or tens of thousands of matches.
- Avoid rendering all results at once. Keep or add virtualization, batching, or
  an explicit result cap with clear copy so the UI does not freeze.
- Preserve Notion-like search ergonomics: typed query stays editable, Escape
  closes, arrow keys still move selection, Enter opens the selected result, and
  filters/badges remain visible.
- Add clear empty/loading/error/partial-results states.
- Ensure no horizontal overflow, no overlapping result rows/progress text, and
  readable progress UI across desktop and compact viewports.

## Required Tests

- Add or extend coded search UI smoke coverage with a deterministic fixture that
  returns at least 10,000 matches for `每日习惯`.
- The frontend test must assert the progress indicator appears while the large
  search is pending and transitions to a completed/partial/capped results state.
- The test must assert the input remains editable during the large search and
  keyboard navigation still works.
- The test must assert large-result rendering stays under a documented latency
  budget and does not mount thousands of DOM rows at once.
- Include multi-resolution UI assertions for desktop and compact viewports.
- Add or extend search latency benchmark coverage if backend/indexing behavior
  changes.
- Add renderer/component coverage if the progress UI is factored into a
  testable component.

## Gates

- `node --check scripts/smoke-search-ui.mjs`
- `npm run typecheck`
- `npm run smoke:search-ui`
- `npm run test:search-latency`
- `npm run test:renderer-components`
- `git diff --check`

## Result

- Added a visible global-search progress/status strip with loading, empty,
  recent, complete, and partial/capped-result states.
- Large result sets now explain how many results are visible, whether the result
  set is truncated, and that only the visible batch is mounted so the input stays
  responsive.
- Typed search now clears stale results while a new query is pending, resets the
  selection/scroll state, and keeps the search input focused and editable.
- Search result rendering now converts only the visible command/result rows into
  render items instead of mapping every returned hit when a query produces
  thousands of matches.
- Extended `smoke-search-ui` with a deterministic 10,000-result harness for
  `每日习惯`, desktop and compact viewport coverage, pending-input editability,
  progress-state assertions, keyboard navigation, jump-to-line behavior, latency
  thresholds, and DOM row cap checks.
- Updated renderer component coverage for the new search progress states.

## Verification

- `node --check scripts/smoke-search-ui.mjs`
- `npm run typecheck`
- `npm run smoke:search-ui`
- `npm run test:search-latency`
- `npm run test:renderer-components`
- `git diff --check`
