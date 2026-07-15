# Slash explicit equation Chinese alias real editor regression

Status: done

## Why

The Equation slash command exposes the explicit localized alias `/数学公式`.
The editor smoke covered `/equation` and `/公式`, but this alias also needed
real editor coverage so Chinese users get a stable Notion-like insertion path
for math blocks.

## Acceptance

- `/数学公式` opens the slash menu and selects the Equation command in the real
  editor.
- Pressing Enter inserts a `lotion-equation` fenced block and accepts typed
  equation source.
- The equation preview renders after focus leaves the fence and hides inactive
  source.
- Persisted Markdown contains the expected equation source and continuation.
- The flow has no horizontal overflow across desktop and compact viewports.
- Slash unit and renderer coverage remain green.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run test:slash`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T07-05-55-828Z`
  - Covered desktop and compact viewports; both recorded
    `slashChineseExplicitEquation.rendered: true` with `/数学公式`, persisted
    equation source, hidden inactive source, continuation text, focus
    stability, and no horizontal overflow.
- `git diff --check`
