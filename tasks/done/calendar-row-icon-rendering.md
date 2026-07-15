# Calendar Row Icon Rendering

Status: done

## Why

Calendar row chips currently omit row/page icons, while table/list/gallery views
show them. Imported Notion pages use icons as scannable context, so calendar
should preserve them too.

## Scope

- Render row-page icons inside calendar row chips.
- Keep text truncation stable.
- Extend the database-template UI smoke with a calendar row icon assertion.

## Gates

- `npm run smoke:database-template-ui`
- `npm run typecheck`
- `git diff --check`
