# Gallery Date Caption Formatting

Status: done

## Why

Gallery cards currently stringify caption field values. Date-like fields should
use the same display formatting as list/table views instead of showing raw
storage values.

## Scope

- Format date-like gallery caption values through `formatDateForField`.
- Keep non-date caption rendering unchanged.
- Add a temporary gallery view smoke assertion for a visible `Due Date` caption.

## Gates

- `npm run smoke:database-template-ui`
- `npm run typecheck`
- `git diff --check`
