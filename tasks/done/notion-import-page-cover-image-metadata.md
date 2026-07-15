# Notion Import Page Cover Image Metadata

Status: done

## Goal

Import Notion HTML page covers into Lotion page, row-page, and database cover
metadata instead of dropping them.

## Scope

- Parse `<img class="page-cover-image">` from Notion HTML headers.
- Preserve the image path/URL and vertical `object-position` offset.
- Write cover metadata to system page records for standalone pages and row pages.
- Carry skipped standalone database wrapper covers onto the imported database.
- Cover the behavior in the focused Notion import fixture.

## Gates

- `npm run typecheck`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
