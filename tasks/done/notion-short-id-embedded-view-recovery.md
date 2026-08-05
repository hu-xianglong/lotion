# Task 710: Notion short-ID embedded view recovery

Status: done

Verification status: verified

Priority: P0

Source: production workspace missing imported views reported on 2026-07-29

## Problem

Some Notion HTML exports identify an embedded database snapshot only through a
short CSV href such as `Untitled 13eb-2087.csv`. Lotion currently resolves full
32-character Notion IDs, row IDs, and unique titles, but ignores this short
first-four/last-four ID form. When multiple databases share a title, the import
therefore emits a `database not found` placeholder even though the exact
database was imported.

Existing imported workspaces have already lost the short reference from their
Markdown source, so fixing future imports alone does not repair user-visible
pages.

## Goal

Resolve unambiguous Notion short-ID collection references during import and
provide a crash-safe repair for existing source placeholders using preserved
original HTML, without changing any other user-authored Markdown.

## Acceptance

- Sparse collection snapshots with duplicate database titles resolve by their
  short CSV href to the correct Lotion database.
- Short-ID collisions remain unresolved rather than choosing arbitrarily.
- Both raw and DOM HTML conversion paths expose collection hrefs to the
  resolver.
- Existing `database not found` source placeholders can be repaired from
  preserved original HTML and database source hashes.
- Repair writes are atomic, create recoverable backups, and change only exact
  missing-view placeholder lines.
- A dry run reports resolved, ambiguous, and unresolved occurrences before any
  source file is changed.
- The reported `待办事项` and `问题列表` views in the production workspace render
  as embedded Lotion database views after repair.

## Required Gates

- focused Notion import and recovery regression tests
- real-workspace repair dry run and post-apply verification
- `npm run typecheck`
- `npm run test:fast`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Result

- Added one shared collection resolver for both the in-process and worker import
  paths. It resolves full collection IDs, row ownership, short CSV IDs, and
  unique titles in that order.
- Indexed Notion's first-four/last-four short ID form while excluding every
  collision, so duplicate titles can resolve without introducing a best-guess
  match.
- Exposed collection hrefs from sparse DOM snapshots to the resolver.
- Added a dry-run-first repair command for already imported workspaces. It
  creates byte-for-byte backups before atomic source writes and refuses to
  overwrite an existing repair run.
- Repaired the production workspace using run
  `notion-view-task-710-v2-2026-07-29`: 3,311 placeholders across 1,047 files
  were replaced. A byte-level verifier confirmed all 3,311 planned changes and
  no other source modifications.
- Left 29 non-repairable placeholders unchanged: 25 lacked a unique short ID
  and 4 lacked preserved original HTML.
- Verified the reported page now renders both `待办事项` views and `问题列表` as
  interactive embedded databases instead of missing-view cards.

## Verification

- All required gates passed.
- `npx tsc -p tsconfig.main.json && node scripts/test-notion-view-repair.mjs && node scripts/test-notion-import-service.mjs`
- production repair post-apply dry run: 29 source placeholders, 0 repairable,
  0 changed files
- production repair integrity audit: 1,047 files, 3,311/3,311 planned changes,
  0 unexpected changes
- installed-app UI inspection: no missing-view card and no
  `database not found` placeholder on the reported page
- `npm run typecheck`
- `npm run test:coverage`
- `npm run test:fast`
- `npm run build`
- `npm run test:file-boundary`
- `npm run test:task-docs`
- `git diff --check`
