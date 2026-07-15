# Lotion equation fence real editor regression

Status: done

## Why

Imported Notion equation blocks are stored as `lotion-equation` fenced Markdown.
The broad markdown preview smoke covers preloaded equation content, but direct
real-editor typing should also stay stable: once the cursor leaves the fence,
the source should collapse to a readable equation widget and the user should be
able to continue writing below it.

## Acceptance

- The editor regression smoke types a `lotion-equation` fenced block directly.
- The live preview renders the equation widget with the expected TeX content.
- Inactive source fence lines are hidden after the cursor leaves the equation.
- Typing continues below the equation and persists after the closing fence.
- The smoke runs across desktop and compact viewports and asserts no horizontal
  overflow.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-13T23-01-55-087Z`
  - Covered desktop and compact direct `lotion-equation` fenced block editing.
  - Verified rendered equation marker/body, hidden inactive source fence,
    continued typing below the equation, persisted Markdown, and no horizontal
    overflow.
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

No backend/parser changes were needed; this item adds real-editor UI regression
coverage for existing equation rendering behavior.
