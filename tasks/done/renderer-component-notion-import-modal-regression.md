# Renderer Component Notion Import Modal Regression

Status: done

## Why

The Notion import workflow has two user-facing entry points: the embedded
plugin page and the modal opened from the workspace/sidebar flow. The embedded
panel now has renderer coverage, but the modal wrapper can still regress
independently.

## Scope

- Add static renderer coverage for `NotionImportDialog`.
- Assert the dialog backdrop and modal shell render.
- Assert the modal uses the normal, non-embedded import panel shell.
- Assert the import heading, default settings, and choose-folder action remain
  reachable through the modal entry point.

## Gates

- `node --check scripts/test-renderer-components.mjs` - passed
- `npm run test:renderer-components` - passed
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Added static renderer coverage for `NotionImportDialog`.
- Asserted the modal backdrop, modal shell, normal non-embedded import panel,
  import heading, default settings group, blank-skip option, and choose-folder
  action render through the modal entry point.
- Backend/service tests are not applicable because this only extends renderer
  presentation coverage; Notion scan/import parsing, writing, progress, and
  report generation behavior were not changed.
