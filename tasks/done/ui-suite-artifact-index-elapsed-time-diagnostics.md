# UI Suite Artifact Index Elapsed-Time Diagnostics

Status: done

## Why

The UI regression suite artifact index links screenshots and reproduce
commands, but it still hides per-smoke duration in the Markdown summary. When
the suite gets slower, reviewers should see which child smoke is responsible
without opening raw JSON.

## Scope

- Preserve and validate child `elapsedMs` values in the aggregate artifact
  contract.
- Add a top-level slowest-suite summary to `ui-suite-artifacts.json`.
- Show total duration, slowest suites, and per-child elapsed time in
  `ui-suite-artifacts.md`.
- Document that aggregate UI reports are useful for both visual review and
  latency triage.

## Verification

- `node --check scripts/lib/ui-suite-artifacts.mjs && node --check scripts/smoke-ui-suite.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `LOTION_UI_SUITE_FILTER=smoke-row-page-property-visual-ui.mjs npm run smoke:ui`
  - Verified `artifacts/ui-smoke/ui-suite-2026-06-17T12-28-05-912Z/ui-suite-artifacts.json`
    records `slowestSuites`.
  - Verified `artifacts/ui-smoke/ui-suite-2026-06-17T12-28-05-912Z/ui-suite-artifacts.md`
    includes `Total duration`, `Slowest suites`, and per-child `Elapsed`.
- `npm run typecheck`
- `git diff --check`
