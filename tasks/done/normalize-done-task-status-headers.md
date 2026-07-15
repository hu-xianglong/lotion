# Normalize Done Task Status Headers

Status: done

## Why

Several files already live under `tasks/done/` and are marked done in the queue,
but their file header still says `Status: wip`. That makes automated queue
inspection noisy.

## Scope

- Change stale `Status: wip` headers under `tasks/done/` to `Status: done`.
- Do not alter task content or product code.

## Gates

- `git diff --check` passed.
