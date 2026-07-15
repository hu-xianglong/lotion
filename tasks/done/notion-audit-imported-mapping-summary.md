# Notion Audit Imported Mapping Summary

## Goal

Make the Notion audit summary distinguish whole-workspace totals from rows and
databases that are actually mapped back to the Notion source export.

## Scope

- Add imported database and imported row/page mapping counts to the audit
  summary result.
- Show those counts in the Notion Import audit UI.
- Assert the focused UI smoke reports the deterministic imported mapping count.

## Gates

- [x] `npm run typecheck`
- [x] `node scripts/test-notion-import-service.mjs`
- [x] `npm run smoke:notion-import-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
