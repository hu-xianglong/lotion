# Renderer Component Row Template Dialog Regression

Status: wip

## Why

Database templates should behave like normal page records with field defaults
and markdown body defaults. The row template dialog is a fragile database
management surface because it mixes template selection, field default editors,
full-width page settings, markdown body editing, and delete/save actions.

## Scope

- Extend `scripts/test-renderer-components.mjs` with SSR coverage for
  `RowTemplateDialog`.
- Assert existing and new template choices render.
- Assert editable field defaults render for supported fields while system,
  hidden, formula, and rollup fields are excluded.
- Assert markdown body, full-width setting, delete, cancel, and save actions
  render.

## Gates

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

- Extended the renderer component regression script with `RowTemplateDialog`
  SSR coverage.
- Asserted existing and new template choices, editable field defaults,
  markdown body, full-width setting, and delete/cancel/save actions render.
- Asserted system, hidden, formula, and rollup fields are excluded from template
  defaults.
- Fixed the dialog initial state so an already-selected existing template shows
  its values on the first render instead of waiting for a follow-up effect.
- Backend tests are not applicable because template persistence behavior was
  not changed; this item only adjusts renderer initial state and adds renderer
  component coverage.

## Verification

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`
