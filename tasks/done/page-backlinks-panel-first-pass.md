# Page Backlinks Panel First Pass

Status: done

## Why

The workspace API can now report incoming page references, but users still need
a visible page-level affordance to inspect those backlinks without opening a
plugin or test script.

## Scope

- Load backlinks for the active page/row page through the public renderer API.
- Render a small read-only backlinks panel below the editor when references
  exist.
- Let users click a backlink source to open that page/row/database in Lotion.

## Gates

- `npm run typecheck`
- `git diff --check`
