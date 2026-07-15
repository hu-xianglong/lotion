# Backlink Excerpt Preview

Status: done

## Why

The backlinks panel shows the source entity and line/property context, but users
still need a quick hint of why that source links here. The API already returns a
trimmed excerpt, so the UI should surface it.

## Scope

- Render a one-line excerpt under each backlink when available.
- Keep the excerpt clipped so long source lines do not resize the page header.
- Extend the backlinks UI smoke to assert the excerpt appears.

## Gates

- `npm run smoke:page-backlinks-ui`
- `npm run typecheck`
- `git diff --check`
