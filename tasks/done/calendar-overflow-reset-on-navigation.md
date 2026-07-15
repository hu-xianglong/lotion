# Calendar Overflow Reset On Navigation

Status: done

## Why

Inline-expanded calendar days are transient UI state. They should not stay
expanded after using month navigation or the `今天` button.

## Scope

- Clear expanded day state when moving between months.
- Clear expanded day state when using `今天`.
- Extend the database-template UI smoke to verify the collapse is restored.

## Gates

- `npm run smoke:database-template-ui`
- `npm run typecheck`
- `git diff --check`
