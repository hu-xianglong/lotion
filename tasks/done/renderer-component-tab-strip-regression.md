# Renderer Component Tab Strip Regression

Status: done

## Why

The tab strip is a high-traffic navigation surface, and prior regressions showed
row ids or unclear entity types instead of user-facing page/database labels.
Renderer coverage currently does not directly exercise the tab labels, type
badges, empty tab state, close action, or open-in-new-window affordance.

## Scope

- Add static renderer coverage for `TabStrip`.
- Assert page, database, row-page, management, and blank-tab labels.
- Assert row-page tabs use the active row title and database context instead of
  raw ids.
- Assert type badges, close buttons, pop-out buttons, and the new-tab button
  render with accessible labels.

## Verification

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

- Added a static renderer fixture for `TabStrip` covering page, database,
  row-page, management, and blank tabs.
- Asserted type badges, active tab state, user-facing row-page labels with
  database context, no raw row id leakage, pop-out actions, close buttons, and
  the new-tab affordance.
- Kept this renderer-only; backend/service tests are not applicable because no
  tab state, persistence, IPC, or API behavior changed.

Verified:

- `node --check scripts/test-renderer-components.mjs` passed.
- `npm run test:renderer-components` passed.
- `npm run typecheck` passed.
- `git diff --check` passed.
