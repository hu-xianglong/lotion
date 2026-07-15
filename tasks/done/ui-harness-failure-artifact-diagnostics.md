# UI Harness Failure Artifact Diagnostics

Status: done

## Scope

Improve the shared Electron UI harness failure artifacts so frontend regression
failures are easier to inspect without rerunning the app. This is a small
production-test-foundation slice after the UI suite runner migration.

## Acceptance

- Failure artifacts include a machine-readable manifest with script name,
  timestamp, URL, viewport, error summary, and all generated artifact paths.
- Failure artifacts include a short human-readable README pointing to the
  screenshot, DOM snapshot, console log, dev log, and error stack.
- Existing screenshot, DOM, console, dev log, error, and state files continue
  to be written.
- Add a focused coded test for the artifact writer using a deterministic fake
  page object.
- Run a representative UI smoke to ensure harness behavior remains compatible.

## Gates

- `node --check scripts/ui-harness.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `npm run typecheck`
- Representative focused UI smoke: `npm run smoke:search-title-ui`
- `git diff --check`

## Result

- Added `metadata.json` to UI harness failure artifacts with smoke name,
  timestamp, URL, viewport, error details, and generated artifact paths.
- Added a human-readable `README.md` to each failure artifact directory so a
  failing UI run points directly to the screenshot, DOM snapshot, console log,
  dev log, error stack, state, and metadata.
- Kept the existing screenshot, DOM, console, dev log, error, and state files.
- Added a focused Node test using a deterministic fake page object to verify
  the artifact files and metadata contents.
- Backend tests are not applicable; this only changes UI test harness
  diagnostics, not application data or service behavior.

Verified:

- `node --check scripts/ui-harness.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
