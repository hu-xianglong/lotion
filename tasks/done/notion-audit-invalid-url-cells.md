# Notion audit invalid URL cells

Status: done

## Why

Imported Notion URL fields should stay directly openable. The audit currently
checks source-file links, but a normal user URL field can still regress into
plain text or a malformed value without a precise issue kind.

## Scope

- Scan imported user `url` fields for invalid URL strings.
- Skip importer-managed source reference fields that are audited separately.
- Add a regression that corrupts one imported URL cell and asserts audit reports
  it.

## Gates

- `npm exec tsc -- -p tsconfig.main.json`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
