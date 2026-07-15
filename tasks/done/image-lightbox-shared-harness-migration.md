# Image Lightbox Shared Harness Migration

Status: done

## Scope

Move the image lightbox smoke onto the shared Electron UI harness so image
preview/lightbox regression coverage uses deterministic lifecycle, cleanup,
failure artifacts, and desktop plus compact viewport coverage.

## Acceptance

- Use `withLotionUIHarness` instead of hand-rolled CDP lifecycle logic.
- Preserve the workflow where a rendered markdown image can be double-clicked
  into the in-page lightbox and dismissed with Escape.
- Run the workflow across desktop and compact viewports with isolated fixture
  workspaces.
- Assert the image widget and lightbox remain within the viewport and the page
  has no horizontal overflow.
- This should remain UI smoke coverage only; no renderer lightbox behavior or
  backend data behavior changes are expected.

## Gates

- `node --check scripts/smoke-image-lightbox-ui.mjs`
- `npm run typecheck`
- `npm run smoke:image-lightbox-ui`
- `git diff --check`

## Result

- Migrated `scripts/smoke-image-lightbox-ui.mjs` to `withLotionUIHarness`.
- Preserved the rendered markdown image double-click lightbox workflow and
  Escape dismissal assertion.
- Ran the fixture independently across desktop and compact viewports.
- Added no-horizontal-overflow checks plus viewport bounds assertions for the
  image widget and open lightbox.
- This change only updates UI smoke harness coverage; renderer lightbox
  behavior and backend services were not changed, so backend tests were not
  applicable.
