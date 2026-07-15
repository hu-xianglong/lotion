# Slash embed Chinese alias real editor regression

Status: done

## Why

The Embed slash command now exists and is covered for `/embed`, but Chinese
users should be able to type the localized alias directly in the real editor.
Unit filtering coverage is not enough because the CodeMirror slash menu path
also has to remove the localized query, place the cursor inside the iframe URL
field, render the preview, and keep editing stable afterward.

## Acceptance

- `/嵌入` opens the slash menu and selects the Embed command in the real editor.
- Pressing Enter inserts the same `lotion-iframe` fenced block as `/embed`.
- Typing the URL after command insertion persists in Markdown and renders an
  iframe widget with title, URL, height, and hidden inactive source.
- Continuing to type below the embed preserves focus and layout with no
  horizontal overflow across desktop and compact viewports.
- Slash unit coverage remains green for the Embed aliases and template.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run test:slash`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T06-27-01-118Z`
  - Covered desktop and compact viewports; both recorded
    `slashChineseEmbed.rendered: true` with `/嵌入`, persisted iframe source,
    hidden inactive source, continuation text, focus stability, and no
    horizontal overflow.
- `git diff --check`
