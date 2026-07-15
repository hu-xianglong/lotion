# Row-Page Property Visual Regression First Slice

Status: done

## Why

Row-page properties have repeatedly regressed in ways package/core coverage
cannot catch: misalignment, mixed font sizes, awkward date/checkbox controls,
read-only source fields looking editable, and link affordances disappearing.

This is the first practical slice of the UI regression lab: add coded,
multi-resolution visual/layout assertions for the row-page property panel using
the shared UI harness.

## Scope

- Open an isolated fixture row page with:
  - read-only Original Notion HTML/CSV URL properties,
  - editable date/number/text/checkbox/select/multi-select/relation fields,
  - empty properties,
  - backlinks/reference context.
- Assert row-property label/value columns stay aligned across property types.
- Assert read-only source URL properties render as openable links, not editable
  inputs.
- Assert editable date and checkbox controls remain usable and do not overlap
  labels or neighboring rows.
- Assert option/tag pills use the same row text scale and remain vertically
  aligned.
- Run across desktop/laptop and compact/narrow viewports.
- Capture diagnostic screenshots/artifacts through the shared UI harness on
  failure.

## Gates

- `npm run typecheck`
- Focused row-page navigation/property UI smoke
- `git diff --check`

## Result

- Migrated the row-page navigation/property smoke onto the shared UI harness so
  it owns app lifecycle, cleanup, and failure artifacts.
- Parameterized the row-page property workflow across desktop and compact
  viewports.
- Added visual/layout assertions for:
  - label/value column separation,
  - source HTML/CSV link text versus open action geometry,
  - read-only source-link behavior,
  - date text/picker geometry,
  - checkbox size and vertical centering,
  - option/tag pill geometry,
  - document horizontal overflow.
- Kept the existing row-page behavior checks for table cell editing, row open,
  field settings, date persistence, source-link opening, and entity-ref
  navigation.
- No backend/service tests were added because this task only changes UI smoke
  coverage and does not alter data persistence or service behavior.

Verified:

- `npm run typecheck`
- `npm run smoke:row-page-navigation-ui`
