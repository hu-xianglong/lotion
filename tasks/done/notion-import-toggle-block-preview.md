# Notion import toggle block preview

Status: done

## Why

Notion toggle blocks currently import as bold summary text plus body content.
That keeps text but loses the collapsible block behavior users expect from
Notion.

## Scope

- Convert Notion `<details><summary>...</summary>...</details>` blocks into a
  stable `lotion-toggle` fenced block.
- Render `lotion-toggle` as a native collapsible preview in CodeMirror live
  preview.
- Cover converter output and UI smoke behavior.

## Gates

- [x] `npm run typecheck`
- [x] `npm run test:notion-html`
- [x] `npm run smoke:markdown-preview-ui`
- [x] `git diff --check`
