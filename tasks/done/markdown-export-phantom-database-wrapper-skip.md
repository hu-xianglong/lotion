# Markdown Export Phantom Database Wrapper Skip

## Why

Notion Markdown exports can create standalone `.md` files whose entire body is
just a Markdown link to the exported database CSV. Those files are database
wrapper pages, not real pages, and importing them inflates the page count.

## Scope

- Detect Markdown source pages that reduce to exactly one local Markdown link to
  a Notion-hashed `.csv` file.
- Redirect links to that source page to the canonical Lotion database view.
- Keep normal Markdown pages and non-database CSV attachment links untouched.
- Add a focused importer regression.

## Gates

- `npm run typecheck`
- `npm exec tsc -- -p tsconfig.main.json`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
