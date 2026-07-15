# Slash toggle Chinese alias real editor regression

Status: done

## Why

The Toggle slash command has localized aliases such as `/折叠` and `/折叠块`,
but the real editor smoke only verified the English `/toggle` path. A
Notion-like Chinese editing flow should make the localized command insert a
toggle block, render the preview, preserve direct body editing, and continue
editing without leaking source or breaking layout.

## Acceptance

- `/折叠` opens the slash menu and selects the Toggle command in the real editor.
- Pressing Enter inserts a `lotion-toggle` fenced block and places typed summary
  text in the toggle source.
- The toggle preview renders after focus leaves the fence, hides inactive
  source, and exposes the edit source affordance.
- Direct body editing persists, disclosure collapse/expand remains usable, and
  continuing to type below the toggle preserves editor focus.
- The flow has no horizontal overflow across desktop and compact viewports.
- Slash unit coverage remains green for Toggle aliases and template behavior.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run test:slash`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T06-47-26-484Z`
  - Covered desktop and compact viewports; both recorded
    `slashChineseToggle.rendered: true` with `/折叠`, persisted summary/body,
    hidden inactive source, collapse/expand behavior, continuation text, focus
    stability, and no horizontal overflow.
- `git diff --check`
