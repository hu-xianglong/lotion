# Renderer Component Page Editor Shell Regression

Status: done

## Why

`PageEditor` is the main local writing surface, but the static renderer
component harness does not yet cover its visible shell. Bugs around the empty
page prompt, path/title area, action controls, and editor body can ship even
when lower-level page property and markdown smokes pass.

## Scope

- Add renderer component coverage for the empty-page prompt state, including
  template options, the empty-page action, and new-template affordance.
- Add renderer component coverage for the normal editor shell, including path,
  title, action controls, and the CodeMirror mount container.
- Keep this as renderer presentation coverage only; do not change editor
  behavior, persistence, keyboard handling, or CodeMirror integration.

## Gates

- `node --check scripts/test-renderer-components.mjs` - passed
- `npm run test:renderer-components` - passed
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Added renderer component coverage for the `PageEditor` empty-page prompt,
  including supplied templates, the selected empty-page action, and the
  new-template affordance.
- Added renderer component coverage for the normal editor shell, including the
  page layout, path/title/action area, favorite state, body wrapper, CodeMirror
  mount container, and embedded-view preload host.
- Backend/service tests are not applicable because this only adds static
  renderer coverage and no product/data behavior changed.
