# Embedded View Header Actions Artifact Contract

Status: done

## Why

The page embedded view picker/settings work is implemented, but the shared
embedded-view artifact contract mostly protects table rows, pagination, and
load-more styling. It does not fail if the Notion-like embedded view header loses
its title/subtitle or the Open, Refresh, and Settings controls.

## Scope

- Extend the focused embedded-view UI smoke to collect concrete header evidence
  from a real embedded database table at desktop and compact viewports.
- Assert header title/subtitle, Open/Refresh/Settings button semantics, focus,
  geometry, and no horizontal overflow.
- Exercise Open, Refresh, and Settings actions without relying on manual
  screenshots.
- Extend the embedded-view artifact contract so future smoke artifacts fail if
  header action evidence is missing or weak.

## Acceptance Criteria

- [x] Multi-viewport `smoke:embedded-view-ui` reports embedded header action
  evidence for each viewport.
- [x] Artifact contract verifies header title, subtitle, Open/Refresh/Settings
  controls, focusability, non-overlap, and action results.
- [x] Unit artifact contract test covers the new evidence shape.
- [x] No product-code change unless the test exposes an actual missing behavior.
- [x] Run focused artifact/unit coverage, embedded-view smoke, typecheck, and diff
  check before moving to done.

## Result

Extended the focused embedded-view smoke so the first embedded table captures
real header action evidence at desktop and compact viewports:

- title/subtitle text
- Open, Refresh, and View settings button semantics and hit-target sizes
- Settings keyboard focusability
- Refresh completion state
- Settings dialog opening with rows-per-page controls
- Open navigation to the source database
- no horizontal overflow after returning to the embedded page

The embedded-view artifact contract now fails when header action evidence is
missing or weak, alongside the existing table/pagination/load-more checks.

Latest artifact:

`artifacts/ui-smoke/embedded-view-ui-2026-06-17T20-46-49-511Z`

## Verification

- `node --check scripts/smoke-embedded-view-ui.mjs`
- `node --check scripts/lib/embedded-view-artifacts.mjs`
- `node --test --test-name-pattern "embedded view artifact contract" test/ui-harness-artifacts.test.mjs`
- `npm run typecheck`
- `npm run smoke:embedded-view-ui`
- `git diff --check`
