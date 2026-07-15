# Slash equation Chinese alias real editor regression

Status: done

## Why

The Equation slash command has localized aliases such as `/公式`, but the real
editor smoke only verifies the English `/equation` path. A Notion-like Chinese
editing flow should make the localized command insert an equation block with
the cursor in the source body, render the equation preview, and continue editing
without leaking source or breaking layout.

## Acceptance

- `/公式` opens the slash menu and selects the Equation command in the real
  editor.
- Pressing Enter inserts a `lotion-equation` fenced block and places typed
  equation text inside the source body.
- The equation preview renders after focus leaves the fence, hides inactive
  source, and persists exact Markdown.
- Continuing to type below the equation preserves editor focus and has no
  horizontal overflow across desktop and compact viewports.
- Slash unit coverage remains green for the Equation aliases and template.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run test:slash`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T06-36-12-232Z`
  - Covered desktop and compact viewports; both recorded
    `slashChineseEquation.rendered: true` with `/公式`, persisted equation
    source, hidden inactive source, continuation text, focus stability, and no
    horizontal overflow.
- `git diff --check`
