# Raw Markdown Smoke Setting Restore

## Goal

Ensure the raw markdown UI smoke does not permanently change the user's global
raw markdown preference.

## Scope

- Read the raw markdown localStorage setting before the smoke changes it.
- Restore the setting in `finally`.
- Keep the existing raw-toggle stability assertions.

## Gates

- [x] `npm run smoke:markdown-preview-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
