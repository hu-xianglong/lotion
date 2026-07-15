# Search popup UI latency benchmark

## Goal

Measure the renderer cost of opening global search, receiving a mocked 150-hit
result set, and rendering the default 100 visible results.

## Scope

- Connect to the running Electron/Vite renderer via CDP.
- Mock `window.lotion.search.query` so the script measures popup/render latency,
  not backend ripgrep latency.
- Open the global search dialog through the same window key handler.
- Measure first and repeated query render time until 100 result rows are present.

## Result

- Added `scripts/smoke-search-ui.mjs`.
- Added `npm run smoke:search-ui` and `npm run benchmark:search-ui`.
- The script connects to the running Electron renderer through CDP, chooses the
  first real search query that returns at least 100 hits, opens the global search
  popup, and measures until 100 result rows are mounted.
- Default gate: first and repeated render <= 1500ms. Override with
  `LOTION_SEARCH_UI_RENDER_THRESHOLD_MS`.

## Verified

- `npm run smoke:search-ui`
  - query: `the`
  - hits: 524
  - first render: 505.4ms
  - repeated render: 465.2ms
- `git diff --check`
