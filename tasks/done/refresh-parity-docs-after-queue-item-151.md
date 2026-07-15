# Refresh Parity Docs After Queue Item 151

Status: done

## Why

`tasks/todo/notion-core-parity-sequence.md` should describe the actual
operational queue state so future continuous workers do not restart from stale
priorities.

## What Changed

- Updated the current-next-step summary through queue item 151.
- Noted that renderer plugins now have wired content-addressed attachment
  list/read/write operations through the main-process file service.

## Gates

- `git diff --check`
