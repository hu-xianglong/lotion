# View-Query Benchmark CSV Parser Parity

Status: done

## Goal

Keep the view-query latency benchmark aligned with the production CSV reader
after the no-quote fast path landed.

## Scope

- Add the same no-quote fast path to `scripts/bench-view-query.mjs`.
- Keep the quoted fallback unchanged so benchmark correctness remains the same
  for quoted fixture data.

## Gates

- `npm run test:latency`
- `git diff --check`
