# Backlink Background Incremental Index

Status: done

Verification status: verified

## Why

Page navigation no longer triggers backlink work, and warm backlink reads are
effectively instant. However, the first Page details expansion after its
persisted cache becomes stale still validates and rebuilds the full graph. The
43,000-page manual workspace measured 6.5 seconds for that explicit first load.

## Goal

- Keep Page details responsive on its first expansion.
- Incrementally update the backlink graph when Lotion writes Markdown or
  relation CSV data.
- Detect external file changes without scanning every Markdown file on each
  lookup.
- Keep Markdown and CSV as the source of truth.
- Do not introduce a second SQLite copy of user content.

## Proposed Direction

- Maintain a compact derived manifest of source path, size, and modification
  metadata alongside the existing backlink cache.
- Watch relevant workspace roots while Lotion is running and queue changed
  sources for incremental reindexing.
- Reconcile the manifest in a background worker after startup so filesystem I/O
  and parsing cannot block the renderer or the main IPC path.
- Publish stale cached backlinks immediately while background validation is in
  progress, then refresh the open panel if the graph changes.

## Acceptance

- First Page details expansion stays below 100 ms with a valid persisted cache.
- A changed Markdown link or relation cell appears without a full graph rebuild.
- External edits made while Lotion is open are detected.
- Crash/restart tests prove that stale derived data can be rebuilt without loss
  or modification of user Markdown/CSV content.

## Delivered

- Persisted backlink cache version 2 stores per-source Markdown and relation
  contributions. A valid cache is returned immediately, while full fingerprint
  validation and stale-cache rebuilding run after the lookup path.
- Lotion file mutations and workspace directory watchers queue only affected
  sources for incremental parsing. Imprecise macOS directory events use a
  background, batched metadata reconciliation instead of reparsing the graph.
- Main-process backlink updates flow through IPC/preload to the open Page
  details panel, which refreshes without navigation.
- Corrupt derived data falls back to a complete rebuild; Markdown and CSV
  remain the sole source of truth.
- The page-open benchmark now includes a synthetic 43,000-source persisted
  manifest and enforces both the 100 ms limit and zero source `stat` calls on
  the foreground lookup path.

## Debugging

- Repeated external-edit testing exposed that macOS can report the watched
  directory name instead of the changed child. The watcher now waits for the
  external write to settle, stats candidates in bounded batches, and queues
  only files modified since watcher installation.
- The first 43,000-source run measured 101.424 ms and failed the 100 ms gate.
  Large watcher-route installation was still synchronous; moving that setup to
  the background reduced repeated reloads to 46.655-47.671 ms.
- The first UI artifact run correctly observed the 38→37→38 count transition
  but its evidence helper read `item.title` instead of `item.sourceTitle`.
  Correcting the exact field made the contract describe the observed UI state.

## Verification

Verified on 2026-07-22.

Results:

- `npm run test:page-open-latency` passed three consecutive times. The
  43,000-source persisted-cache reloads were 47.167 ms, 46.655 ms, and 47.671
  ms, with zero foreground source `stat` calls. The normal fixture's persisted
  reload was about 1.2 ms and warm median was 0.063-0.077 ms.
- The focused external-edit/crash regression passed five consecutive runs,
  then passed together with the persisted-cache/internal-write regression 2/2.
  Instrumentation proved the external Markdown refresh parsed only the changed
  source. Corrupt-cache recovery preserved both Markdown and CSV bytes.
- `LOTION_UI_SUITE_FILTER=page-backlinks npm run smoke:ui` passed desktop and
  compact viewports with two screenshots, 74,956 image bytes, zero console
  errors, and a passed artifact contract. While the panel stayed open, an
  external edit removed and restored the source without navigation (38→37→38).
  Artifact index: `artifacts/ui-smoke/ui-suite-2026-07-22T21-29-09-927Z/ui-suite-artifacts.json`.
- `node --test test/ui-harness-artifacts.test.mjs` passed 76/76 before the
  additional negative external-refresh contract assertion; that updated file
  was rerun as part of final verification.
- `npm run typecheck` and `git diff --check` passed.
