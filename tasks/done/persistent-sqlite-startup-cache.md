# Persistent SQLite Startup Cache

Status: done

Verification status: verified

Priority: P0

Source: user request to trade additional disk usage for faster repeated starts

## Goal

Serve repeated startup index reads from a durable, rebuildable SQLite cache
while preserving CSV/Markdown as the sole source of truth.

## Design

- Store the cache at `.lotion-cache/startup.sqlite`.
- Cache top-level page metadata, database summaries, and row-page file
  mappings needed by the initial sidebar/index render. Top-level page body
  paths also prime the first editor open without parsing the page CSV again.
- Store cache schema/version and source signatures inside SQLite.
- Validate only the manifest, pages schema/data, and database schema source
  signatures required by the cached projection.
- Rebuild from CSV/JSON whenever the cache is absent, corrupt, incompatible,
  or stale.
- Write a complete replacement database to a temporary file and atomically
  rename it into place. Never update source files from cached values.

## Acceptance

- A warm process restart at the 43,320-page / 1,186-database scale completes
  the startup index in under one second.
- Cache hits do not parse the pages CSV or read every database schema.
- Direct external edits to the manifest, pages CSV, or a database schema
  invalidate the cache and appear on the next startup.
- Cache corruption and incompatible versions fall back to source data without
  modifying or losing user data.
- An interrupted cache write leaves either the previous valid cache or a
  rebuildable miss.
- Source mutations through Lotion invalidate or refresh the projection before
  stale results can be returned.
- Record cache status, reason, byte size, and timing in startup diagnostics.

## Required Gates

- Focused cache hit/miss/invalidation/corruption/crash tests.
- Checked real-scale cold-build and warm-hit startup benchmark.
- Existing source consistency and external-edit tests.
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Verification

- Added `StartupIndexCacheService` backed by `sql.js` with schema-versioned
  SQLite tables for source fingerprints, page snapshots, database summaries,
  and row-page file mappings.
- Combined the renderer's three duplicate startup reads into
  `workspace.getStartupIndex()` while retaining the existing public list/tree
  APIs for compatibility.
- Cache hits validate the pages schema/data and all user database schemas with
  bounded concurrent metadata reads. No source CSV/JSON contents or Markdown
  bodies are read on a hit.
- Cache replacement uses `FileService.writeBufferAtomic`; interrupted writes
  leave the prior cache intact. Corrupt, missing, incompatible, or stale
  caches rebuild exclusively from CSV/Markdown/JSON source data.
- `test/startup-index-cache.test.mjs`: 4/4 passed, covering clean hits,
  direct external CSV/schema/manifest invalidation, corruption recovery,
  failed atomic replacement, and byte-for-byte source preservation.
- Synthetic real-scale benchmark (43,320 page-index records, 1,186
  databases): warm index 18.207ms, first page 1.815ms, total backend cycle
  22.277ms, zero index Markdown reads, and unchanged source files.
- Real 6.3GB workspace (43,320 page-index records, 1,186 databases): first
  rebuild 3,984.9ms; subsequent backend cycles 68.8ms and 83.6ms. Warm index
  reads were 64.2ms and 77.9ms, schema validation was 8.4-9.6ms, and the
  persisted cache was 4,980,736 bytes.
- Electron first-launch/reload smoke passed at desktop and compact viewports,
  including visible cache diagnostics and editable first-page restoration.
- Passed `npm run typecheck`, `npm run test:startup-cache`,
  `npm run test:startup-latency`, `npm run test:renderer-components`,
  `npm run smoke:first-launch-ui`, the 60/60 core/API/import suite,
  `npm run test:file-boundary`, `npm run test:fixtures`,
  `npm run test:latency`, `npm run build`, `npm run test:task-docs`, and
  `git diff --check`.
