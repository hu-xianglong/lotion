# Search Quick Switcher Visual Snapshot Artifact

Status: done

## Why

The search title smoke verifies ranking labels, icons, filters, recent defaults,
and navigation, but it does not leave a durable visual artifact for reviewing
the search popup. Search has repeatedly regressed in user-visible ways: raw ids
leaking into results, missing icons, unclear type badges, path/subtitle
readability, and compact-width layout.

## Scope

- Extend the shared search-title UI smoke to capture the global search popup in
  desktop and compact viewports.
- Capture one typed-result state and one empty-query recent-defaults state per
  viewport.
- Store metadata with visible hit titles, badges, icons, and paths/previews.
- Keep the existing filter/navigation and no-horizontal-overflow assertions.
- Do not change search ranking, persistence, or backend behavior in this item.

## Gates

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`

## Result

- Extended the shared search-title UI smoke to capture the global search popup
  in desktop and compact viewports.
- Captured typed-result and empty-query recent-defaults states, with metadata
  for visible titles, badges, icons, paths/previews, and expected recent rows.
- Preserved existing assertions for title result labeling, icon fidelity,
  filter behavior, recent page/database/row-page navigation, viewport bounds,
  and no horizontal overflow.
- This item only strengthens UI artifact coverage. Search ranking, recents
  persistence, and backend services were unchanged, so lower-level tests were
  not applicable.

## Verification

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
