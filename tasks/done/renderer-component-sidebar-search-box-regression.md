# Renderer Component Sidebar Search Box Regression

Status: done

## Why

The sidebar search entry point is used constantly and has been a source of
latency and interaction concerns. Existing UI smokes cover the global search
panel after it opens, but the static renderer component gate does not assert
the sidebar search button contract itself.

## Scope

- Add static renderer coverage for `SearchBox`.
- Assert the search entry renders as a button with stable search box classes.
- Assert the localized search label is visible.
- Assert the entry point does not render an editable input, keeping text entry
  deferred to the global search panel.

## Gates

- `node --check scripts/test-renderer-components.mjs` - passed
- `npm run test:renderer-components` - passed
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Added static renderer coverage for `SearchBox`.
- Asserted the sidebar search entry renders as a non-submit button with stable
  search box classes and the localized search label.
- Asserted the sidebar search entry does not mount an editable input before the
  global search panel opens, keeping typing work deferred to the tested panel.
- Backend/service tests are not applicable because this only extends renderer
  presentation coverage; search indexing, ranking, recents, and persistence
  behavior were not changed.
