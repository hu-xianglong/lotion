# Renderer Component Database Cell Regression

Status: wip

## Why

Database cells are a frequent source of visible regressions: URL values can be
covered by open affordances, title cells combine icons/editors/open controls,
and computed/system cells must stay read-only. The renderer component gate
should cover these cell-level contracts without requiring a full Electron run.

## Scope

- Extend `scripts/test-renderer-components.mjs` with focused SSR coverage for
  `Cell`.
- Install the default field-type plugin in the test render path so the same
  URL/text providers used by the app render during the component regression.
- Assert URL cells render editable URL inputs plus a distinct open control.
- Assert title cells render the row icon/editor/open control without losing the
  visible title value.
- Assert formula/system values render read-only rather than editable inputs.

## Gates

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

- Extended the renderer component regression script with `Cell` SSR coverage.
- Asserted URL cells expose visible text, editable URL input, and a separate
  accessible open control.
- Asserted title cells preserve row icons, editable title text, and row-page
  open affordance.
- Asserted formula cells render read-only content and no editable input.
- Backend tests are not applicable for this item because the change only adds
  renderer component coverage for existing behavior.

## Verification

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`
