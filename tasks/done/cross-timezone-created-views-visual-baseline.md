# Cross-Timezone Created-Views Visual Baseline

Status: done

Verification status: verified

## Goal

Make the database created-views visual baseline deterministic on both local
America/Los_Angeles machines and UTC GitHub Actions runners.

## Problem

The fixture stored its three Created time values with a UTC `Z` suffix. The
same values rendered as December 31 locally and January 1 in CI, producing
1,577 differing pixels even though every non-time pixel matched.

## Resolution

- Store all three visual fixture timestamps as fixed local wall-clock values.
- Cover the exact 2024, 2025, and 2026 formatting contract under UTC and
  America/Los_Angeles.
- Refresh all three created-views baseline images while retaining the strict
  zero-pixel comparison policy.

## Verification

- `node --test test/package-core.test.mjs` (54/54 passed).
- Three-viewport created-views visual test in America/Los_Angeles: passed with
  `diffPixels: 0` for desktop, compact, and wide.
- Three-viewport created-views visual test with `TZ=UTC`: passed with
  `diffPixels: 0` for desktop, compact, and wide.
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- GitHub Actions quality gate: pending publication verification.
