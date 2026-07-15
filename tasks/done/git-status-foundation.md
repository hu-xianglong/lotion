# Git Status Foundation

## Goal

Make Git status explicit enough for a future Git sync plugin page to render
reliable state instead of parsing a single output string.

## Completed

- Distinguished Git installed vs missing.
- Distinguished initialized Git repo vs missing repo.
- Returned dirty count, clean state, branch, ahead/behind, origin remote, and
  last commit when available.
- Kept Git execution in the main process through `execFile`.
- Covered status semantics in package-core tests.

## Verification

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
