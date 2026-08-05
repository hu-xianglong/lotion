# Database Settings Menu Shell

Status: done

Verification status: verified

Priority: P0

Depends on: Database view transactional persistence

## Goal

Replace the all-in-one gear dialog as the primary entry point with a compact,
keyboard-accessible settings menu that separates saved-view and database scope.

## Delivered

- Built reusable Menu/Submenu primitives with focus management, Escape,
  outside-click dismissal, viewport clamping, danger sections, and compact
  sheet fallback.
- Added View settings entries: Layout, Property visibility, Filter, Sort, Group,
  Open pages in, and Copy link to view.
- Added Database settings entries: Edit properties, Templates, Deleted items,
  and Lock database.
- Kept complex editors in focused subpanels; replacement tasks can retire duplicated controls from
  `ViewSettingsDialog` as replacement tasks land.

- Added shared capability flags and explicit disabled reasons for system
  databases, plus focused unit coverage.
- Extended the database interaction artifact contract with a required settings
  scope screenshot for each exercised viewport.

## Acceptance

- Scope is obvious before the user changes anything.
- Every entry is reachable by mouse and keyboard at desktop/compact widths.
- The menu never renders offscreen and one Escape closes one menu level.

## Verification

- `npm run test:renderer-components`
- `node --test --test-name-pattern='database settings capabilities' test/package-core.test.mjs`
- `node --test test/database-settings-menu-artifacts.test.mjs`
- `LOTION_UI_SUITE_FILTER=database-settings-menu npm run smoke:ui`
- `LOTION_UI_VIEWPORTS=desktop,compact npm run smoke:database-interaction-ui`
- `npm run typecheck`
- `npm run build`

### Verified evidence — 2026-07-22

- Desktop and compact settings scope menus passed keyboard entry and one-level
  Escape navigation with zero horizontal overflow. The compact viewport used
  the bottom-sheet fallback. Evidence:
  `artifacts/ui-smoke/database-interaction-ui-2026-07-22T16-31-09-760Z/`.
- Renderer menu primitives, system-database capability reasons, TypeScript,
  and the production build all passed. The build emitted only the existing
  large-chunk advisory.

### Dedicated verification evidence — 2026-07-22

- Added a focused real-UI smoke at 1440×1000 and 680×760. It verifies initial
  focus, ArrowDown/Enter submenu navigation, one Escape per menu level,
  outside-click dismissal, viewport bounds, compact sheet fallback, all view
  and database entries, Filter wiring, and the system-database disabled reason.
- Added and unit-tested an artifact contract requiring both viewport snapshots
  and every interaction result. The filtered suite passed with 0 console
  errors, 2 snapshots (251,320 bytes), and 0 missing artifact contracts.
  Evidence: `artifacts/ui-smoke/database-settings-menu-ui-2026-07-22T16-37-24-111Z/`
  and `artifacts/ui-smoke/ui-suite-2026-07-22T16-37-18-532Z/`.
- The renderer gate exposed an SSR crash in the concurrently added view-tab
  preference initializer (`window is not defined`). Guarded browser-only state
  initialization and reran renderer coverage successfully.
- Final gates passed: capability unit test, artifact-contract unit test,
  renderer component regression, TypeScript typecheck, production build, and
  `git diff --check`. The build emitted only the existing large-chunk advisory.
