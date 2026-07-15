# Page Navigation Hidden Backlink Scan Latency

Status: done

## Why

Opening a page in the 5.3 GB manual workspace felt slow even after the page body
had rendered. The workspace contains about 43,000 Markdown pages and 1,190
database CSV files. Every page switch eagerly loaded the collapsed Page details
panel, and every backlink lookup recomputed its cache fingerprint by statting all
of those source files.

Observed before the fix:

- first backlink lookup: about 7.5 seconds;
- repeated in-process lookup: about 3.1 seconds;
- page body paint could finish in 7.7 ms while the hidden backlink work continued.

## Expected Behavior

- Switching pages does not load backlinks or Git history while Page details is
  collapsed.
- Expanding Page details loads its data on demand.
- Repeated backlink lookups do not walk every workspace source file when Lotion
  has not changed a relevant file.
- Markdown and CSV remain the source of truth; the optimization does not add a
  second SQLite copy of user data.

## Fix

- Track process-local file mutation revisions at the shared file-service
  boundary.
- Use the relevant workspace subtree revision as an O(1) backlink-cache
  freshness check before computing the persisted-cache fingerprint.
- Keep the existing full fingerprint and persisted backlink cache for startup
  validation and after relevant source writes.
- Load backlinks and page history only when Page details is expanded.
- Make backlink result rows tall enough for title, path, and excerpt content so
  the deferred panel does not render overlapping rows.

## Verification

- [x] Persisted graph correctness test covers Markdown and relation-data edits.
- [x] Page-open benchmark reports zero `stat` calls for warm backlink lookups.
- [x] Warm backlink lookup median is about 0.1 ms in the benchmark fixture.
- [x] Collapsed Page details renders zero backlink rows; expanding renders them.
- [x] Backlink screenshot contract passes on desktop and compact viewports.
- [x] 2,500-line editor scroll smoke reports zero long tasks.
- [x] Manual 43,000-page workspace switches pages in 24-52 ms with zero hidden
  backlink calls.
- [x] A warm Page details backlink lookup completes in 1.3 ms in the manual
  workspace.
- [x] `npm run typecheck`
- [x] `npm run build`

## Boundary

The O(1) revision check observes writes made through Lotion's file-service
boundary. External file changes are fully validated on the next process start;
adding a workspace watcher for same-process external edits is separate work.

The first explicit Page details expansion after a stale persisted cache still
performs the full validation/rebuild. It took 6.5 seconds in the manual workspace
but no longer runs during ordinary page navigation. Background incremental index
maintenance is tracked separately.
