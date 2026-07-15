# Prevent URL Cell Display Overlap

## Goal

URL cells should show one clean link-style value and an open affordance without
the editable input layer visually overlapping the display text.

## Changes

- Changed inactive URL cell inputs from transparent text to fully hidden
  opacity, including transparent caret color, so the display layer is the only
  visible text until the cell receives focus.
- Kept focus behavior unchanged: clicking the displayed URL focuses the input,
  hides the display layer, and keeps the cell editable.
- Extended the URL field UI smoke test to assert inactive URL inputs are hidden
  and display text does not overlap the open button.

## Verification

- [x] `npm run typecheck`
- [x] `npm run smoke:url-field-ui`
- [x] `git diff --check`
