# Renderer Component Property Link Regression

Status: done

## Scope

Extend the renderer component regression test to cover property link rendering
directly, not only through row-page source fields. The source/original import
links and standalone markdown links have regressed before by appearing as
plain inputs or ambiguous text, so they should be covered in the fast renderer
component gate.

## Acceptance

- Top-level page `originalNotionHtml` renders as an openable
  `page-property-link`, not as a text input.
- Standalone markdown property links render as link buttons with visible labels
  and open affordances.
- Non-standalone markdown remains editable/readable through the normal property
  value path instead of being converted into a link-only control.

## Gates

- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

- Extended the renderer component regression script to render top-level page
  properties with `originalNotionHtml`, direct markdown property links, and
  mixed markdown text.
- Asserted source/original links render as `page-property-link` buttons with
  visible open affordances instead of editable inputs.
- Asserted mixed markdown text stays on the normal read-only property path and
  does not become a misleading link-only control.
