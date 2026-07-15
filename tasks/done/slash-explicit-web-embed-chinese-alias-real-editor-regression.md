# Slash explicit web embed Chinese alias real editor regression

Status: done

## Why

Users can reasonably type `/网页嵌入` when they want the same web embed block as
`/embed`. The shorter `/网页` alias is now covered, but this more explicit
localized phrase should also be exercised through the real editor because it
uses IME-style non-ASCII slash input and the full CodeMirror command insertion
path.

## Acceptance

- `/网页嵌入` opens the slash menu and selects the Embed command in the real
  editor.
- Pressing Enter inserts the same `lotion-iframe` fenced block as `/embed`.
- Typing the URL after command insertion persists in Markdown and renders an
  iframe widget with title, URL, height, and hidden inactive source.
- Continuing to type below the embed preserves focus and layout with no
  horizontal overflow across desktop and compact viewports.
- Slash unit coverage confirms the `/网页嵌入` alias resolves to Embed.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run test:slash`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T07-28-47-778Z`
  - Covered desktop and compact viewports; both recorded
    `slashChineseExplicitWebEmbed.rendered: true` with `/网页嵌入`, persisted
    iframe source, hidden inactive source, continuation text, focus stability,
    and no horizontal overflow.
- `git diff --check`
