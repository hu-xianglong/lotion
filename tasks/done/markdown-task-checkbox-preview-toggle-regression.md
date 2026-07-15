# Markdown Task Checkbox Preview Toggle Regression

Status: done

## Why

Notion-like writing depends on task list rows behaving like real checkboxes in
the editor preview, not just raw Markdown text. The current markdown preview
smoke covers emphasis, links, callouts, images, tables, and embeds, but it does
not explicitly protect task marker rendering or toggling persistence.

## Scope

- Add deterministic unchecked and checked task rows to the markdown preview UI
  fixture.
- Assert the inactive preview renders task markers as real checkbox controls
  with stable accessible state.
- Toggle an unchecked task in the preview and verify the rendered checkbox and
  persisted Markdown both update.
- Keep coverage multi-resolution through the shared UI harness.

## Gates

- `node --check scripts/smoke-markdown-preview-ui.mjs`
- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`

## Result

- Extended the shared-harness markdown preview UI smoke with deterministic
  unchecked and checked task rows.
- Asserted task markers collapse into real checkbox controls instead of leaking
  raw `[ ]` / `[x]` text.
- Toggled an unchecked task in the rendered preview and verified both the
  visible checkbox state and persisted Markdown update to `[x]`.
- Kept the coverage multi-resolution through the existing desktop and compact
  harness viewports.
- Backend tests were not added because this item only strengthens renderer UI
  regression coverage and does not change parser, storage, or service behavior.
