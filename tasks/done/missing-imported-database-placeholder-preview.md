# Missing Imported Database Placeholder Preview

Status: done

## Why

When Notion import cannot resolve an inline/nested collection, Lotion currently
shows raw placeholder text like `_📂 问题列表 (database not found)_`. That is hard
to scan and looks like broken Markdown instead of an actionable import
diagnostic.

## Scope

- Render inactive imported missing-database placeholders as a compact warning
  widget with the collection title and an actionable diagnostic.
- Preserve source editability through an explicit edit-source control.
- Add shared-harness multi-resolution UI smoke coverage for the rendered
  warning, hidden raw source, edit-source reveal, and no horizontal overflow.

## Gates

- `node --check scripts/smoke-markdown-preview-ui.mjs`
- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`

## Result

- Added a live-preview block widget for imported missing-database placeholders,
  hiding raw `_📂 ... (database not found)_` source while inactive.
- Preserved editability through a hover-visible `Edit source` button that
  reveals the original markdown line and folds back after focus leaves.
- Extended the shared-harness markdown preview smoke across desktop and compact
  viewports to assert hidden raw source, visible diagnostic card geometry,
  edit-source reveal, fold-back behavior, and no horizontal overflow.
