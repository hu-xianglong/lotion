# UI Harness Stable Layout Assertion Helper

Status: done

## Why

Several UI smokes composed layout checks by hand. That made it too easy to miss
one of the common Notion-like quality checks: no horizontal overflow, important
controls visible in the viewport, and key content intersecting the viewport
across desktop and compact window sizes.

## Changes

- Added `assertStablePageLayout` to `scripts/ui-harness.mjs`.
- The helper combines document horizontal overflow checks, critical element
  viewport containment, visible element viewport intersection, and a compact
  focus summary.
- Migrated `scripts/smoke-ui-harness-foundation.mjs` to use the shared helper
  for the page title and editor before and after typing.
- Added harness unit coverage for stable layout summaries and offscreen
  critical element failures.
- Documented the helper as the default layout health check for page-like UI
  smokes.

## Verification

- `node --check scripts/ui-harness.mjs`
- `node --check scripts/smoke-ui-harness-foundation.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `npm run typecheck`
- `npm run smoke:ui-harness-foundation`
  - Artifact:
    `artifacts/ui-smoke/ui-harness-foundation-2026-06-15T18-04-00-561Z/harness-result.json`
  - Covered `desktop` and `compact` viewports with stable layout summaries.
- `git diff --check`
