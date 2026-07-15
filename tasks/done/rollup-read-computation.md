# Rollup Read Computation

Status: done

## Why

Rollup fields now have schema/config, but they still display only stored CSV
values. A minimal read-time compute path makes rollups useful while keeping the
first implementation scoped and measurable.

## Scope

- Compute rollup values from structured `EntityRef[]` relation cells.
- Support `count`, `count_values`, `sum`, `average`, `min`, `max`, `range`, and
  `show_original`.
- Read target databases directly without recursively evaluating target rollups.
- Keep rollup fields read-only.
- Add package-core coverage.

## Non-goals

- Do not implement reciprocal relation maintenance.
- Do not add picker UI.
- Do not implement recursive rollup dependencies.

## Acceptance

- `DatabaseService.get()` returns computed rollup values.
- Source writes keep rollup fields computed consistently with current target
  data.
- Missing targets fail soft to empty/count zero values.
- `npm run typecheck` passes.
- `npm run test:fixtures` passes.
- `npm run test:latency` passes.

## Changes

- Added read/write-path rollup computation in `DatabaseService`.
- Parsed structured `EntityRef[]` relation cells to resolve row targets.
- Read target databases directly and applied local formulas before aggregation.
- Supported `count`, `count_values`, `sum`, `average`, `min`, `max`, `range`,
  and `show_original`.
- Added package-core coverage for rollup sum/count.

## Verification

- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm exec tsc -- -p tsconfig.main.json`
- `node --test test/package-core.test.mjs`
- `git diff --check`
