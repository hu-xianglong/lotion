# Renderer Component Management View Regression

Status: done

## Why

The All pages and Recent management surfaces are daily navigation fallbacks.
User-visible regressions here have included unclear titles, raw ids, and missing
entity context. Static renderer coverage does not directly assert the page-list
or recent-list branches.

## Scope

- Add renderer coverage for the `ManagementView` pages branch.
- Add renderer coverage for the `ManagementView` recent branch with page,
  database, and row-page entries.
- Assert titles, counts, kind labels, timestamps, and entity icons render
  without falling back to raw ids for known entities.

## Verification

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

- Added static renderer fixtures for `ManagementView` pages and recent branches.
- Asserted page-list titles, counts, timestamps, and page icons.
- Asserted recent page/database/row-page titles, kind labels, row-page icons,
  and no raw id fallback for known entities.
- Kept this renderer-only; backend/service tests are not applicable because no
  data model, IPC, persistence, or API behavior changed.

Verified:

- `node --check scripts/test-renderer-components.mjs` passed.
- `npm run test:renderer-components` passed.
- `npm run typecheck` passed.
- `git diff --check` passed.
