# Renderer Component Notion Import Panel Regression

Status: done

## Why

Notion import remains one of the highest-risk user workflows. The plugin page
needs to keep the import entry point discoverable, show the default import
settings, and clearly explain the blank-row/page skip behavior without relying
on manual UI checks.

## Scope

- Add static renderer coverage for the initial `NotionImportPanel` pick state.
- Assert the embedded plugin-page panel shell renders without the modal
  backdrop.
- Assert the default import options and blank-item definition are visible.
- Assert the choose-folder action is present.

## Gates

- `node --check scripts/test-renderer-components.mjs` - passed
- `npm run test:renderer-components` - passed
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Added static renderer coverage for the initial embedded `NotionImportPanel`
  pick state.
- Asserted the plugin-page panel shell renders without a modal backdrop.
- Asserted the default import settings, all enabled-by-default checkboxes, the
  blank-row/page definition, dedupe option, original export audit option, and
  choose-folder action are visible.
- Backend/service tests are not applicable because this only extends renderer
  presentation coverage; Notion scan/import parsing, writing, progress, and
  report generation behavior were not changed.
