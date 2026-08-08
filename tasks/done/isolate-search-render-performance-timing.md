# Isolate Search Render Performance Timing

Status: done

Verification status: verified

## Goal

Measure one search request and render against the existing performance budget
without weakening the separate pending-input interaction regression.

## Problem

The first-render timer included typing an extra character, waiting for the
input update, and pressing Backspace while search requests carried a deliberate
350ms harness delay. On a shared runner that interaction sequence measured
1,741.8ms even though its individual search queries completed in 393.6-444ms.

## Resolution

- Exercise editable pending input before collecting performance samples.
- Preserve assertions for loading copy, focus, typing, Backspace, and the
  completed large-result state.
- Record and validate pending-input evidence in the artifact contract.
- Measure first and repeated render samples as one query-to-results operation.
- Keep the existing 1,500ms render budget unchanged.

## Verification

- Shared-CDP Search popup suite passed for desktop, compact, and wide.
- First renders: 673.2ms, 721.6ms, and 691.4ms.
- Repeated renders: 658.2ms, 716.2ms, and 722.0ms.
- All three production visual baselines passed with `diffPixels: 0`.
- Pending input, sorting, keyboard navigation, jump-to-line, overflow, and
  artifact-contract assertions passed with no console errors.
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- GitHub Actions quality gate: pending publication verification.
