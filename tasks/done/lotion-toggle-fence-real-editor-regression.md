# Lotion toggle fence real editor regression

Status: done

## Why

`lotion-toggle` fenced Markdown is the local representation for Notion-like
toggle blocks. The renderer supports toggle widgets, but the real editor smoke
does not yet cover directly typing a toggle fence, leaving regressions possible
around source hiding, disclosure behavior, inline editing, and writing below the
toggle.

## Acceptance

- The editor regression smoke types a `lotion-toggle` fenced block directly.
- The live preview renders the toggle summary/body with the expected open
  state and disclosure control.
- Inactive source fence lines are hidden after the cursor leaves the toggle.
- The smoke toggles collapse/expand, edits the summary and body in the widget,
  and verifies Markdown persistence.
- Typing continues below the toggle and persists after the closing fence.
- The smoke runs across desktop and compact viewports and asserts no horizontal
  overflow.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run smoke:editor-regression-ui`
  - Passing artifact:
    `artifacts/ui-smoke/editor-regression-2026-06-14T05-10-59-022Z`
  - Covered desktop and compact direct `lotion-toggle` fenced block editing.
  - Verified rendered toggle summary/body, open state, disclosure
    collapse/expand behavior, hidden inactive source fence, widget summary/body
    edits, continued typing below the toggle, persisted Markdown, restored
    editor focus, and no horizontal overflow.
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

No backend/parser changes were needed; this item adds real-editor UI regression
coverage for existing toggle rendering and widget editing behavior.
