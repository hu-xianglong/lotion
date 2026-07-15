# Cell edit commit latency benchmark

## Goal

Measure the backend commit cost after a database cell edit debounce/blur flushes
to disk.

## Scope

- Generate a synthetic workspace with one 20k-row database.
- Exercise `DatabaseService.updateCell` on a normal text field.
- Measure full read/compute/write latency for repeated commits.
- Add package scripts for checked and exploratory benchmark runs.

## Result

- Added `scripts/bench-cell-edit-latency.mjs`.
- Added `npm run test:cell-edit-latency` and
  `npm run benchmark:cell-edit-latency`.
- The benchmark creates a 20k-row database and measures
  `DatabaseService.updateCell` on a normal text field, including full
  read/compute/write commit cost.
- Checked thresholds: median <= 250ms, max <= 500ms.

## Verified

- `npm run test:cell-edit-latency`
  - rows: 20,000
  - median: 61.307ms
  - max: 75.73ms
- `git diff --check`
