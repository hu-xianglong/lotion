# Refresh latency benchmark backlog wording

Status: done

## Why

The queue's latency benchmark backlog still lists several benchmarks that now
exist. Keeping that stale list around makes it easy to create duplicate tasks.

## Scope

- Replace the stale "benchmarks to add" list with current focused coverage.
- Align the Notion core parity latency-gates wording with the shipped guards.
- Keep the change documentation-only.

## Gates

- `git diff --check`
