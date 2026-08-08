# Cross-Timezone Page-History Visual Baseline

Status: done

Verification status: verified

## Goal

Make the page-history restore-preview baseline deterministic on local
America/Los_Angeles machines and UTC GitHub Actions runners.

## Problem

The fixture committed history with explicit UTC timestamps. The same commits
rendered as 5:00 AM locally and 12:00 PM in CI. Because the timestamp text is
subtle, the strict visual comparison surfaced the mismatch as one changed
pixel instead of making the timezone cause obvious.

## Resolution

- Commit fixture history at a timezone-local 5:00 AM wall-clock time.
- Cover real Git commit timestamps under UTC and America/Los_Angeles.
- Retain the strict zero-pixel visual comparison policy.

## Verification

- `node --test test/package-core.test.mjs` passed (55/55).
- Three-viewport page-secondary visual test in America/Los_Angeles passed
  with zero changed pixels.
- Three-viewport page-secondary visual test with `TZ=UTC` passed with zero
  changed pixels.
- `npm run typecheck` passed.
- `npm run test:fixtures` passed.
- `npm run test:latency` passed.
- GitHub Actions quality gate: pending publication verification.
