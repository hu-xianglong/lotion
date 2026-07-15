# Markdown table syntax real editor regression

Status: done

## Why

Slash-command table insertion is covered, but the direct writing path still
needs a real-editor guard: typing a Markdown pipe table should turn into the
rendered editable table preview, remain directly editable, persist edits back to
Markdown, and allow normal writing to continue below the table.

## Acceptance

- The editor regression smoke types a Markdown pipe table directly.
- The table renders as the live Markdown table widget after the cursor leaves the
  table block.
- A body cell is directly editable and persists back to Markdown.
- Typing continues below the table after editing.
- The smoke runs across desktop and compact viewports and asserts no horizontal
  overflow.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run smoke:editor-regression-ui`
  - Covered desktop and compact viewports.
  - Verified direct Markdown pipe table rendering, editable table cell commit,
    persisted Markdown, continued typing below the table, and no horizontal
    overflow.
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Notes

This item only strengthens the real Electron editor regression smoke for an
existing renderer/editor behavior. No backend, parser, or persistence code was
changed, so lower-level service tests were not applicable for this item.
