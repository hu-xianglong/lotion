# Startup Validation Fast Path

Status: done

Verification status: verified

Priority: P0

Source: user report that reopening a real Lotion workspace remains slow

## Goal

Remove redundant source-file validation and duplicate index work from the
startup path without weakening user-data safety or changing CSV/Markdown
source-of-truth semantics.

## Reproduction

- The real workspace contains 43,320 system-page records, 1,186 databases, and
  a roughly 23 MB page-index CSV.
- Parsing the page-index CSV takes well under one second, while startup index
  loading takes tens of seconds.
- Every fresh `PagesDatabaseService` currently checks each stored body path by
  reading the Markdown file, and page, database, and row-page services each
  construct their own page-index service.
- Database summaries and the page tree are also requested concurrently and
  repeat schema/view and directory work.

## Acceptance

- Do not read or stat every valid Markdown body during startup.
- Recover missing title/body-path metadata from the page directory only for
  records that require recovery.
- Keep legacy body lookup and migration on the actual page-open path.
- Share one page-index service between page, database, and row-page services in
  each runtime.
- Coalesce concurrent database-summary reads and bound independent filesystem
  reads without changing result order.
- Preserve direct external CSV edits, legacy body recovery, and lazy row-page
  behavior.
- A clean startup must not rewrite source CSV, Markdown, schema, view, or
  manifest files.
- Add a real-scale regression fixture with at least 43,000 page-index records
  and focused operation-count/performance assertions.

## Required Gates

- Focused package-core startup/source-safety tests.
- Checked real-scale startup latency benchmark.
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Verification

- The checked 300-page / 43,320-page-index-record / 1,186-database fixture
  reduced startup index time from 5,110.017 ms after the initial body-check
  removal to 1,594.139 ms after removing view preloads, directory scans, and
  duplicate page conversions. The pre-change real-workspace baseline was
  substantially slower still because it also performed per-body checks.
- The real-scale gate observed zero Markdown reads during index loading and
  byte-for-byte plus mtime equality for the manifest, pages schema, pages CSV,
  and default view across a clean cold-service startup.
- Page, database, and row-page services now share one page-index service per
  package/Electron runtime. Concurrent page/database lists share in-flight
  work, and database schema reads use bounded concurrency while preserving
  manifest order.
- Database summaries no longer preload every view. Opening a database still
  loads its complete bundle and publishes the live ordered views to the
  sidebar.
- Page-tree row files are derived from `database_id`, `page_file`, and
  `body_path` in the authoritative pages CSV. The customer API regression
  verifies that a materialized row page appears in the tree.
- The core package, customer API, and Notion import suites passed 60/60,
  including external CSV recovery, legacy body migration, row-page lifecycle,
  and dual Markdown/HTML import.
- `npm run test:startup-latency`, `npm run typecheck`,
  `npm run test:fixtures`, `npm run test:latency`,
  `npm run test:file-boundary`, `npm run build`, and
  `npm run test:task-docs` passed.
- `git diff --check` passed before task completion.
