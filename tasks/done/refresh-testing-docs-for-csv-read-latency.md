# Refresh testing docs for CSV read latency guard

Status: done

## Why

The CSV read latency guard now exists as a focused package script and is also
part of `npm run test:latency`, but the testing guide still only lists page
open, search, cell edit, and rollup focused latency checks.

## Scope

- Document `npm run test:csv-read-latency` as the focused CSV reader gate.
- Document `npm run benchmark:csv-read-latency` for diagnosis.
- Keep the change documentation-only.

## Gates

- `git diff --check`
