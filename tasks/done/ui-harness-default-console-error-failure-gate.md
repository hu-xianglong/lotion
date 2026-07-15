# UI Harness Default Console Error Failure Gate

Status: done

## Why

The aggregate UI suite can now reject child manifests with console/page errors,
but focused UI smokes run directly can still finish successfully unless each
script manually reads and checks its own manifest. The shared harness should make
runtime console/page errors fail by default so every migrated UI smoke gets the
same production-quality guard.

## Scope

- Make `withLotionUIHarness` fail a run by default when renderer
  `console.error` or `pageerror` events are observed.
- Keep an explicit opt-out option for rare diagnostic smokes.
- Preserve failure artifacts and failed `harness-result.json` manifests when the
  failure is caused by console/page errors.
- Add an expected-failure harness smoke that intentionally emits a renderer
  `console.error`, catches the harness failure, and asserts the failed manifest
  contains structured console diagnostics.
- Keep the normal foundation smoke passing under the stricter default.
- Document the default console-error behavior.

## Required Gates

- Passed `node --check scripts/ui-harness.mjs`
- Passed `node --check scripts/smoke-ui-harness-console-failure.mjs`
- Passed `npm run smoke:ui-harness-console-failure`
  - Expected failed child artifact: `artifacts/ui-smoke/ui-harness-console-failure-2026-06-15T17-48-24-740Z/harness-result.json`
  - Structured console artifact: `artifacts/ui-smoke/ui-harness-console-failure-2026-06-15T17-48-24-740Z/console.json`
  - `consoleErrorCount` was `1`.
- Passed `npm run typecheck`
- Passed `npm run smoke:ui-harness-foundation`
  - Artifact: `artifacts/ui-smoke/ui-harness-foundation-2026-06-15T17-49-05-082Z/harness-result.json`
  - Desktop and compact viewport coverage remained present.
- Passed `git diff --check`

## Notes

This is a shared UI test harness behavior change. Backend/service tests are not
applicable because no product data model, workspace persistence API, or backend
behavior changed. The focused expected-failure UI smoke covers the new failure
path; the foundation smoke covers the normal no-error path.
