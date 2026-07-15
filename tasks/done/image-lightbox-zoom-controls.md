# Image Lightbox Zoom Controls

Status: done

Priority: highest

Requested by user: add image zoom in/out support.

## Goal

Make rendered page images inspectable in a Notion-like lightbox: users should be
able to open an image, zoom in, zoom out, reset/fit, and close without losing
their editor context.

## Acceptance

- Add visible image lightbox controls for zoom in, zoom out, reset/fit-to-screen,
  and close.
- Support keyboard shortcuts where appropriate, such as `+`, `-`, `0`, Escape,
  and arrow/pan behavior if panning is implemented.
- Support pointer-friendly zoom affordances, such as toolbar buttons and
  optional wheel/pinch handling when safe.
- Keep the image centered and constrained so controls stay visible and no
  horizontal document overflow appears.
- Preserve the existing double-click-to-open and Escape-to-close behavior.
- Preserve editing context: closing the lightbox should return focus/selection
  to the page editor or the image widget path without opening external files.
- Handle small images, large images, missing-image/error states, local
  `lotion-file://` image paths, and imported attachment images.
- Match Lotion's restrained Notion-like UI: compact toolbar, clear icons,
  accessible labels, visible disabled/min/max zoom states if limits exist.

## Required Tests

- Extend `scripts/smoke-image-lightbox-ui.mjs` or add a focused shared-harness
  smoke for image zoom.
- Coded UI coverage must open a rendered markdown image, click zoom in/out,
  reset/fit, and close.
- Assert concrete geometry/state: image rendered size changes after zoom,
  reset returns near the initial fit size, controls remain within viewport, and
  no document horizontal overflow occurs.
- Run across desktop and compact viewports.
- Add keyboard coverage for at least zoom in, zoom out, reset, and Escape.
- Add renderer/component coverage if the lightbox controls are factored into a
  testable component.

## Gates

- `node --check scripts/smoke-image-lightbox-ui.mjs`
- `npm run typecheck`
- `npm run smoke:image-lightbox-ui`
- `git diff --check`

## Result

- Added a compact image preview toolbar with zoom in, zoom out, reset, visible
  zoom percentage, and close controls.
- Added keyboard support for `+`, `-`, `0`, and Escape while the lightbox is
  open.
- Added bounded zoom state with disabled min/max controls, centered image
  scaling, and a constrained stage so controls stay visible.
- Preserved double-click-to-open, Escape-to-close, background-click close, and
  focus restoration to the previous editor context when the lightbox closes.
- Extended the image lightbox smoke fixture from a 1px PNG to a stable local SVG
  attachment so zoom geometry can be asserted reliably.

## Verification

- `node --check scripts/smoke-image-lightbox-ui.mjs`
- `npm run typecheck`
- `npm run smoke:image-lightbox-ui`
- `git diff --check`

Renderer/backend tests were not added because this change stays inside the
CodeMirror DOM widget/lightbox behavior and existing workspace APIs are
unchanged.
