# Database Shared Grouping Model

Status: done

Verification status: verified

Priority: P1

Depends on: Database filter expression tree and typed editor; Database sort priority and type semantics

## Goal

Add a reusable group/sub-group contract instead of limiting grouping to
provider-specific Kanban configuration.

## Frontend

- Add Group and Sub-group settings with field picker, group order, hidden
  groups, hide-empty, collapse state, and remove grouping.
- Render grouped table and list sections with counts and group-local New.
- Allow the Kanban provider to adapt to the shared contract.

## Backend

- Add versioned `groups[]` to view JSON and normalize group keys by field type.
- Persist group order/visibility separately from row sort order.
- Sanitize group config after field/type/option changes.

## Acceptance

- Grouped table/list survive reload and preserve hidden/collapsed groups.
- Empty and multi-select values have deterministic buckets.
- Existing Kanban views migrate without data loss.

## Gates

- Group query/migration tests.
- Grouped table/list/Kanban UI smoke.
- `npm run typecheck`, `npm run test:latency`, `npm run build`.

## Delivered

- Added a versioned shared `groups[]` view contract with legacy Kanban migration, field-aware stable bucket keys, multi-select expansion, empty buckets, independent group ordering, visibility, and collapse state.
- Added Group/Sub-group settings for ordering, hidden/empty buckets, collapsed buckets, and grouping removal, with sanitization after schema changes.
- Rendered shared grouped table and list sections with counts and group-local New actions, and adapted Kanban to the same primary-group contract.

## Verification

Verified independently on 2026-07-22 after debugging the delivered implementation.

### Defects found and fixed

- Sub-group configuration was persisted but neither table nor list rendered a
  second level. Added nested sections, independent secondary collapse state,
  and sub-group-local New actions that atomically assign both group fields.
- The Kanban adapter only selected the shared field; it ignored shared order,
  hidden groups, hide-empty, collapse state, multi-select expansion, and stable
  bucket keys. It now consumes the shared grouping engine.
- JSON-serialized multi-select values were split into malformed labels and
  duplicate tokens could duplicate a row inside a bucket. Group parsing now
  accepts JSON and CSV-style values and de-duplicates memberships.
- An explicit `groups: []` incorrectly re-migrated legacy Kanban `groupBy`, so
  removing grouping did not stick. Migration now only occurs when `groups` is
  absent.
- Field type/option edits wrote stale group order, visibility, and collapse
  keys. The field mutation now sanitizes and persists every affected view in
  the same write.
- Group header CSS changed `<td>` to flex layout, breaking `colSpan` and
  producing narrow headings and large blank regions. A table-safe inner flex
  wrapper fixed the layout.
- The grouping smoke claimed desktop/compact coverage while only annotating
  screenshot metadata; the browser stayed at its default viewport. It now
  sets and checks the real 1440×1000 and 1040×820 viewports.
- The smoke was not registered in the UI regression suite and emitted no
  artifact contract. It is now registered and validates its two snapshots,
  interaction flags, phases, dimensions, and image sizes.

### Automated verification

- `node --test test/package-core.test.mjs` — 43/43 passed, including new
  grouping normalization, JSON multi-select, explicit removal, and same-write
  field-option sanitation coverage.
- `node --test test/database-grouping-artifacts.test.mjs` — 1/1 passed.
- `npm run test:renderer-components` — passed.
- `npm run test:fixtures` — passed (11 pages, 13 user databases, 2 system
  databases).
- `LOTION_UI_SUITE_FILTER=database-grouping npm run smoke:ui` — passed with
  nested table/list rendering, sub-group-local New, primary/secondary collapse
  persistence after reload, and shared Kanban hidden/collapsed state; 0 console
  errors, 2/2 required viewports, 2 snapshots, and no missing artifact
  contract.
- `npm run typecheck` — passed.
- `npm run test:latency` — passed; 20k-row slowest view 12.6 ms, 50k-row CSV
  median 50.499 ms / max 87.989 ms.
- `npm run build` — passed; only the existing non-blocking chunk-size warning.
- `git diff --check` — passed.

### Evidence inspected

- UI run: `artifacts/ui-smoke/database-grouping-ui-2026-07-22T18-24-25-062Z/`
- Suite index: `artifacts/ui-smoke/ui-suite-2026-07-22T18-24-19-766Z/`
- Manually inspected the exact desktop grouped-table and compact shared-Kanban
  screenshots. Nested headings span the table correctly, collapsed sections
  remain compact, the hidden Todo Kanban column is absent, and the collapsed
  Done column contains no cards.
