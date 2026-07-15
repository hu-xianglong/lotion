# Slash equation block command real editor regression

Status: done

## Why

Lotion can render and hide-source `lotion-equation` fenced Markdown, but users
still need to hand-write the fence. A Notion-like slash menu should expose an
Equation block command that inserts the correct source and keeps ordinary
typing smooth after the equation.

## Acceptance

- `/equation` is discoverable in the slash menu and resolves to an Equation
  block command.
- Chinese aliases such as `/公式` can find the same command.
- The command inserts a valid `lotion-equation` fenced block with the cursor in
  the equation body.
- The real editor smoke commits `/equation`, types TeX content, verifies the
  rendered equation widget, and confirms persisted Markdown.
- The smoke verifies continuing to type below the equation, focus stability,
  hidden inactive source, and no horizontal overflow across desktop and compact
  viewports.
- Slash command unit coverage asserts filtering and template insertion for the
  new command.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run test:slash`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T06-00-11-443Z`
  - Covered desktop and compact viewports; both recorded `slashEquation.rendered: true`
    with persisted TeX source, hidden inactive source, continuation text,
    focus stability, and no horizontal overflow.
- `git diff --check`
