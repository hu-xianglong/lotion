# Notion audit checkbox cells

Status: done

## Why

Notion checkbox properties may export as display text such as `Yes`/`No`.
Lotion checkbox cells render from canonical `true`/`false` values, and the
Notion audit should catch regressions where imported checkbox fields store
arbitrary text.

## Scope

- Normalize imported Notion checkbox cells to canonical `true`/`false` where
  possible.
- Treat equivalent checkbox display values as compatible in audit row matching.
- Flag nonblank imported checkbox cells that are not canonical booleans.
- Add a focused import-service regression.

## Gates

- `npm run typecheck`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
