# Resolve Imported Database Collection Placeholders

Status: done

## Why

Imported Notion pages can still show placeholders like
`📂 问题列表 (database not found)` for nested/linked database views. Those should
resolve to `lotion-view` blocks when the referenced database exists elsewhere
in the export.

## Scope

- Reproduce the unresolved `问题列表` placeholder from the imported workspace or
  a focused fixture.
- Fix the importer/converter collection resolver so linked database views can
  map to the correct database.
- Add a regression test that fails on the placeholder and expects a
  `lotion-view` block.

## Gates

- `npm run typecheck`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
