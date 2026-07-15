# Remove Unused Local Option Dropdown Fork

Status: done

## Why

Database cells now render through the built-in field-type plugin. The old local
`OptionDropdown` fork is imported but unused, which makes option menu behavior
easy to fix in one place and forget in the other.

## Scope

- Remove the unused import from `DatabaseTable`.
- Delete the unused local dropdown component.
- Keep shared option colors/pills because field settings still use them.

## Gates

- `npm run typecheck` passed.
- `git diff --check` passed.
