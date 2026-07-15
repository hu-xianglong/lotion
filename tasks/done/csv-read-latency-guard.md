# CSV Read Latency Guard

Status: done

## Goal

Add a focused latency guard that exercises the production `readCsvFile` path
against a generated unquoted CSV fixture.

## Scope

- Add a standalone benchmark script for production CSV reads.
- Wire it into npm latency scripts so it can be run directly and as part of the
  fast latency gate.

## Gates

- `npm run test:csv-read-latency`
- `npm run test:latency`
- `git diff --check`
