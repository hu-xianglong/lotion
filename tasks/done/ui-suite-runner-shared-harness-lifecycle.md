# UI Suite Runner Shared Harness Lifecycle

Status: done

## Scope

Move the aggregate `smoke:ui` runner onto the shared Electron UI harness for app
lifecycle, CDP URL propagation, failure artifacts, and cleanup. The individual
feature smokes already use the harness; the suite entry point should not keep a
separate hand-rolled Playwright lifecycle path.

## Acceptance

- Use `withLotionUIHarness` in `scripts/smoke-ui-suite.mjs` to start/reuse the
  app once for the full suite.
- Pass the suite harness CDP URL to child smoke scripts and prevent child
  scripts from trying to autostart a second dev server.
- Keep the existing ordered suite list and fail fast with the failing suite
  name and elapsed time.
- Add a filter mode so the suite runner itself can be verified with a focused
  child smoke instead of always running the entire UI suite.
- Keep stale smoke-workspace recent cleanup, but perform it through the shared
  harness page instead of opening a separate raw CDP browser connection.
- Preserve useful JSON summary output for elapsed time, per-suite status, and
  cleanup count.

## Gates

- `node --check scripts/smoke-ui-suite.mjs`
- `npm run typecheck`
- Representative focused UI smoke: `npm run smoke:search-title-ui`
- Suite runner smoke path: `LOTION_UI_SUITE_FILTER=search-title node scripts/smoke-ui-suite.mjs`
- `git diff --check`

## Result

- Wrapped `scripts/smoke-ui-suite.mjs` in `withLotionUIHarness` so the aggregate
  suite owns app lifecycle, CDP URL propagation, and failure artifacts.
- Child smoke scripts now inherit `LOTION_CDP_URL` and
  `LOTION_UI_HARNESS_NO_AUTOSTART=1`, so they reuse the suite app instead of
  trying to start another dev server.
- Added `LOTION_UI_SUITE_FILTER` for focused verification of the suite runner
  without running every UI smoke.
- Kept stale temporary recent cleanup through the harness page, with reload-safe
  readiness retry after child smoke workspace restoration.
- Backend tests are not applicable; this item only changes the UI smoke runner
  lifecycle.

Verified:

- `node --check scripts/smoke-ui-suite.mjs`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `LOTION_UI_SUITE_FILTER=search-title node scripts/smoke-ui-suite.mjs`
- `git diff --check`
