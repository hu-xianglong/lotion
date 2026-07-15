# Row Property Option Search Affordance

Status: done

## Why

Imported Notion row pages often expose useful select and multi-select
properties, but their values are currently passive once rendered in the row page
property list. Notion makes option/tag values feel navigable; the smallest safe
step for Lotion is to let a user search for the same value from the property
panel without changing field editing behavior.

## Scope

- Add a lightweight search affordance for visible select and multi-select row
  property values.
- Opening the affordance should use the existing global search surface with the
  option value prefilled.
- Preserve existing select/multi-select editing through the field provider
  dropdown.
- Keep source links and relation/entity references unchanged.

## Acceptance

- Row property option values render as clear button-like search affordances.
- Activating an option search opens global search with the selected value.
- A coded multi-resolution UI smoke clicks the affordance in an actual row page,
  verifies global search opens with the option value prefilled, asserts focus,
  visible results/status, and no horizontal overflow at desktop and compact
  widths.
- The renderer/component regression verifies the affordance classes, labels,
  aria names, and source-link fields staying openable/read-only.
- Backend/service tests are not applicable unless data persistence or search
  service behavior changes.

## Gates

- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:row-page-navigation-ui`
- `git diff --check`

## Result

- Added a row-property option search affordance for select and multi-select
  values without changing the existing dropdown editing path.
- Wired the affordance to the existing global search surface with the clicked
  option value prefilled.
- Added renderer/component assertions for the affordance labels/classes and
  source-link fields remaining read-only/openable.
- Extended the row-page navigation UI smoke across desktop and compact
  viewports to click the affordance, assert focused prefilled search results,
  keyboard close behavior, and no layout overflow.
- Backend/service tests were not applicable because this item did not change
  persisted data, search ranking, or workspace service behavior.

UI smoke artifact:

- `artifacts/ui-smoke/row-page-navigation-2026-06-12T17-55-02-086Z/`
