# Production visual custom viewport contract alignment

## Status

Done.

## Context

The production visual gate now defaults to desktop, compact, and wide coverage.
When a developer intentionally overrides `LOTION_UI_VIEWPORTS` for a focused
debug run, the production contract should validate the selected viewport names
instead of reporting a misleading missing-wide failure. The default release gate
still uses the full production visual viewport set.

## Acceptance

- `npm run test:production-visual` still defaults to
  `desktop,compact,wide:1728x1100`.
- When `LOTION_UI_VIEWPORTS` is set, the production visual contract derives its
  required viewport names from that selected value.
- Unit coverage proves custom named viewport parsing, duplicate handling, and
  malformed viewport rejection for the production visual helper.
- Testing docs explain how to run a focused custom-viewport production visual
  debug pass.

## Implementation Notes

- Added `productionVisualViewportNamesFromSelection()` alongside the production
  visual defaults.
- Wired `scripts/test-production-ui-visual-quality.mjs` to pass the parsed
  selected viewport names into `assertProductionVisualGateContract()`.
- Documented focused `LOTION_UI_VIEWPORTS=...` production visual debug runs.

## Verification

- [x] `node --check scripts/test-production-ui-visual-quality.mjs`
- [x] `node --test --test-name-pattern "production visual" test/ui-harness-artifacts.test.mjs`
- [x] `npm run typecheck`
- [x] `git diff --check`
