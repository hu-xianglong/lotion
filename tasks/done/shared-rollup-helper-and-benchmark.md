# Shared Rollup Helper And Benchmark

Status: done

## Why

Rollup computation now affects cross-database reads and writes. Keeping the
algorithm buried in `DatabaseService` makes it harder to test or benchmark
without duplicating logic.

## Scope

- Extract rollup computation into a shared helper.
- Keep `DatabaseService` responsible for target database loading and CSV writes.
- Add a small rollup latency benchmark that uses the same helper.

## Non-goals

- Do not change rollup semantics.
- Do not broaden relation-cell editing.
- Do not add slow full-workspace benchmarks to the fast gate.

## Acceptance

- Existing package-core rollup tests still pass.
- `npm run test:latency` remains fast.
- A dedicated rollup benchmark can be run manually or in CI later.
- `npm run typecheck` passes.

## Changes

- Extracted rollup computation into `src/shared/rollup.ts`.
- Kept `DatabaseService` responsible for target database reads and CSV writes.
- Added target-record indexing inside rollup computation; benchmark median
  improved from roughly 270ms to roughly 15-20ms for the synthetic case.
- Added `scripts/bench-rollup-latency.mjs`.
- Added `test:rollup-latency` and `benchmark:rollup-latency` package scripts,
  and included the check in `test:fast`.

## Verification

- `npm run typecheck`
- `npm exec tsc -- -p tsconfig.main.json`
- `node --test test/package-core.test.mjs`
- `node scripts/bench-rollup-latency.mjs --check`
- `npm run test:rollup-latency`
- `npm run test:fixtures`
- `npm run test:latency`
- `git diff --check`
