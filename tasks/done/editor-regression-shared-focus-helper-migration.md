# Editor Regression Smoke Shared Focus Helper Migration

Status: done

## Why

The real editor regression smoke is the highest-value UI suite for Notion-like
editing, but its focus assertion still used a local `document.activeElement`
snippet. It should use the shared focus helper so editor focus semantics are
consistent with the UI harness foundation.

## Scope

- Migrate `scripts/smoke-editor-regression-ui.mjs` to use
  `assertFocusWithin` for editor focus checks.
- Keep the primary scope focused on test-harness migration.
- Fix the real editor image-placeholder regression exposed by the stricter
  console-error gate: slash image placeholders should not request
  `lotion-file://attachments/`, and dropped-image smoke fixtures should create
  the referenced attachment before preview.
- Preserve multi-resolution editor smoke coverage.

## Required Gates

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
- `git diff --check`

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
  - Passed artifact:
    `artifacts/ui-smoke/editor-regression-2026-06-15T19-33-12-208Z`
  - Covered desktop and compact viewports.
- `git diff --check`

## Notes

The first smoke run after enabling the shared focus helper exposed existing
resource errors from invalid image preview sources:

- `lotion-file://attachments/` from the slash image placeholder.
- Missing `attachments/images/dropped-image-*.png` from the dropped-image test
  stub.

The editor now renders a local missing-image placeholder for empty or
directory-like workspace image paths instead of emitting a broken `img` request.
The dropped-image smoke writes the referenced image into the temporary
workspace before asserting the preview.
