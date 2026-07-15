# Normalize recent done task status headers

Status: done

## Why

The queue marks the recent CSV/performance follow-up tasks as done, but several
files under `tasks/done/` still have `Status: wip`. That makes the queue harder
to audit mechanically.

## Scope

- Update recent done task files to `Status: done`.
- Do not change implementation code.

## Gates

- `git diff --check`
