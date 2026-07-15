# List Database View

Status: done

## Why

Notion's list view is a high-frequency lightweight database view. Lotion already
has table, calendar, gallery, and Kanban; adding list view gives users a denser
page-like database surface without changing the data model.

## Scope

- Add `list` as a built-in database view type.
- Render list views with row title and a small set of visible properties.
- Include list in view settings and view-type icons.
- Validate list view JSON in demo fixtures.

## Non-goals

- Do not add inline list editing yet.
- Do not add list-specific per-view configuration yet.
- Do not change imported view mapping.

## Acceptance

- A saved view can be switched to type `list`.
- List view opens row pages from row clicks.
- Demo fixture validation accepts list views.
- `npm run typecheck` passes.
- `npm run build` passes.
- `npm run test:fixtures` passes.
- `npm run test:latency` passes.

## Changes

- Added `list` to the built-in database view type union.
- Added `ListBody` for page-like row list rendering.
- Added list view to the view settings type picker.
- Added a list view icon and demo fixture validation support.
- Added responsive CSS for dense list rows.

## Verification

- `npm run typecheck`
- `npm run build`
- `npm run test:fixtures`
- `npm run test:latency`
- `git diff --check`
