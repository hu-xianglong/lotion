# Renderer Component Row Property Settings Affordance

Status: done

## Scope

Extend the renderer component regression test to cover the row-page property
field-management affordance. Users manage row page fields from property rows,
so the settings buttons should remain discoverable and should not accidentally
render a dialog before interaction.

## Acceptance

- Row-page properties render field settings buttons when field settings
  callbacks are supplied.
- Settings buttons include accessible labels with the field name.
- Hidden/title/id fields still do not render settings buttons.
- The field settings dialog is not mounted before a user opens a settings
  button.

## Gates

- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

- Extended the renderer component regression script with row-page property
  field-management affordance coverage.
- Asserted settings buttons render when field settings callbacks are supplied
  and include field-name-specific accessible labels.
- Asserted hidden/title/id fields do not expose duplicate settings buttons.
- Asserted the field settings dialog is not mounted before user interaction.
