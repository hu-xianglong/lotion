# Slash explicit toggle Chinese alias real editor regression

Status: done

## Why

The Toggle slash command also exposes the explicit localized alias `/折叠块`.
The unit filter test covered that alias, but the real editor path needed to
prove it inserts the same editable toggle block as `/toggle` and `/折叠` across
the shared desktop and compact editor smoke viewports.

## Acceptance

- `/折叠块` opens the slash menu and selects the Toggle command in the real
  editor.
- Pressing Enter inserts a `lotion-toggle` fenced block and accepts typed
  summary text.
- The toggle preview hides inactive source, supports direct body editing,
  collapses/expands, and continues editing below the block.
- Persisted Markdown contains the expected summary/body/continuation.
- The flow has no horizontal overflow across desktop and compact viewports.
- Slash unit and renderer coverage remain green.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run test:slash`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T06-56-13-681Z`
  - Covered desktop and compact viewports; both recorded
    `slashChineseExplicitToggle.rendered: true` with `/折叠块`, persisted
    summary/body, hidden inactive source, collapse/expand behavior,
    continuation text, focus stability, and no horizontal overflow.
- `git diff --check`
