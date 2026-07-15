# Slash embed iframe command real editor regression

Status: done

## Why

Lotion can render `lotion-iframe` fenced Markdown for imported web embeds and
Indify-style widgets, but users still need to hand-write the fence. A
Notion-like slash menu should expose an Embed command for inserting a web
preview block directly.

## Acceptance

- `/embed` is discoverable in the slash menu and resolves to an Embed block
  command.
- Chinese aliases such as `/嵌入` can find the same command.
- The command inserts a valid `lotion-iframe` fenced block with the cursor in
  the URL field.
- The real editor smoke commits `/embed`, types a URL, verifies the rendered
  iframe widget title/URL/height, and confirms persisted Markdown.
- The smoke verifies continuing to type below the embed, focus stability,
  hidden inactive source, and no horizontal overflow across desktop and compact
  viewports.
- Slash command unit coverage asserts filtering and template insertion for the
  new command.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run test:slash`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T06-13-38-287Z`
  - Covered desktop and compact viewports; both recorded `slashEmbed.rendered: true`
    with persisted URL/title/height source, hidden inactive source,
    continuation text, focus stability, and no horizontal overflow.
- `git diff --check`
