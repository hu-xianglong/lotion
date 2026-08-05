# Row Page Duplicate Latency

Status: done

Verification status: verified

Priority: P0

Source: user report after duplicating a large daily-journal row page

## Goal

Keep row-page duplication responsive when the system pages database contains
tens of thousands of imported page records.

## Reproduction

- The reported source row page contains only 284 lines / 4,063 bytes.
- Its owning database contains 1,167 rows / about 0.7 MB.
- The system pages database contains 43,320 rows / about 30 MB.
- The current duplicate path creates and then updates the new page record
  several times. Each update rewrites the complete system pages CSV, and
  separate page-service caches can also reread the complete CSV after those
  writes.
- The renderer appears frozen while these synchronous duplicate steps finish.

## Acceptance

- Add a focused row-page duplicate benchmark at the reported 43k-page-index
  scale with a 1,167-row source database.
- Preserve the row body and page metadata on the duplicate.
- Create exactly one page-index record for each duplicate.
- Avoid a full system pages CSV rewrite when inserting a new page record.
- Avoid the duplicate path's intermediate empty page record and redundant
  metadata rewrites.
- Keep duplicate median and maximum latency within explicit checked budgets.
- Preserve existing row-menu duplicate/recovery behavior.

## Required Gates

- Focused row-page duplicate latency benchmark.
- Package-core row-page lifecycle tests.
- Database row-menu UI smoke.
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Verification

- Added `scripts/bench-row-page-duplicate-latency.mjs` and included it in
  `npm run test:latency`. The checked fixture contains 1,167 row records,
  43,320 system-page records, a 33,632,933-byte page index, and a 284-line
  row-page body.
- Before the optimized path, an initial same-row-count fixture took
  3,322.210 ms and rewrote the complete page index four times for one
  duplicate.
- The final full latency gate measured 36.704 ms median and 44.295 ms maximum
  across three duplicates. It observed one atomic page-index append per
  duplicate and zero complete page-index rewrites.
- The duplicate path now copies the Markdown file directly, preserves page
  metadata, and inserts the final page record once without first creating an
  empty page record.
- Focused package-core storage/cache and row duplicate/restore tests passed
  (2/2). The full package-core suite was also attempted separately; its two
  existing backlinks watcher tests hit the host `EMFILE` watcher limit, while
  the 50 other tests passed.
- Database row-menu UI smoke passed for desktop and compact layouts, including
  duplicate body/metadata parity, independent edits, failure recovery, delete,
  restore, and permanent delete.
- `npm run typecheck` passed.
- `npm run test:fixtures` passed.
- `npm run test:latency` passed.
- `npm run test:file-boundary` passed.
- `npm run build` passed.
- `npm run test:task-docs` passed before task completion.
- `git diff --check` passed before task completion.

## Independent Verification And Repair — 2026-07-26

- Independent stress reproduction against the new copy/append/rename path used
  an 8 MB existing file and 12 concurrent `appendTextAtomic` calls. Only 1 of
  12 appended rows survived. Each call copied the same old file to a separate
  temporary file, appended its own row, and renamed over the destination, so
  the last rename discarded the other successful appends.
- `FileService` now serializes atomic replacements and atomic appends by
  normalized destination path. Failed operations cannot poison the queue, and
  idle per-path queues are removed.
- Package-core regression coverage uses a 2 MB existing file and verifies that
  all 12 concurrent appends survive. It also verifies ordering across a
  concurrent atomic replacement followed by an append. Re-running the original
  8 MB diagnostic retained all 12/12 rows.
- `PATH=/opt/homebrew/bin:/usr/bin:/bin npx tsc -p tsconfig.main.json &&
  node --test --test-name-pattern='storage, file cache'
  test/package-core.test.mjs` passed (1/1), covering concurrent appends and the
  shared write/append serialization boundary.
- `PATH=/opt/homebrew/bin:/usr/bin:/bin node --test
  --test-name-pattern='database rows duplicate|database batch row actions'
  test/package-core.test.mjs` passed (2/2), covering duplicate, independent
  body edits, delete/restore, and batch lifecycle behavior.
- `PATH=/opt/homebrew/bin:/usr/bin:/bin node --test --test-concurrency=1
  test/package-core.test.mjs` passed outside the restricted watcher sandbox
  (52/52). Inside the sandbox the same run reported `EMFILE` only for the two
  `fs.watch` backlink tests; the unrestricted rerun established this as an
  execution-environment limitation rather than a product failure.
- `npm run test:row-page-duplicate-latency` passed with 43,320 page-index rows,
  33,632,933 bytes, and 1,167 source rows: 40.760 ms median, 42.351 ms maximum,
  3 append writes, and 0 full rewrites.
- `npm run test:latency` passed. The final #698 sample measured 58.880 ms
  median and 76.418 ms maximum across three duplicates, with 3 append writes
  and 0 full rewrites (budgets: 750 ms median / 1,200 ms maximum).
- `npm run smoke:database-row-menu-ui` passed desktop and compact duplicate,
  metadata/body parity, independent edits, recovery, delete/restore, permanent
  delete, and overflow checks. Evidence:
  `artifacts/ui-smoke/database-row-menu-ui-2026-07-26T17-08-39-560Z`
  (2 snapshots, 361,600 bytes).
- `npm run typecheck`, `npm run test:fixtures`, `npm run build`, and
  `npm run test:task-docs` passed. Final `git diff --check` also passed after
  this verification record and queue update.
