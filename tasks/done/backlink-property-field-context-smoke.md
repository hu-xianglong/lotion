# Backlink Property Field Context Smoke

Status: done

## Why

Backlinks should distinguish body links from database property references. The
panel already has a context line, but the UI smoke only covers markdown links,
so field/database context can regress unnoticed.

## Scope

- Add a deterministic row property backlink to the page backlinks UI fixture.
- Assert the property backlink shows the row source type, database name, field
  name, and source path.
- Keep the production behavior unchanged unless the smoke exposes a rendering
  gap.

## Gates

- `npm run smoke:page-backlinks-ui`
- `npm run typecheck`
- `git diff --check`
