# UI Suite Artifact Index Environment Metadata

Status: done

Queue item: 592

## Why

The aggregate UI regression index now captures screenshots, elapsed time,
console issues, and reproduction commands, but it still lacks the execution
environment that produced those artifacts. When a UI regression only appears on
one platform, CI lane, viewport selection, or filtered suite, the current report
requires manual log digging.

## Acceptance

- `npm run smoke:ui` records deterministic environment metadata in the aggregate
  `ui-suite-artifacts.json`:
  - Node version;
  - platform and architecture;
  - CI flag;
  - selected viewport names;
  - active suite filter;
  - selected child suite scripts.
- `ui-suite-artifacts.md` surfaces that metadata near the top of the report so
  failures are reviewable from CI artifacts without opening raw logs.
- The artifact contract validates that required viewport names are represented
  in the environment metadata as well as the child manifests.
- Existing artifact details, screenshot links, console excerpts, and reproduce
  commands remain unchanged.
- This is harness/reporting work only; no backend tests are applicable.

## Verification Plan

- `node --check scripts/smoke-ui-suite.mjs`
- `node --check scripts/lib/ui-suite-artifacts.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `LOTION_UI_SUITE_FILTER=smoke-ui-harness-foundation.mjs npm run smoke:ui`
- `npm run typecheck`
- `git diff --check`

## Result

- `smoke:ui` now writes aggregate environment metadata into
  `ui-suite-artifacts.json` and `ui-suite-artifacts.md`.
- The metadata includes Node version, platform, architecture, CI flag, selected
  viewport names and dimensions, suite filter, selected child scripts, and the
  runner command.
- The aggregate artifact contract now validates that environment viewport names
  include the required desktop and compact viewports.
- Backend/service tests are not applicable because this item only changes UI
  harness artifact reporting.

## Verification

- `node --check scripts/smoke-ui-suite.mjs` passed.
- `node --check scripts/lib/ui-suite-artifacts.mjs` passed.
- `node --test test/ui-harness-artifacts.test.mjs` passed.
- `LOTION_UI_SUITE_FILTER=smoke-ui-harness-foundation.mjs npm run smoke:ui`
  passed.
  - Artifact: `artifacts/ui-smoke/ui-suite-2026-06-17T13-42-29-963Z/ui-suite-artifacts.json`
  - Report: `artifacts/ui-smoke/ui-suite-2026-06-17T13-42-29-963Z/ui-suite-artifacts.md`
- `npm run typecheck` passed.
- `git diff --check` passed.
