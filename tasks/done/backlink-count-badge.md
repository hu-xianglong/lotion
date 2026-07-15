# Backlink Count Badge

Status: done

## Why

The backlinks panel now surfaces source context and excerpts, but the header does
not show how many incoming references were found. A count badge makes the panel
easier to scan and gives the UI smoke a direct assertion for backlink totals.

## Scope

- Render the backlink count next to the backlinks panel title.
- Keep the count visually compact and non-interactive.
- Extend the backlinks UI smoke to assert the count for the deterministic
  fixture.

## Gates

- `npm run smoke:page-backlinks-ui`
- `npm run typecheck`
- `git diff --check`
