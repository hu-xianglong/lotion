# Notion Import Audit Visible Summary

Status: done

## Why

Audit results are already available in the Notion Import plugin, but review is
still slower than it should be because source/workspace paths are plain text.
Users should be able to open source roots, workspace root, and individual issue
sources directly from the audit panel.

## Scope

- Show source roots and workspace root in the audit result summary.
- Render audit paths with an Open action.
- Let shell link opening handle absolute local paths for original Notion
  export files.
- Keep relative workspace paths working as before.

## Gates

- `npm run typecheck`
- `npm run build`
- `npm run test:fixtures`
- `npm run test:latency`
- UI smoke verifies the audit panel path actions render.
