# Row-Page Property UI Regression Lab Foundation

Status: done

## Why

The UI regression backlog calls out row-page property visuals as the first
slice: source links, date fields, empty fields, entity references, and property
row alignment are common user-visible regressions. Existing row-page smokes
cover navigation and editing, but the property visual checks were not isolated
as a reusable CI-ready regression lab.

## What Changed

- Added `scripts/lib/row-page-property-visual-harness.mjs`, a shared deterministic
  fixture and assertion helper for row-page property visual regressions.
- Added `scripts/smoke-row-page-property-visual-ui.mjs`, a focused shared-harness
  Electron smoke that runs across the default desktop and compact viewports.
- Added `npm run smoke:row-page-property-visual-ui` and registered the smoke in
  the aggregate UI suite.
- Documented the local command and expected artifact/debugging scope in
  `docs/testing.md`.

## Coverage

- Source HTML/CSV rows are asserted read-only, link-like, keyboard-focusable,
  and open through the shell dry-run hook.
- Date, empty text, select, multi-select, checkbox, number/text, and entity-ref
  rows are checked for stable value-column alignment, viewport containment, no
  horizontal overflow, and concrete focus behavior.
- The smoke captures row-property screenshots and metadata manifests for both
  desktop and compact viewports.

Backend/service tests are not applicable for this item because it only adds a
deterministic UI regression fixture, shared UI harness helpers, and npm/docs
integration; it does not change data, storage, API, or renderer product
behavior.

## Verification

- `node --check scripts/lib/row-page-property-visual-harness.mjs`
- `node --check scripts/smoke-row-page-property-visual-ui.mjs`
- `node --check scripts/smoke-ui-suite.mjs`
- `node scripts/test-renderer-components.mjs`
- `npm run typecheck`
- `npm run smoke:row-page-property-visual-ui`
  - artifact: `artifacts/ui-smoke/row-page-property-visual-2026-06-16T15-22-34-842Z`
- `git diff --check`
