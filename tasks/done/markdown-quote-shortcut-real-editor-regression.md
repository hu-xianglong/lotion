# Markdown quote shortcut real editor regression

Status: done

## Why

Slash quote insertion is covered, but users also expect standard Markdown
typing to feel Notion-like. Directly typing `> quote` in the real editor should
render a blockquote preview, persist the Markdown source, and let the user exit
the quote block cleanly.

## Scope

- Extend the shared editor regression smoke across desktop and compact
  viewports.
- Type a blockquote line directly into the editor, without using slash.
- Assert the line receives the blockquote live-preview class, the source
  persists as `> ...`, the editor can exit the quote block, and no horizontal
  overflow is introduced.

## Acceptance

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run smoke:editor-regression-ui`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

Backend tests are not applicable unless the implementation touches persistence,
parser, or service behavior; this item is expected to add UI regression coverage
for existing editor blockquote behavior.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run smoke:editor-regression-ui`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

The editor smoke now types `> ...` directly in both desktop and compact
viewports, verifies the blockquote live-preview class appears, confirms the
source persists as `> ...`, exits the quote block, and checks for horizontal
overflow.

Backend/service tests are not applicable because this item only adds UI
regression assertions for existing editor blockquote and autosave behavior; no
parser, persistence, or service code changed.
