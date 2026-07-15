# UI Suite Console Issue Excerpts

Status: done

## Why

The aggregate UI suite index recorded `consoleErrorCount`, but it did not expose
the actual console/page-error text. When a UI smoke emitted an error, reviewers
had to open the child manifest before they could tell whether it was a layout
assertion, a renderer exception, or a network/runtime failure.

## Scope

- Preserve child harness console issue excerpts in the suite summary.
- Show short console issue details in the aggregate Markdown details column.
- Keep excerpts bounded and sanitized so the aggregate report stays readable.

## Verification

- `node --check scripts/lib/ui-suite-artifacts.mjs && node --check scripts/smoke-ui-suite.mjs && node --check scripts/ui-harness.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `npm run typecheck`
- `LOTION_UI_SUITE_FILTER=smoke-row-page-property-visual-ui.mjs npm run smoke:ui`
  - Generated `artifacts/ui-smoke/ui-suite-2026-06-17T13-03-34-003Z/ui-suite-artifacts.json`
  - Generated `artifacts/ui-smoke/ui-suite-2026-06-17T13-03-34-003Z/ui-suite-artifacts.md`
- `git diff --check`
