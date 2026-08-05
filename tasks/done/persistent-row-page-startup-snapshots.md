# Persistent Row-Page Startup Snapshots

Status: done

Verification status: verified

Priority: P0

Source: installed-app measurement after task 702

## Problem

The persistent startup index is a cache hit, but restoring the last-open
database row page still calls `PagesDatabaseService.getMeta()`. That reparses
the 23MB system pages CSV containing 43,320 records. In the real workspace,
this made the navigation phase take 1,426.6ms and total startup take 1,710.9ms
despite a 131.8ms cached index.

## Goal

Extend the rebuildable SQLite startup cache with the lightweight page metadata
and body path needed to restore any row page without parsing the system pages
CSV.

## Design

- Persist one lightweight snapshot for every system page record in
  `.lotion-cache/startup.sqlite`.
- Prime `PagesDatabaseService` from a validated cache hit.
- Serve startup `getMeta()` and `getBodyPath()` calls from the primed snapshot.
- Keep CSV/Markdown as the only source of truth.
- Invalidate the projection on pages CSV/schema changes, cache corruption,
  schema-version changes, and normal source mutations.
- Continue using atomic cache replacement so an interrupted rebuild cannot
  damage source data or the previous valid cache.

## Acceptance

- A validated warm cache restores the real last-open row page without reading
  the system pages CSV.
- External edits to page metadata or body paths appear after restart.
- Cache corruption and failed replacement fall back to source files.
- Source bytes remain unchanged across cache hit, rebuild, and failure cases.
- The installed app opens the real 43,320-page / 1,186-database workspace in
  under one second on a warm cache.

## Required Gates

- Focused startup cache tests including row-page snapshot reads and
  invalidation.
- Real-scale startup latency benchmark with a restored row page.
- `npm run typecheck`
- `npm run test:startup-cache`
- `npm run test:startup-latency`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Verification

- Added a schema-versioned `page_records` table containing lightweight
  metadata and body-path snapshots for every system page record.
- A validated cache hit primes `PagesDatabaseService`; startup `getMeta()` and
  `getBodyPath()` calls no longer parse the system pages CSV. Any page metadata
  mutation clears the process snapshot before subsequent reads.
- `test/startup-index-cache.test.mjs`: 5/5 passed. The suite opens a real
  database row page on a cache hit and asserts zero system pages CSV reads. It
  also covers external body-path edits, cache corruption, failed atomic
  replacement, source invalidation, and source-byte preservation.
- The synthetic 43,320-page / 1,186-database benchmark produced a 24,666,112
  byte cache. Warm index load was 205.997ms, row-page restore was 13.253ms,
  and the complete backend cycle was 223.207ms with zero pages CSV reads.
- The real 6.3GB workspace produced a 45,719,552 byte cache. Two warm backend
  cycles completed in 352.2ms and 322.7ms; row-page restore took 34.2ms and
  32.8ms. Neither warm cycle read the 23MB system pages CSV.
- This task changes startup storage and service behavior but adds no visual
  controls. The existing Startup Performance Electron smoke passed at desktop
  and compact viewports and remains the focused user-visible gate.
- Passed `npm run typecheck`, `npm run test:startup-cache`,
  `npm run test:startup-latency`, `npm run test:fixtures`,
  `npm run test:latency`, `npm run build`, `npm run test:task-docs`,
  `npm run smoke:first-launch-ui`, and `git diff --check`.
