# Missing Database Placeholder Search Affordance

Status: done

Backlog item: UI regression lab imported Notion parity gaps.

## Why

Missing imported embedded databases rendered as a warning widget with an
edit-source control, but the diagnostic was still passive. Users should be able
to jump directly into Lotion search for the missing database title instead of
manually copying text out of the placeholder.

## Result

- Added a `lotion:open-search` renderer event that opens global search with an
  initial query. This keeps non-React editor widgets decoupled from App state.
- Added a compact `Search` action to the missing database live-preview widget.
- The action opens global search with the missing database title prefilled and
  focused.
- Kept the existing hover-visible `Edit source` affordance and source fold-back
  behavior intact.

## Tests

- `node --check scripts/smoke-markdown-preview-ui.mjs`
- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`

## Backend Tests

Not applicable for this item. It changes renderer widget affordances and an App
event bridge only; Notion import conversion, database resolution, workspace
services, and persistence behavior are unchanged.
