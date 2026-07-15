# Lotion view fence real editor regression

Status: done

## Why

In-page databases are represented as `lotion-view` fenced Markdown. Slash
commands already cover inserting a database view, but direct real-editor typing
of the fence should also be covered so imported or pasted view blocks keep
rendering as embedded database previews rather than leaking source or breaking
continued writing.

## Acceptance

- The editor regression smoke types a `lotion-view` fenced block directly.
- The live preview renders the embedded database widget for the expected
  database/view.
- Inactive source fence lines are hidden after the cursor leaves the view.
- Typing continues below the embedded view and persists after the closing
  fence.
- The smoke runs across desktop and compact viewports and asserts no horizontal
  overflow.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run smoke:editor-regression-ui`
  - Passing artifact:
    `artifacts/ui-smoke/editor-regression-2026-06-14T05-21-02-890Z`
  - Covered desktop and compact direct `lotion-view` fenced block editing.
  - Verified embedded database widget rendering for the expected database,
    hidden inactive source fence, continued typing below the embedded view,
    persisted Markdown, editor focus, and no horizontal overflow.
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

No backend/parser changes were needed; this item adds real-editor UI regression
coverage for existing in-page database view rendering behavior.
