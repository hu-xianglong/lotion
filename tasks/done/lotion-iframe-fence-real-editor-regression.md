# Lotion iframe fence real editor regression

Status: done

## Why

Imported Notion embeds and Indify-style widgets depend on `lotion-iframe`
fenced Markdown. The broad preview smoke covers preloaded iframe content, but
direct real-editor typing should also be covered so the iframe preview stays
readable, source stays hidden after cursor exit, and writing continues below the
embed.

## Acceptance

- The editor regression smoke types a `lotion-iframe` fenced block directly.
- The live preview renders the iframe widget with expected title, URL, and
  height attributes.
- Inactive source fence lines are hidden after the cursor leaves the iframe.
- Typing continues below the iframe and persists after the closing fence.
- The smoke runs across desktop and compact viewports and asserts no horizontal
  overflow.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run smoke:editor-regression-ui`
  - Passing artifact:
    `artifacts/ui-smoke/editor-regression-2026-06-14T04-52-33-753Z`
  - Covered desktop and compact direct `lotion-iframe` fenced block editing.
  - Verified rendered iframe title, URL, height, edit-source affordance, hidden
    inactive source fence, continued typing below the iframe, persisted
    Markdown, and no horizontal overflow.
  - The smoke uses `about:blank#...` for the test iframe URL so this regression
    path does not depend on external network access.
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

No backend/parser changes were needed; this item adds real-editor UI regression
coverage for existing iframe rendering behavior.
