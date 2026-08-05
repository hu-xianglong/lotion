# Task 705: Cold startup index cache under one second

Status: done

Verification status: verified

## User report

The installed Build 35 can report about five seconds in `Read workspace
index` even though the warm-process benchmark reports less than one second.
The real workspace diagnostics showed:

- 5.04 seconds total startup;
- 4.94 seconds in `Read workspace index`;
- 4.92 seconds in `Restore startup index`;
- 300 top-level pages and 1,186 databases.

## Reproduction

The persistent cache is a 45.7 MB sql.js database inside the synced workspace.
sql.js reads the entire file into memory before querying it. A subsequent
launch measured 426.1 ms total and 176.2 ms for the index, confirming that the
five-second result is a cold file/cache path rather than source validation.

The end-to-end benchmark also primes the cache in the parent process before
launching Electron, which warms the file and does not guard the diagnostics
operation itself.

## Requirements

1. Put rebuildable startup caches in machine-local application data, keyed by
   canonical workspace path. Markdown, CSV, and JSON remain source of truth.
2. Keep the startup SQLite projection small. Store row-page snapshots in a
   generation-addressed sidecar with a lazy offset index so startup does not
   read the complete row-page cache.
3. Preserve source fingerprint invalidation, atomic replacement, mutation
   overlays, external-edit fallback, and crash safety.
4. Ensure expanding a database and opening a cached row page do not parse the
   system pages CSV on a valid cache hit.
5. Make the full-process benchmark fail when the renderer startup report or
   workspace-index operation exceeds one second, cap the startup SQLite
   projection size for the 43,320-record fixture, and keep a separate 1.2
   second ceiling for occasional operating-system process-launch scheduling.
6. Verify the installed app against the real Lotion workspace, including the
   first launch after cache creation and repeated launches.

## Required gates

- `npm run typecheck`
- `npm run test:startup-cache`
- `npm run test:startup-latency`
- `npm run test:startup-e2e`
- `npm run test:fast`
- `npm run build`
- focused installed-app launch against the real workspace
- `git diff --check`

## Data safety

Cache files are disposable derived data. Cache write failure, missing sidecars,
corrupt sidecars, external source edits, and interrupted replacement must fall
back to CSV/Markdown/JSON without rewriting or losing source data.

## Result

- Replaced the 45.7 MB workspace-local sql.js startup database with a
  machine-local split cache keyed by canonical workspace path.
- Reduced the real workspace's startup SQLite projection to 638,976 bytes.
- Moved 43,320 row-page snapshots into generation-addressed NDJSON and offset
  index sidecars that are read only when a database or row page needs them.
- Preserved cache invalidation and local mutation overlays while making cache
  replacement crash-safe. The previous generation remains valid until the new
  SQLite file has been swapped successfully.
- Removed the legacy workspace-local startup cache after the local cache was
  persisted. The workspace keeps only its unrelated backlinks cache.
- Expanded the benchmark to gate every renderer startup report and workspace
  index operation below one second, cap the SQLite projection at 12 MB, and
  report full-process launch variance separately.

## Verification

- `npm run typecheck`
- `npm run test:startup-cache`: 10/10 passed, including corruption, missing
  sidecars, external edits, create/delete overlays, and interrupted writes.
- `npm run test:startup-latency`: 43,320 records / 1,186 databases completed in
  67.8 ms; index 18.9 ms; first cached row page 46.2 ms; no system-pages CSV
  navigation reads.
- `npm run test:startup-e2e`: 680 ms median full-process startup, 991 ms max;
  renderer startup 127.5-130.4 ms; workspace index 45.7-51.1 ms; SQLite
  projection 593,920 bytes.
- `npm run test:fast`
- `npm run build`
- Installed Build 36 against the real Lotion workspace: 742 ms median and
  810 ms max full-process startup across three measured launches.
- Real Application Support profile after an intentional source-change rebuild:
  223.5 ms total startup, 113.9 ms index phase, 57.9 ms workspace-index
  operation, and 50.9 ms cache read.
- Real workspace source hashes for `lotion.json` and the system pages CSV were
  identical before and after cache generation and installed-app testing.
- `git diff --check`

### Verified follow-up: lazy record corruption (2026-07-27)

- Debug review found that sidecar files and offsets were size-checked, but an
  individual NDJSON record could be replaced with same-size valid JSON and be
  trusted instead of falling back to source.
- Added a SHA-256 digest to every lazy record index entry and verify it before
  parsing a requested snapshot. Bumped the cache/row-store schema so existing
  unchecksummed caches rebuild once from source.
- `npm run test:startup-cache`: 11/11 passed. New coverage replaces a cached
  row snapshot with same-size valid JSON, observes the checksum mismatch, and
  verifies the row title/body are recovered from source without modifying the
  system pages CSV.
- `npm run test:startup-latency`: passed; 43,320 records / 1,186 databases
  completed in 105.0 ms total, 26.3 ms index, and 76.0 ms first cached row
  page, with zero system-pages CSV navigation reads.
- `npm run test:startup-e2e`: passed outside the filesystem sandbox because
  the harness requires a loopback listener; 829 ms median / 1,134 ms maximum
  full-process launch, 47.3-51.5 ms workspace index, and 593,920-byte SQLite
  projection.
- `npm run typecheck`: passed.
- `npm run test:fast`: passed outside the filesystem sandbox. Two sandboxed
  attempts failed only with `EMFILE: too many open files, watch` in unrelated
  recursive-backlink watcher tests; the unrestricted required gate passed all
  suites.
- `npm run build`: passed as part of `npm run test:startup-e2e`.
- `git diff --check`: passed.
