# Search Result Navigation Smoke

## Goal

Ensure clicking a global search result opens the Lotion entity, not a raw
markdown file/id, and that the tab/page title use the user-facing page title.

## Scope

- Extend the deterministic search-title fixture with a click-through assertion.
- Verify the page title input and active tab after navigation.
- Keep the focused command as `smoke:search-title-ui`.

## Gates

- [x] `npm run smoke:search-title-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
