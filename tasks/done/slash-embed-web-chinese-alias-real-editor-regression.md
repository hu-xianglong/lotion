# Slash embed-web Chinese alias real editor regression

Status: done

## Why

The Embed command also exposes `/嵌入网页`, matching the command hint order.
Since previous regressions around slash aliases have been visible only in the
real editor path, the last localized web embed phrase should be protected by the
same multi-resolution smoke rather than relying only on static command data.

## Acceptance

- `/嵌入网页` opens the slash menu and selects the Embed command in the real
  editor.
- Pressing Enter inserts the same `lotion-iframe` fenced block as `/embed`.
- Typing the URL after command insertion persists in Markdown and renders an
  iframe widget with title, URL, height, and hidden inactive source.
- Continuing to type below the embed preserves focus and layout with no
  horizontal overflow across desktop and compact viewports.
- Slash unit coverage confirms the `/嵌入网页` alias resolves to Embed.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run test:slash`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T07-38-29-209Z`
  - Covered desktop and compact viewports; both recorded
    `slashChineseEmbedWeb.rendered: true` with `/嵌入网页`, persisted iframe
    source, hidden inactive source, continuation text, focus stability, and no
    horizontal overflow.
- `git diff --check`
