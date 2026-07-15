# Notion Import Callout Background Color

Status: done

## Problem

Imported Notion callouts keep their icon and body but lose the exported
`block-color-*_background` class from the callout figure. The renderer then shows
every callout with the same default Lotion background.

## Scope

- Preserve known Notion callout background colors as `lotion-callout` fenced
  metadata.
- Render the metadata through a sanitized callout background class.
- Cover converter output and the markdown preview widget.

## Gates

- `npm run typecheck`
- `npm run test:notion-html`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`
