# UI Suite Artifact Index Viewport Screenshot Coverage

Status: done

## Why

The aggregate UI suite gate verifies child smokes observe desktop and compact
viewports, but it could still pass if the screenshot artifact contract only
contained a screenshot for one viewport. That weakened the multi-resolution UI
testing policy because compact visual regressions might not have reviewable
artifacts.

## Scope

- Track screenshot viewport names in the aggregate artifact index.
- Validate that every required viewport has at least one screenshot when a
  child smoke provides an artifact contract.
- Surface missing screenshot viewports in JSON/Markdown diagnostics.
- Keep the change in the shared artifact contract layer so every UI smoke gets
  the same guard.

## Verification

- `node --check scripts/lib/ui-suite-artifacts.mjs && node --check scripts/smoke-ui-suite.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `LOTION_UI_SUITE_FILTER=smoke-row-page-property-visual-ui.mjs npm run smoke:ui`
  - Verified `artifacts/ui-smoke/ui-suite-2026-06-17T12-40-20-631Z/ui-suite-artifacts.json` records `desktop` and `compact` screenshot viewport coverage.
  - Verified the generated Markdown index has no `missing screenshots=...` diagnostic for the passing desktop/compact run.
- `npm run typecheck`
- `git diff --check`
