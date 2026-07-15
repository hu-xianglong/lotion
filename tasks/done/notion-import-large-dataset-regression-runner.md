# Notion Import Large Dataset Regression Runner

Status: done

## Why

Manual large import testing is slow. We need a single command that reimports a
Notion export into a scratch workspace, audits it, and writes a concise report.

## Completed

- Added `scripts/regress-notion-import.mjs`.
- Added `npm run regress:notion-import`.
- Runner writes JSON and Markdown reports.
- Runner exits non-zero when audit issues are found.
- Existing Notion import regression script now smoke-tests the runner with a
  focused synthetic export.

## Gates

- `npm run build`
- `node scripts/test-notion-import-service.mjs`
- `npm run typecheck`
- `git diff --check`
