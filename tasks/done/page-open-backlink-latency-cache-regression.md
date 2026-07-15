# Page Open Backlink Latency Cache Regression

Status: done

Priority: highest

Reported by user: opening pages sometimes stalls. The suspected hotspot is
backlink loading/recomputation while switching between pages.

Latest user bug: opening the page `[SP][总][重要] 自己创业` is very slow.
User explicitly requested this be handled by the existing task, not fixed in
this monitor thread.

## Goal

Protect page switching with a production-style frontend regression, then remove
the root cause of page-open stalls. If backlink scanning is confirmed as the
hotspot, add a deterministic local backlink cache/index so opening pages does
not repeatedly recompute the full workspace graph.

## Acceptance

- Add a coded frontend smoke/regression that opens a backlink-heavy fixture
  workspace and clicks through many different pages in sequence.
- The frontend regression must include a deterministic seeded run that opens
  100 randomly selected pages and records per-page open latency.
- The 100-page run must include `[SP][总][重要] 自己创业` at least once. If the
  exact manual-test/imported workspace page is unavailable in CI, build a
  fixture page with the same title and enough large/backlink-heavy imported
  content to reproduce the same class of stall, and record why.
- The test must use real UI navigation where practical, not only direct API
  dispatches. It should cover at least desktop and compact viewports.
- The test must assert concrete user-visible behavior for every page switch:
  title/editor content changes to the target page, the editor stays usable, no
  long blank/loading state, no console/page errors, no horizontal overflow, and
  page-open latency stays under a documented threshold. It must report p50,
  p95, max, slowest page title/id, and whether the slowest page is backlink-heavy.
- The fixture should include enough cross-links and property/entity references
  to stress backlinks, plus pages with no backlinks to catch unnecessary global
  recomputation.
- Instrument or capture timings around page open and backlink loading so the
  result proves whether backlinks are the culprit.
- If backlinks are the culprit, implement a local persisted backlink cache/index
  using SQLite or a CSV/JSON-style workspace cache file, with a documented choice
  and no hard dependency on network services.
- Cache/index behavior must be deterministic and safe: rebuild from workspace
  files, incremental update on page/row markdown changes, invalidation on import
  or missing/stale cache, fallback to direct scan when corrupt, and no stale
  backlinks after edits/deletes.
- Backlink panel UX must remain correct: counts, excerpts, source labels, and
  click-through navigation match uncached results.

## Required Tests

- Add or extend a shared Electron/Playwright UI harness smoke, preferably a
  focused page-open/backlink navigation smoke rather than a one-off script.
- Add a focused frontend performance smoke such as
  `scripts/smoke-page-open-latency-ui.mjs` that opens 100 seeded-random pages,
  including `[SP][总][重要] 自己创业`, and fails when the documented latency budget
  is exceeded.
- Add backend/package-core tests for backlink cache/index build, read,
  invalidation, stale/corrupt fallback, and parity with the existing backlink
  scanner.
- Add a latency benchmark or gate for repeated page opens across backlink-heavy
  and backlink-light pages.
- If SQLite is used, tests must run without requiring a user database server or
  external service. If CSV/JSON is used, tests must cover atomic write/rebuild
  behavior.

## Gates

- `node --check <new-or-updated-page-open-ui-smoke>`
- `npm run typecheck`
- focused backend/package-core backlink cache test
- focused repeated page-open UI smoke across desktop and compact viewports
- focused page-open/backlink latency benchmark
- `git diff --check`

## Result

- Implemented a workspace-level persisted backlink graph cache at
  `.lotion-cache/backlinks.json`, keyed by a deterministic fingerprint of page
  markdown and database table/schema file stats.
- Backlink lookup now builds the workspace graph once, reuses memory/disk cache
  for warm page opens, invalidates when markdown or database files change, and
  falls back to rebuilding when the cache is missing or stale.
- Added package-core coverage for build, disk reuse, markdown invalidation, and
  database relation invalidation.
- Extended the page-open latency benchmark with backlink-heavy and backlink-light
  lookups. Latest focused run: 120 source pages + 60 relation rows, 180 target
  backlinks, first build about 28ms, warm lookup median about 2.5ms.
- Extended the multi-resolution UI smoke to open a backlink-heavy fixture at
  desktop and compact widths, verify the backlink panel, keyboard navigation,
  editor usability, no horizontal overflow, and a deterministic 100-page seeded
  navigation run including a `[SP][总][重要] 自己创业` fixture page.

## Verification

- `node --check scripts/smoke-page-backlinks-ui.mjs`
- `node --check scripts/bench-page-open-latency.mjs`
- `npm run typecheck`
- `node --test test/package-core.test.mjs`
- `npm run test:page-open-latency`
- `npm run smoke:page-backlinks-ui`
- `git diff --check`
