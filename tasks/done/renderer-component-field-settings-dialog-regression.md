# Renderer Component Field Settings Dialog Regression

Status: done

## Scope

Extend the renderer component regression test to cover the field settings dialog
structure. The row-page field management workflow has UI smoke coverage, but
the dialog should also have a fast component-level guard for field identity,
editable vs system field states, field type options, wrap/hide controls, and
save/cancel actions.

## Acceptance

- Editable field settings render a dialog with field id, editable name/type
  controls, wrap/hide controls, and save/cancel actions.
- System field settings render the helper text and keep name/type controls
  disabled.
- Select field settings render option editors and color selectors.

## Gates

- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

- Extended the renderer component regression script with SSR coverage for the
  field settings dialog.
- Covered editable field settings with field id, editable name/type controls,
  wrap/hide controls, and save/cancel actions.
- Covered system field settings with disabled name/type controls and the system
  helper text.
- Covered select field option editors, option colors, and helper text.
