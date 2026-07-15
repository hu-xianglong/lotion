# Tag page management view first pass

Backlog item: tag pages and richer backlink workflows.

## Why

Sidebar tag sections are useful for grouping pages and databases, but a custom
tag still behaves only like a sidebar filter. Notion-like navigation needs a
concrete tag page users can open, inspect, and navigate from without falling
back to search-only chips.

## Acceptance

- Custom sidebar tag sections expose an explicit, keyboard-accessible affordance
  to open that tag page.
- The tag page lists matching pages and databases in one Notion-like management
  view with title, counts, icon, entity type, path, and updated date.
- Clicking or pressing Enter/Space on a tag-page result opens the matching page
  or database.
- Built-in Pages/Databases management behavior remains unchanged.
- Tabs/history can persist and restore tag management pages.
- Desktop and compact/narrow layouts have no horizontal overflow and keep the
  tag page affordance visible and focusable.

## Tests

- Renderer component coverage for the custom tag management view.
- Multi-resolution sidebar/navigation UI smoke coverage for opening a custom
  tag page, keyboard focus, navigation from page and database rows, and no
  horizontal overflow.
- Backend/service tests are not applicable unless this item changes persisted
  workspace data or APIs; the first pass reuses existing page/database metadata.

## Gates

- Passed: `node --check scripts/test-renderer-components.mjs`
- Passed: `node --check scripts/smoke-sidebar-navigation-ui.mjs`
- Passed: `npm run test:renderer-components`
- Passed: `npm run typecheck`
- Passed: `npm run smoke:sidebar-navigation-ui`
- Passed: `git diff --check`

## Result

- Added tag management pages addressable as management tabs/history entries.
- Added a sidebar tag-page affordance for custom tag sections plus a visible
  tag-page row in each custom tag section.
- Added a Notion-like tag management table listing matching pages and databases
  with icon, type, path, and updated date where available.
- Added renderer/component coverage and multi-resolution sidebar UI smoke
  coverage for opening the tag page, keyboard focus, row navigation, and layout
  overflow.
