# Backlink Source Path Display

Status: done

## Why

Imported Notion workspaces often contain repeated page titles. The backlinks
panel shows the source title, context, and excerpt, but not the source hierarchy,
so duplicate titles are still ambiguous.

## Scope

- Show a compact parent path line for backlink source pages when path metadata is
  available.
- Avoid repeating the source title when the path already ends with the same
  title.
- Extend the backlinks UI smoke to assert the deterministic source path renders.

## Gates

- `npm run smoke:page-backlinks-ui`
- `npm run typecheck`
- `git diff --check`
