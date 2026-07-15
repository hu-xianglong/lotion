# Backlink Source Type Chip

Status: done

## Why

Backlink source titles can collide across normal pages, database rows, and
databases. The panel already shows source path metadata, but a compact source
type chip makes scan results clearer without requiring users to infer type from
the icon alone.

## Scope

- Render a compact source type chip for backlink items.
- Localize page, database row, and database labels.
- Extend the backlinks UI smoke to assert the deterministic page source type.

## Gates

- `npm run smoke:page-backlinks-ui`
- `npm run typecheck`
- `git diff --check`
