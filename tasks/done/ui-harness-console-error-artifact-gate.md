# UI Harness Console Error Artifact Gate

Status: done

## Why

The shared UI harness now records pass/fail manifests and visual snapshots, but
console errors and page errors are still too easy to overlook unless a smoke
explicitly fails. Production-quality UI regression work needs structured console
diagnostics in every harness manifest and a simple assertion helper that turns
unexpected runtime errors into a focused gate.

## Scope

- Capture structured renderer `console` and `pageerror` events in the shared UI
  harness while preserving the readable console log output.
- Include console issue counts and recent structured issue details in
  `harness-result.json`.
- Add a reusable assertion helper that fails when a harness manifest contains
  console errors or page errors.
- Persist structured console diagnostics in failure artifacts.
- Apply the assertion to the foundation smoke so the shared harness exercises
  the gate across desktop and compact viewports.
- Document the console-error gate as part of the UI test foundation.

## Required Gates

- Passed `node --check scripts/ui-harness.mjs`
- Passed `node --check scripts/smoke-ui-harness-foundation.mjs`
- Passed `node --test test/ui-harness-artifacts.test.mjs`
- Passed `npm run typecheck`
- Passed `npm run smoke:ui-harness-foundation`
  - Artifact: `artifacts/ui-smoke/ui-harness-foundation-2026-06-15T17-29-30-277Z/harness-result.json`
  - Desktop and compact viewports passed.
  - `consoleErrorCount` was `0`.
- Passed `git diff --check`

## Notes

This is a test-foundation slice, not a product UI behavior change. Backend tests
are not applicable because no workspace data, persistence API, or renderer
product behavior changed. Coverage is in the shared harness unit tests plus the
multi-resolution foundation smoke.
