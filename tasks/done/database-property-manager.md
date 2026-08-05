# Database Property Manager

Status: done

Verification status: verified

Priority: P0

Depends on: Database settings menu shell

## Goal

Provide one searchable database-level surface for creating and managing field
definitions, distinct from per-view property visibility.

## Delivered

- Added property search, type icons, New property, visible/system states,
  and entry into the focused field editor.
- Added drag reorder of schema properties and select-option ordering.
- Explained which changes affect all views versus only the current view.
- Replaced the permanent bottom `New field` form with the manager and a compact
  rightmost-column add affordance.

- Added schema field-order mutation with complete/unique id validation.
- Preserved per-view order/visibility while adding a field; new fields now have
  explicit current-view, all-view, or hidden visibility policy.
- Persisted select-option array order through the focused field editor.

## Acceptance

- A user can find and edit a property without scanning the table horizontally.
- Reordering schema properties does not scramble custom view column orders.
- Creating a property from a view makes its visibility choice explicit.

## Verification

- Focused schema/property-order and scoped visibility service test.
- `node --test test/database-property-manager-artifacts.test.mjs`
- `npm run smoke:database-property-manager-ui`
- `LOTION_UI_SUITE_FILTER=database-property-manager npm run smoke:ui`
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- `git diff --check`

### Verified evidence — 2026-07-22

- Audit debugging invalidated the original evidence: the smoke did not set its
  declared desktop/compact viewports, was absent from the regression suite, and
  its broad reorder assertion could pass after moving the wrong field. A page
  startup race also made the recorded path non-deterministic.
- The replacement smoke opens Tasks through the real sidebar, runs independent
  desktop (1440×1000) and compact (1040×820) workspaces, creates current-only,
  all-view, and hidden properties, proves their exact saved-view membership,
  checks a complete schema-order result after drag reorder, opens the focused
  field editor, and asserts zero horizontal overflow.
- Focused service coverage now proves all three visibility policies, invalid
  current-view rejection, complete/duplicate/unknown schema-order rejection,
  custom per-view order preservation, reload persistence, and select-option
  order persistence.
- Both screenshots were visually inspected: type/state rows, scope explanation,
  search, and controls remain readable at both sizes. The artifact contract
  recorded two required snapshots (346,072 image bytes), zero console errors,
  no missing viewport, and no missing contract. Evidence:
  `artifacts/ui-smoke/database-property-manager-ui-2026-07-22T17-02-29-459Z/`
  and `artifacts/ui-smoke/ui-suite-2026-07-22T17-02-24-137Z/`.
- Focused service and artifact-contract tests, TypeScript, fixtures, latency,
  production build, filtered suite integration, and diff whitespace checks all
  passed. The build emitted only the existing large-chunk advisory.
