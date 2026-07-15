# Embedded database first render latency benchmark

## Goal

Measure page navigation latency until embedded database views are mounted for
pages containing 1, 3, and 10 `lotion-view` blocks.

## Scope

- Generate an isolated temporary workspace for each count.
- Open the temporary workspace in the running Electron renderer, starting on a
  blank page so the embedded databases are not preloaded.
- Navigate to the embedded page via the same `lotion:open-entity` event used by
  link widgets.
- Wait for the expected number of `.embedded-table` mounts and record elapsed
  time.
- Restore the previous workspace after the smoke run.

## Result

- Added `scripts/smoke-embedded-view-ui.mjs`.
- Added `npm run smoke:embedded-view-ui` and
  `npm run benchmark:embedded-view-ui`.
- The smoke creates isolated temporary workspaces for 1, 3, and 10 embedded
  database views, starts on a blank page, navigates to the embedded page, waits
  for `.embedded-table` mounts, and restores the previous workspace in `finally`.
- Checked threshold: each scenario <= 1000ms.

## Verified

- `npm run smoke:embedded-view-ui`
  - 1 embedded view: 109.5ms
  - 3 embedded views: 199.4ms
  - 10 embedded views: 373.2ms
- Confirmed Electron restored to `Import Notion` workspace after the smoke.
- `git diff --check`
