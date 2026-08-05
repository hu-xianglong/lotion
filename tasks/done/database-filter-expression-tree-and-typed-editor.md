# Database Filter Expression Tree And Typed Editor

Status: done

Verification status: verified

Priority: P0

Depends on: Database view transactional persistence; Database settings menu shell

## Goal

Replace flat, weakly typed filters with a clear typed editor supporting nested
AND/OR logic while reading existing view JSON safely.

## Frontend

- Use field-type-aware operators and editors: select option picker,
  multi-select membership, checkbox true/false, date-relative predicates,
  number validation, empty/not-empty, and relation/entity selection.
- Support simple filters and advanced groups nested up to three levels.
- Add validation, human-readable filter chips, clear-all, and explicit removal.
- Debounce value typing through the transactional mutation controller.

## Backend

- Add versioned `filterExpression` nodes (`group` and `condition`) with stable
  IDs and explicit conjunctions.
- Treat legacy `filters[]` as an implicit AND group and migrate on next write.
- Share evaluator/normalizer logic between renderer tests, main query service,
  plugins, imports, and future windowed row queries.

## Acceptance

- Mixed `(A AND B) OR C` expressions persist, reload, and evaluate correctly.
- Invalid values never silently become a different filter.
- Legacy views render the same records before and after migration.

## Gates

- Filter AST normalization/evaluation/migration tests.
- Advanced typed-filter UI smoke with reload.
- `npm run typecheck`, `npm run test:latency`, `npm run build`.

## Delivered

- Added a versioned filter expression tree with stable group/condition IDs,
  nested AND/OR logic up to three levels, schema normalization, and a shared
  evaluator exported to plugin consumers.
- Preserved legacy flat filters as implicit AND groups and migrated them on the
  next view write while retaining compatibility for simple filter readers.
- Rebuilt the filter editor with nested groups, field-aware operators and value
  controls, validation, debounced valid writes, filter chips, explicit removal,
  and clear-all.
- Added select/multi-select membership, checkbox, number, date/relative-date,
  empty-state, text, URL, and entity-reference semantics.

## Verification

- Filter AST normalization/evaluation/migration service tests.
- `npm run smoke:database-filter-expression-ui`
- `npm run typecheck`
- `npm run test:latency`
- `npm run build`
- `git diff --check`

### Verified evidence — 2026-07-22

- Debugging found that blank condition values evaluated as `true`, so malformed
  persisted input could silently become a match-all filter. Operators invalid
  for a field type could also reach unrelated evaluator branches, and unknown
  operators reused their value after normalization to `is`. Evaluation now
  fails closed for blank or incompatible conditions, while unknown operators
  normalize to an explicitly invalid blank condition instead of changing their
  meaning.
- Focused AST coverage verifies nested `(A AND B) OR C`, legacy migration,
  unknown-field sanitization, number and exact multi-select/entity membership,
  blank-value fail-closed behavior, incompatible and unknown operators, and
  stable legacy condition IDs. The renderer contract was updated from the old
  flat-filter markup to advanced groups, chips, typed inputs, valueless checkbox
  operators, relation/entity search, removal, and group creation.
- The previous smoke's desktop and compact files both captured the same
  1280×788 page and its `typedEditors: true` flag only exercised select fields.
  The rewritten smoke uses fresh workspaces at real 1440×1000 and 1040×820
  viewports. At each size it verifies select, multi-select, checkbox, number,
  relative-date, and text editors; invalid values do not persist; group depth is
  capped at three; chips, explicit removal, and clear-all work; and
  `(Status is Done AND Priority is High) OR Tags contains UI` still returns two
  rows after reload.
- Both screenshots were visually inspected for viewport containment, nested
  group readability, control overlap, removal affordances, and horizontal
  overflow. Evidence:
  `artifacts/ui-smoke/database-filter-expression-ui-2026-07-22T17-33-28-564Z/`
  and `artifacts/ui-smoke/ui-suite-2026-07-22T17-33-22-902Z/` (2 snapshots,
  289,472 bytes, zero console errors, artifact contract passed).
- Passed commands: focused `test/package-core.test.mjs`,
  `test/database-filter-expression-artifacts.test.mjs`,
  `npm run smoke:database-filter-expression-ui`,
  `LOTION_UI_SUITE_FILTER=database-filter-expression npm run smoke:ui`,
  `npm run typecheck`, `npm run test:fixtures`, `npm run test:latency`,
  `npm run build`, and `git diff --check`.
- The repository-wide renderer component command is not claimed as a #622 gate:
  after the updated advanced-filter assertions pass, it currently stops on the
  stale priority-sort assertions owned by queue item #623.
