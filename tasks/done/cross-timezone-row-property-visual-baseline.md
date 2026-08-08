# Cross-Timezone Row Property Visual Baseline

Status: done

Verification status: verified

## Goal

Make the row-page property visual baseline deterministic on both local
America/Los_Angeles machines and UTC GitHub Actions runners.

## Problem

The fixture stored `2026-01-01T00:00:00.000Z`, so the same Created/Updated
values rendered as December 31 locally and January 1 in CI. The screenshot
dimensions and every non-time property matched, but the two localized timestamp
rows produced 1,256 differing pixels.

## Resolution

- Store the visual fixture timestamp as a fixed local wall-clock value without
  a zone suffix.
- Cover the formatting contract under both UTC and America/Los_Angeles.
- Refresh all three row-property baseline images while retaining a strict
  zero-pixel comparison policy.

## Verification

- `npm run typecheck`
- `node --test test/package-core.test.mjs` (54/54 passed)
- Three-viewport row-property visual test (desktop, compact, wide): passed with
  `diffPixels: 0` for every viewport.
- Desktop row-property visual test with `TZ=UTC`: passed with `diffPixels: 0`.
- Desktop row-property visual test with `TZ=America/Los_Angeles`: passed with
  `diffPixels: 0`.
- GitHub Actions quality gate: pending publication verification.
