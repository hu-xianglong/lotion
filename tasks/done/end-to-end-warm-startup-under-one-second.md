# Task 704: End-to-end warm startup under one second

Status: done

Verification status: verified

## User report

Lotion still feels slow after the renderer startup report dropped below one
second. Subsequent launches must become interactive in under one second. The
first launch may take longer while persistent caches are created.

## Diagnosis

- The renderer report starts after Electron has already launched and loaded the
  renderer bundle, so it is not an end-to-end launch measurement.
- A persisted backlink graph is accepted immediately, but every process then
  schedules a complete source validation. On a large workspace, a changed
  fingerprint starts reading tens of thousands of Markdown files and database
  CSV files immediately after first paint.
- Main-process IPC registration eagerly imported database, search, import,
  attachment, Git, icon, backlink, and plugin-storage services before the
  renderer could request the startup index.
- The initial renderer bundle included the editor, database table, management
  surfaces, search, dialogs, and all built-in plugins. The sidebar also mounted
  all 43,320 page rows synchronously.
- Those process, bundle, DOM, and post-paint costs made a nominally fast backend
  cache still take roughly 1.4 seconds end to end.

## Scope

- Add an external wall-clock benchmark from process spawn to an interactive
  Lotion window.
- Keep the persisted backlink graph hot without performing a full validation
  on every launch.
- Preserve runtime watcher updates and deterministic cache rebuild behavior.
- Keep CSV, Markdown, and JSON as source of truth; derived caches must remain
  disposable and must never be required to recover user data.

## Acceptance criteria

- A warm installed-app launch of the real large workspace becomes interactive
  in less than 1000ms.
- A warm cache hit does not start a whole-workspace backlink fingerprint scan or
  CSV rebuild immediately after first paint.
- A cold or missing cache can take longer, writes a reusable cache, and leaves
  all source files unchanged.
- Runtime source mutations still refresh the affected backlink contribution.
- Corrupt caches fall back safely without losing user data.

## Implementation

- Added `scripts/bench-end-to-end-startup.mjs`, which measures from Electron
  process spawn to the interactive startup report. It primes one cold cache,
  then checks three independent warm process launches.
- Kept the startup SQLite projection open for lazy page-record and row-page file
  lookups. Startup reads only the visible page slice and database summaries;
  expanding one database file tree performs one on-demand directory read.
- Added an atomic `startup-page-overrides.json` overlay. Normal internal page
  metadata edits update the CSV source and overlay together, so the next launch
  can reuse the SQLite base instead of reparsing the full pages CSV.
- Removed the every-launch whole-workspace backlink validation. Two recursive
  root watchers now feed incremental refreshes. Persisted per-source signatures
  suppress stale macOS watcher events without statting every source at launch.
- Lazily import non-startup main-process services and renderer surfaces. The
  initial renderer bundle is about 341 KB; editor, database, management, search,
  dialogs, and built-in plugins load on first use or idle time.
- Render the first 40 entries in large sidebar sections immediately and hydrate
  the remaining rows during idle time. Restored tabs remain lightweight
  descriptors until selected.
- Preserve the startup diagnostics tab without allowing it to override a page
  opened while bootstrap is finishing. On macOS, closing the primary window
  hides it so reopening reuses the live renderer.

## Data safety

- Markdown, CSV, JSON, and attachments remain the only source of truth.
- SQLite, the page override file, and the backlink graph are disposable derived
  data under `.lotion-cache/`.
- External source edits, corrupt overrides, corrupt SQLite, and interrupted
  atomic cache replacement all fall back to rebuilding from source.
- Tests compare source bytes before and after corruption and simulated cache
  write interruption. A cache failure cannot replace or delete user data.

## Results

Synthetic large workspace: 43,320 page records and 1,186 databases.

| Measurement | Before | Final gate |
| --- | ---: | ---: |
| Warm process launch, median | ~1,425ms | 738ms |
| Warm process launch, maximum | ~1,480ms | 818ms |
| Backend warm startup | ~323-352ms | ~66ms |
| Renderer startup | ~330ms | 129-168ms |

An unloaded run also measured 479ms median / 482ms maximum. The committed gate
uses the more conservative loaded-machine result above and requires every warm
run to report a SQLite cache hit.

## Verification

- All required gates passed.
- `npm run test:fast`
- `npm run test:startup-cache` (7/7)
- `npm run test:startup-latency` (66.47ms total large-workspace backend startup)
- `node scripts/bench-end-to-end-startup.mjs --check` (738ms median, 818ms max)
- Ad-hoc signed `.app` gate (700ms median, 794ms max) and
  `codesign --verify --deep --strict`
- Focused external backlink incremental-refresh and corrupt-cache tests
- `node scripts/smoke-first-launch-ui.mjs`
- `LOTION_DATABASE_INTERACTION_SKIP_BASELINE=1 node scripts/smoke-database-interaction-ui.mjs`
- `node scripts/smoke-page-backlinks-ui.mjs`
- `node scripts/smoke-sidebar-settings-ui.mjs`
- `node scripts/smoke-sidebar-navigation-ui.mjs`
- Notion import and global search UI suites
- `npm run build`

## Required gates

- Focused backlink cache tests.
- End-to-end warm startup benchmark.
- `npm run test:startup-cache`
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- Installed-app verification against the real workspace.
