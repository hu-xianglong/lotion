# Slash List Commands Insert Editable Lists

Status: done

## Why

Slash-command basics should cover normal writing primitives, not only headings
and heavier blocks. `/bullet` and `/numbered` are daily Notion-like editing
paths; they should insert Markdown lists, remove the slash query, keep the
editor focused, and allow immediate continuation.

## Acceptance

- Added slash command unit coverage for bulleted and numbered list templates.
- Added multi-resolution editor UI smoke coverage for inserting `/bullet` and
  `/numbered` from the real slash menu.
- Verified the inserted list text persists to page markdown, the slash query is
  gone, and the editor remains usable for following text.
- Verified the list editing flow has no document horizontal overflow at desktop
  and compact viewports.

## Verification

- Passed: `node --check scripts/smoke-editor-regression-ui.mjs`
- Passed: `npm run test:slash`
- Passed: `npm run typecheck`
- Passed: `npm run smoke:editor-regression-ui`
- Passed: `git diff --check`

Backend/service tests are not applicable because this item only strengthens
existing slash-command template behavior and frontend editor interaction
coverage.
