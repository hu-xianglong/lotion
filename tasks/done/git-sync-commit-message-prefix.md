# Git Sync Commit Message Prefix

Status: done

## Why

The Git Sync UI exposes a commit message prefix, but manual backup commits still
use the hard-coded fallback when the caller does not pass a message.

## Scope

- Use the saved `commitMessagePrefix` as the default message for `backupNow()`.
- Preserve explicit `backupNow(message)` overrides.
- Cover both paths in GitService tests.

## Gates

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
