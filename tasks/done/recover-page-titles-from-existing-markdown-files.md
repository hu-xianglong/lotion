# Recover Page Titles From Existing Markdown Files

## Context

The imported workspace could show hundreds of `Untitled` pages in the sidebar
and All pages management view even though the corresponding Markdown files still
existed with meaningful title-based filenames.

The failure mode was a partial pages database record: `title` was `Untitled`
and `body_path` was empty, while `databases/system/pages--db_pages/pages/*--id.md`
still existed.

## Changes

- Recover default page `body_path` by scanning the system pages folder for
  Markdown files ending in the page id.
- Recover `Untitled` page titles from the Markdown heading when present, or from
  the title part of the Markdown filename.
- Use the same fallback when a manifest page id has no usable pages database
  metadata yet.
- Added package-core regression coverage for a damaged pages database record
  that can be repaired from an existing Markdown file.

## Verification

- `npm run typecheck`
- `npm exec tsc -- -p tsconfig.main.json`
- `node --test test/package-core.test.mjs`
- `git diff --check`
- Dry-run on a temporary copy of the user's `Import Notion` workspace:
  306 damaged `Untitled` page records were recoverable from Markdown files; the
  repaired copy reported 306 pages with only 1 remaining `Untitled`.
