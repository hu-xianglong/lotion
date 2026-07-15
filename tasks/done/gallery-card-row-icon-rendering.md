# Gallery Card Row Icon Rendering

Status: done

## Why

Table and list views show row/page icons, but gallery cards only show the row
title. Imported Notion pages frequently rely on icons as a scannable signal, so
gallery should preserve that signal too.

## Scope

- Render the row icon next to the gallery card title.
- Use the existing default row-page icon when no custom icon exists.
- Extend the database-template UI smoke with a template-created row icon.

## Gates

- `npm run smoke:database-template-ui`
- `npm run typecheck`
- `git diff --check`
