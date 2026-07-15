# Page Star Favorite Direct Toggle Regression

Started: 2026-06-15T00:00:00Z

## Why

The command palette can toggle the current page favorite state, but the
Notion-like page star in the page action bar is the more direct daily workflow.
It needs coded coverage so the visible star does not regress into a decorative
button that fails to update the sidebar Favorites section.

## Scope

- Extend the existing command/search UI smoke rather than adding another
  one-off app lifecycle script.
- In a real page context, click the page action bar star directly.
- Assert the star exposes the correct pressed state and visible affordance.
- Assert the Sidebar Favorites section gains the current page, then click again
  and assert it is removed.
- Keep the existing command palette favorite action coverage after the direct
  toggle so both workflows remain protected.
- Cover both desktop and compact/narrow viewports through the shared harness.

## Tests

- [x] `node --check scripts/smoke-search-title-ui.mjs`
- [x] `npm run typecheck`
- [x] `npm run smoke:search-title-ui`
- [x] `git diff --check`

## Result

- Extended `scripts/smoke-search-title-ui.mjs` with a direct page action-bar
  favorite toggle regression.
- The smoke now clicks the page star on a newly created page, asserts keyboard
  focus, `aria-pressed`, filled-state class, Sidebar Favorites insertion,
  layout/overflow safety, then clicks again and asserts removal.
- The existing command palette favorite action still runs afterward, so both
  favorite entry points are protected in the same desktop and compact harness
  pass.
- UI artifact: `artifacts/ui-smoke/search-title-2026-06-16T05-43-32-292Z/`.

No backend/service tests were added because this item only strengthens coded UI
coverage for existing favorite APIs and did not change persistence behavior.
