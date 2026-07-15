# Built-In Plugin Feature Import Boundary Check

Status: done

## Why

Built-in plugins should not couple themselves to renderer feature directories.
They may use shared APIs and renderer-level utilities, but importing
`renderer/features/*` makes plugin behavior depend on page/database internals.

## Scope

- Extend the existing file-boundary script with a built-in plugin import rule.
- Fail when `src/builtin-plugins` imports `renderer/features/*`.
- Keep the existing file-service boundary check unchanged.

## Gates

- `npm run test:file-boundary` passed.
- `git diff --check` passed.
