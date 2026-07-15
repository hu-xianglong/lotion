# Tag pages in command palette

Backlog item: tag pages and richer backlink/search workflows.

## Why

Tag pages now exist as sidebar management views, but users still have to find
the sidebar tag section first. Notion-like navigation should make tag pages
discoverable from the command palette/global search, with the same keyboard
flow as pages, databases, and built-in commands.

## Acceptance

- Global search/command palette includes custom workspace tags as tag-page
  navigation entries.
- Empty-query command palette shows tag-page entries after recent navigation
  and before or alongside command rows.
- Typed queries matching a tag name return the tag page with a clear `Tag`
  badge, `#tag` title, item count, and source context.
- Clicking or pressing Enter on the tag search result opens the corresponding
  tag management page and closes search.
- Desktop and compact/narrow layouts keep tag results visible, keyboard
  focusable, and free of horizontal overflow.
- Search result behavior for ordinary pages, databases, rows, and commands
  remains unchanged.

## Tests

- Extend search title UI smoke with a tagged page/database fixture, empty-query
  tag-page discovery, typed tag query, keyboard activation, and multi-viewport
  layout assertions.
- Extend renderer component coverage for tag entries if the search panel static
  render path is touched.
- Backend/service tests are not applicable unless this item changes search
  service persistence/API behavior; tag pages are derived from existing
  renderer page/database metadata.

## Gates

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`

## Result

- Added derived tag-page search items to the global search/command palette:
  empty query now orders recent items before tag pages and commands, while
  typed tag queries surface matching `#tag` pages with counts.
- Tag search rows activate the existing tag management page through
  `openManage(tag:<encoded>)`, preserving normal page/database/row/command
  navigation behavior.
- Added renderer component coverage for tag rows in the static search panel.
- Extended the shared-harness search-title UI smoke with tagged page/database
  fixtures, empty-query tag discovery, click navigation, typed query keyboard
  activation, tag management assertions, and desktop/compact layout checks.
- Backend/service tests are not applicable: this item derives tag pages from
  existing renderer page/database metadata and does not change persisted data or
  backend search APIs.

## Verification

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`
