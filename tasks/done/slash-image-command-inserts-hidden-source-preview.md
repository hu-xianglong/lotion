# Slash Image Command Inserts Hidden-Source Preview

Status: done

## Why

`/image` is the remaining core media slash command without an end-to-end editor
regression. Image rendering has regressed before by leaking Markdown source, so
the slash insertion path should verify the generated image markdown persists,
the inactive line renders as an image preview, and the source stays accessible
through the hover Edit source affordance.

## Acceptance

- Add slash command unit coverage for the image template cursor placement.
- Add multi-resolution editor UI smoke coverage for inserting `/image` through
  the real slash menu.
- Verify the slash query is removed and the generated image Markdown persists.
- Verify the inactive image source is hidden by default, an image preview widget
  renders, and the hover-visible Edit source control reveals the source.
- Verify the editor remains usable after leaving the source line and the page
  has no horizontal overflow.

## Verification

- Passed: `node --check scripts/smoke-editor-regression-ui.mjs`
- Passed: `npm run test:slash`
- Passed: `npm run typecheck`
- Passed: `npm run smoke:editor-regression-ui`
- Passed: `npm run smoke:markdown-preview-ui`
- Passed: `git diff --check`

Backend/service tests are not applicable because this item changes slash
templates and renderer live-preview behavior only; renderer behavior is covered
by the multi-resolution editor and markdown preview UI smokes.
