# Image Lightbox Artifact Contract And Regression Lane

Status: done

Queue item: 598

Backlog source: `tasks/todo/ui-regression-lab-and-renderer-coverage.md`.

## Why

Image preview/lightbox is a user-visible editor surface that had a shared-harness
smoke, but no machine-readable artifact contract and no focused UI regression
lane entry. It now records deterministic zoom/control/close evidence and
desktop/compact screenshots for the aggregate UI artifact index.

## Acceptance

- Add an Image Lightbox artifact contract that requires desktop and compact
  viewport evidence.
- The contract verifies image widget discovery, double-click open, toolbar
  controls, zoom in/out/reset behavior, keyboard zoom evidence, close behavior,
  no horizontal overflow, and screenshot/metadata files.
- Include Image Lightbox in the focused UI regression gate.
- Keep this scoped to UI harness/regression coverage; no product behavior
  changes.

## Verification

- `node --check scripts/lib/image-lightbox-artifacts.mjs` - passed
- `node --check scripts/smoke-image-lightbox-ui.mjs` - passed
- `node --test test/ui-harness-artifacts.test.mjs` - passed
- `npm run smoke:image-lightbox-ui` - passed
  - Artifact: `artifacts/ui-smoke/image-lightbox-ui-2026-06-17T15-28-42-464Z/harness-result.json`
- `LOTION_UI_SUITE_FILTER=image-lightbox npm run smoke:ui` - passed
  - Artifact index: `artifacts/ui-smoke/ui-suite-2026-06-17T15-29-35-881Z/ui-suite-artifacts.json`
  - Report: `artifacts/ui-smoke/ui-suite-2026-06-17T15-29-35-881Z/ui-suite-artifacts.md`
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Added `assertImageLightboxArtifactContract` for image preview/lightbox
  behavior.
- The lightbox smoke now records zoom geometry, toolbar controls, keyboard zoom,
  reset geometry, close evidence, and screenshot metadata per viewport.
- Added Image Lightbox to the `test:ui-regression` filter.
- No backend/service tests are applicable because this item only adds UI harness
  coverage and smoke artifact validation.
