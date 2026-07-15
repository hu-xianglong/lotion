# Recent quick-switcher keyboard navigation regression

Status: done

## Problem

The global search quick-switcher already shows recent pages, databases, and row
pages for an empty query, and existing smoke coverage clicks those recent rows.
That still leaves a Notion-like keyboard path under-covered: opening global
search with an empty query should let users use Arrow keys and Enter to navigate
recent items without touching the mouse.

## Scope

- Extend the existing search title UI smoke instead of adding another harness.
- Cover empty-query recent rows at desktop and compact viewport sizes.
- Verify active-row visibility, no horizontal overflow, and keyboard Enter
  navigation for a recent page, database, and row page.
- Keep this as UI smoke coverage only unless the test exposes a product bug.

## Acceptance

- Empty-query global search renders recent page/database/row-page entries.
- Empty-query global search has one active recent row by default, even when
  earlier smoke steps have changed the exact recent ordering.
- Arrow keys can move the active row to target recent entries without leaving
  the search input unusable.
- Enter opens the active recent page, database, and row page.
- The search dialog closes and the target tab/page/database is active.
- Desktop and compact runs assert no horizontal overflow.

## Verification

- [x] `node --check scripts/smoke-search-title-ui.mjs`
- [x] `npm run typecheck`
- [x] `npm run smoke:search-title-ui`
  - Artifact: `artifacts/ui-smoke/search-title-2026-06-14T16-13-46-833Z`
- [x] `git diff --check`

## Notes

- Extended the shared search title UI smoke to cover empty-query recent-row
  keyboard navigation at desktop and compact viewport sizes.
- The smoke now selects exact recent page/database/row-page titles with Arrow
  keys before pressing Enter, because earlier smoke steps can legitimately
  update recent ordering.
- Tightened recent click assertions to select rows by exact title so a row-page
  preview containing a database title cannot be mistaken for the database row.
- Backend/service tests are not applicable for this item; it only adds UI
  regression coverage and does not change search, recent persistence, or data
  service behavior.
