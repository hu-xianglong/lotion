# Document Shell Dry-run UI Smoke

## Goal

Document that URL/source/attachment UI smoke tests use a debug dry-run shell
hook to validate click paths without opening system apps.

## Scope

- Update testing docs near the UI smoke command list.
- Mention which focused smokes assert dry-run shell requests.

## Gates

- [x] `git diff --check`
