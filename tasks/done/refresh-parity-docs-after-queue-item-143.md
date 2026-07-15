# Refresh Parity Docs After Queue Item 143

Status: done

## Why

The operational queue has moved through plugin manager and command-search work.
The parity sequence should reflect the current state so the next continuous
queue item starts from accurate context.

## Scope

- Update `tasks/todo/notion-core-parity-sequence.md` with queue progress through
  item 143.
- Clarify that basic plugin command discovery/execution now exists, while
  richer command-palette workflows remain future work.

## Gates

- `git diff --check`
