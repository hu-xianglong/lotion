# Notion HTML table paste real editor regression

## Problem

The editor now has a `text/html` clipboard path for rich Notion/browser paste,
but the real-editor smoke does not yet prove that HTML tables survive paste as
Markdown tables. This is a high-risk Notion parity case because tables are
common in imported or copied Notion pages and should remain editable after
paste.

## Scope

- Extend the real editor regression smoke with a multi-resolution HTML table
  paste case using a `text/html` clipboard payload.
- Verify the pasted table persists as Markdown table source, renders as the
  existing editable table widget, keeps table-cell editing semantics, allows
  continued typing after the pasted table, and has no document overflow.
- Keep the implementation scoped to renderer/editor behavior unless the smoke
  exposes a conversion bug.

## Tests

- `node --check scripts/smoke-editor-regression-ui.mjs` - passed
- `npm run test:renderer-components` - passed
- `npm run typecheck` - passed
- `npm run smoke:editor-regression-ui` - passed
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T18-28-01-369Z`
- `git diff --check` - passed

## Result

- Added a multi-resolution real-editor smoke case for pasting Notion/browser
  `text/html` table content.
- Verified the pasted HTML table persists as Markdown table source, renders as
  the editable table widget, preserves body-cell textbox semantics, supports
  continued typing, and avoids document horizontal overflow.
- Stabilized the existing tag-chip keyboard smoke by focusing the visible chip
  explicitly before sending real keyboard activation.
- Backend/service tests are not applicable because this item only extends
  renderer UI smoke coverage for existing editor/table conversion behavior.
