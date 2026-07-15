# Slash web embed Chinese alias real editor regression

Status: done

## Why

The Embed slash command supports multiple localized aliases. `/嵌入` is covered
in the real editor, but `/网页` is another natural Chinese query users will type
when inserting a web embed. The alias needs the same end-to-end protection:
menu matching, command replacement, cursor placement in the iframe URL field,
rendered preview, hidden inactive source, continuation typing, persistence, and
multi-resolution layout stability.

## Acceptance

- `/网页` opens the slash menu and selects the Embed command in the real editor.
- Pressing Enter inserts the same `lotion-iframe` fenced block as `/embed`.
- Typing the URL after command insertion persists in Markdown and renders an
  iframe widget with title, URL, height, and hidden inactive source.
- Continuing to type below the embed preserves focus and layout with no
  horizontal overflow across desktop and compact viewports.
- Slash unit coverage confirms the `/网页` alias resolves to Embed.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run test:slash`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T07-18-52-911Z`
  - Covered desktop and compact viewports; both recorded
    `slashChineseWebEmbed.rendered: true` with `/网页`, persisted iframe
    source, hidden inactive source, continuation text, focus stability, and no
    horizontal overflow.
- `git diff --check`
