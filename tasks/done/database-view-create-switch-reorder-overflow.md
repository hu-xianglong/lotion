# Database View Create Switch Reorder And Overflow

Status: done

Verification status: verified

Priority: P0

Depends on: Database view transactional persistence; Database settings menu shell

## Goal

Make view creation and switching deliberate and scalable instead of cloning the
current view immediately from `+`.

## Delivered

- Added a create-view dialog that asks for name, layout type, and whether
  to start empty or duplicate the current view.
- Added drag reorder, active state, keyboard switching with focus movement, and a `{n} more`
  overflow menu at narrow widths or high view counts.
- Added icon+text, text-only, and icon-only tab display as a per-database local preference.
- Surfaced live ordered views beneath the active full-page database in sidebar navigation.

- Persisted a stable per-view `position` and added an atomic reorder API with
  complete, unique view-id validation.
- Extended create-view input with layout type and explicit empty/duplicate
  source mode. Empty views never inherit filters or sorts.
- Normalized names, positions, deletion fallback, and default-view ordering.
- Exposed ordered view summaries for sidebar shortcuts through database lists.

## Acceptance

- Creating a blank table view does not inherit hidden filters/sorts.
- Reordered tabs and overflow order survive reload.
- Compact layouts keep the active view visible and usable.

## Verification

- Focused database service create/duplicate/order/default tests.
- `node --test test/database-multi-view-artifacts.test.mjs`
- `npm run smoke:database-multi-view-ui`
- `npm run test:renderer-components`
- `npm run test:customer-api`
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run build`
- `git diff --check`

### Verified evidence — 2026-07-22

- The desktop and compact smoke created a duplicate through the real dialog
  and proved its sort/visible fields matched the source, then created an
  explicit blank list view and proved it inherited no filters/sorts. It grew
  the database to eleven views and exercised overflow selection, drag reorder,
  renderer-order convergence, ArrowRight switching with focus movement, all
  three label-display modes, sidebar view shortcuts, reload persistence, and
  zero horizontal overflow.
- Debugging found and fixed two regressions before verification: keyboard tab
  switching changed selection without moving focus, and a seventh long tab
  rendered beneath `.view-tab-actions`, making the next `+ New view` control
  unclickable. The smoke now repeats view creation and asserts focus plus the
  final active layout so both failures remain covered.
- Backend coverage proves explicit empty/duplicate semantics, unique names and
  IDs, complete/duplicate/unknown reorder rejection, persisted positions, and
  a valid persisted fallback default after deleting the current default.
- The two required screenshots and metadata passed the artifact contract
  (213,966 image bytes total), with zero console errors and zero missing
  artifact contracts. Evidence:
  `artifacts/ui-smoke/database-multi-view-ui-2026-07-22T16-49-18-942Z/`
  and `artifacts/ui-smoke/ui-suite-2026-07-22T16-49-13-978Z/`.
- TypeScript, fixtures, renderer/customer API regressions, production build,
  and diff whitespace checks passed. The build emitted only the existing
  large-chunk advisory.
