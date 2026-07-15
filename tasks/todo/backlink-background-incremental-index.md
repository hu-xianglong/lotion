# Backlink Background Incremental Index

Status: todo

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
