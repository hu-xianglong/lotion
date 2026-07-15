# Indify Iframe Preview Smoke And Docs

## Goal

Keep imported Notion source-only Indify widgets covered in the renderer so they
do not regress back to plain links or raw fenced code.

## Scope

- Extend the markdown preview smoke fixture with a `lotion-iframe` block.
- Assert the rendered iframe widget title, URL, height, and iframe `src`.
- Refresh Notion import compatibility docs for the current Indify preview
  behavior.

## Gates

- [x] `npm run smoke:markdown-preview-ui`
- [x] `git diff --check`
