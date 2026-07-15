# Renderer Component View Settings Dialog Regression

Status: wip

## Why

Database view settings are a high-risk Notion parity surface: view type,
visible fields, field ordering, default row template, page size, and plugin
view config all affect how a database behaves. The renderer component gate
should pin the expected controls so future UI changes do not silently drop
database management affordances.

## Scope

- Extend `scripts/test-renderer-components.mjs` with SSR coverage for
  `ViewSettingsDialog`.
- Assert the dialog exposes name/type controls, visible-field controls and move
  buttons, default template selection, page-size choices, plugin provider
  config rows, duplicate/default/delete/save actions, and hides hidden fields.
- Keep this as test-only renderer coverage for existing behavior.

## Gates

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

- Extended the renderer component regression script with `ViewSettingsDialog`
  SSR coverage.
- Asserted view name/type controls, builtin and plugin view type options,
  visible field controls, field move actions, default template selection,
  page-size choices, provider config controls, and dialog actions render.
- Asserted hidden fields do not render in the visible-field management list.
- Backend tests are not applicable for this item because the change only adds
  renderer component coverage for existing UI behavior.

## Verification

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`
