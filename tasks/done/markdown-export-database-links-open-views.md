# Markdown export database links open views

Status: done

## Why

Notion Markdown exports represent inline database references as Markdown links
to exported CSV files. Those links should open the Lotion database view, not the
raw imported `data.csv` file.

## Scope

- Rewrite local Notion links inside Markdown source bodies.
- Map Notion database CSV source paths to the database view path.
- Keep non-database CSV attachments on the attachment rewrite path.
- Cover the behavior in the import service fixture.

## Gates

- `npm run typecheck`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
