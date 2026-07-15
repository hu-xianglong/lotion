# Backlink Property Row Click Smoke

Status: done

## Why

Backlink panels need click-through behavior for both markdown references and
database property references. The UI smoke covers page-source navigation, but
not row-source navigation from property backlinks.

## Scope

- Extend the deterministic backlinks smoke to click the property backlink item.
- Assert the click opens the source row page with the human title, not a raw row
  id.
- Keep the existing markdown backlink click-through assertion.

## Gates

- `npm run smoke:page-backlinks-ui`
- `npm run typecheck`
- `git diff --check`
