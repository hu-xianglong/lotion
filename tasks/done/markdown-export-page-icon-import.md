# Markdown export page icon import

Status: done

## Why

Notion Markdown exports can carry a page icon as an icon-only `<aside>` at the
top of the page body. Lotion treated Markdown sources as body-only, so those
icons were lost and the exported icon wrapper stayed visible in the page body.

## Scope

- Sniff leading icon-only Markdown aside blocks during import metadata planning.
- Store the resolved icon in the same page/row metadata lanes as HTML icons.
- Strip the icon-only aside from the imported markdown body.
- Cover the behavior in the import service fixture.

## Gates

- `npm run typecheck`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
