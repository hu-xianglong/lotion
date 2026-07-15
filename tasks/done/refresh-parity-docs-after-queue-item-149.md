# Refresh Parity Docs After Queue Item 149

Status: done

## Why

The queue has added command filtering, list-view regression coverage, and a
fresh full UI smoke run. Update the parity sequence so future queue work starts
from the current state.

## Scope

- Update `tasks/todo/notion-core-parity-sequence.md` through queue item 149.
- Mention command filtering and list-view smoke parity with gallery/calendar.

## Gates

- `git diff --check`
