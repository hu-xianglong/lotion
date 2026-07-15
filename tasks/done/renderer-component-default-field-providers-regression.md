# Renderer Component Default Field Providers Regression

Status: done

## Why

Default database field providers are the UI path for high-frequency properties:
text, number, select, multi-select, date, URL, entity references, checkbox, and
read-only computed fields. User feedback has repeatedly surfaced subtle
field-rendering regressions around alignment, editability, URL affordances, and
read-only source/computed values.

## Changes

- Added renderer component coverage that installs the real default field-type
  plugin through an isolated plugin host.
- Rendered representative values for text, person, number, select,
  multi-select, date, URL, entity reference, checkbox, formula, and rollup
  providers.
- Asserted editable providers expose expected inputs or controls.
- Asserted URL and entity reference providers expose separate openable
  affordances while URL values remain editable.
- Asserted formula and rollup providers remain read-only and do not expose
  editable inputs.

## Verification

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`
