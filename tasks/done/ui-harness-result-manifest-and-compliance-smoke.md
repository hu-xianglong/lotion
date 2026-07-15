# UI Harness Result Manifest And Compliance Smoke

Status: done

Backlog item: UI regression lab and renderer coverage.

## Why

The shared UI harness already controls Electron lifecycle, viewports, cleanup,
and failure artifacts, but successful runs still rely on each individual smoke
to decide whether and where to write a result artifact. That weakens CI/local
diagnostics and makes it harder to audit whether a frontend smoke actually ran
the required desktop and compact viewport checks.

## Acceptance

- The shared UI harness writes a standard success/failure manifest artifact for
  every harness run.
- The manifest records suite name, status, timestamp, artifact root, renderer
  URL, viewport at completion, expected viewport presets, observed viewport
  coverage, and a compact result summary.
- A reusable assertion/helper detects missing required viewport coverage from a
  returned smoke result.
- Add a focused harness-compliance UI smoke that uses a deterministic workspace,
  runs desktop and compact viewports, asserts app/editor geometry, no horizontal
  overflow, focus behavior, and validates the generated harness manifest.
- Add a CI-ready npm script and testing docs entry for the harness compliance
  smoke.
- Backend/service tests are not applicable unless application persistence or
  API behavior changes; this item should stay in UI test infrastructure.

## Result

- Added a standard `harness-result.json` artifact for shared UI harness runs.
- The manifest records status, suite name, artifact root, CDP URL, renderer URL,
  final viewport, expected viewport presets, observed viewport coverage,
  missing viewport names, compact result summary, and log counts.
- Added `assertHarnessViewportCoverage` so UI smokes can fail explicitly when
  desktop/compact coverage is missing.
- Added `npm run smoke:ui-harness-foundation`, a deterministic multi-resolution
  harness compliance smoke that checks page/editor geometry, no horizontal
  overflow, editor focus, autosave persistence, and the generated manifest.
- Added the foundation smoke to the aggregate UI suite and documented the
  manifest/gate in `docs/testing.md`.
- Backend/service tests are not applicable because this is UI harness/test
  infrastructure and does not change app persistence or service behavior.

## Verification

- [x] `node --check scripts/ui-harness.mjs`
- [x] `node --check scripts/smoke-ui-harness-foundation.mjs`
- [x] `node --test test/ui-harness-artifacts.test.mjs`
- [x] `npm run typecheck`
- [x] `npm run smoke:ui-harness-foundation`
  (`artifacts/ui-smoke/ui-harness-foundation-2026-06-15T16-38-02-761Z/harness-result.json`)
- [x] `git diff --check`
