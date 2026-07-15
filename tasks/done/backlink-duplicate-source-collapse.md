# Backlink Duplicate Source Collapse

Status: done

## Why

When a page links to the same target more than once, the backlink panel should
behave like a source list instead of showing repeated entries from the same
page. That keeps the panel useful on imported pages with repeated Notion links.

## Scope

- Collapse markdown backlinks by source entity and target entity.
- Preserve the first line/excerpt for context.
- Extend focused API/UI smoke coverage so duplicate links from one source do
  not inflate the backlink count.

## Gates

- `node --test test/customer-api.test.mjs`
- `npm run smoke:page-backlinks-ui`
- `npm run typecheck`
- `git diff --check`
