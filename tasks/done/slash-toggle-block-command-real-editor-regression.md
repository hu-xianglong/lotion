# Slash toggle block command real editor regression

Status: done

## Why

Lotion can render and edit `lotion-toggle` fenced Markdown, but the slash menu
does not yet expose a Notion-like Toggle block command. Users should be able to
insert a toggle from `/toggle` instead of hand-writing the fenced source.

## Acceptance

- `/toggle` is discoverable in the slash menu and resolves to a Toggle block
  command.
- The command inserts a valid `lotion-toggle` fenced block with the cursor in
  the summary/body editing path.
- The real editor smoke commits `/toggle`, types a summary/body, verifies the
  rendered toggle widget, edits through the widget where applicable, and
  confirms persisted Markdown.
- The smoke verifies continuing to type below the toggle, focus stability, and
  no horizontal overflow across desktop and compact viewports.
- Slash command unit coverage asserts filtering and template insertion for the
  new command.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run test:slash`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T05-47-03-408Z`
  - Covered desktop and compact viewports; both recorded `slashToggle.rendered: true`
    with persisted summary, body, continuation text, focus stability, and no
    horizontal overflow.
- `git diff --check`
