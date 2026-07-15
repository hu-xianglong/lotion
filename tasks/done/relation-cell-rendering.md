# Relation Cell Rendering

Status: done

## Why

Imported Notion relation cells are stored as structured `EntityRef[]`, but the
database cell renderer falls back to a plain input for `entity_ref`. That makes
valid relation data look like raw JSON and makes related pages/rows harder to
open.

## Scope

- Parse structured `entity_ref` cell values.
- Render relation refs as compact clickable chips.
- Open page/database/row refs through Lotion navigation.
- Preserve the existing text input fallback for empty or unstructured values.

## Non-goals

- Do not implement full relation editing/picker.
- Do not resolve titles asynchronously in each cell.
- Do not implement rollups yet.

## Acceptance

- Structured entity refs render as labels, not raw JSON.
- Clicking a page/database/row ref navigates inside Lotion.
- Empty/unstructured relation cells remain editable via the existing fallback.
- `npm run typecheck` passes.
- `npm run test:fixtures` passes.
- `npm run test:latency` passes.

## Changes

- Parsed structured JSON `EntityRef[]` values in `entity_ref` table cells.
- Rendered valid refs as compact clickable chips with page/database/row icons.
- Routed relation chip clicks through Lotion navigation for pages, databases,
  and row pages.
- Preserved the existing draft input fallback for empty or unstructured values.

## Verification

- `npm run typecheck`
- `npm run build`
- `npm run test:fixtures`
- `npm run test:latency`
- `git diff --check`
