# Duplicate View Preserves Gallery Calendar Settings Smoke

Status: done

## Why

Duplicate view already preserves common table/list settings. Gallery and
calendar also have view-specific fields (`coverFieldId`, `dateFieldId`) that
should survive duplication.

## Scope

- Duplicate a gallery-configured view and verify `coverFieldId`.
- Duplicate a calendar-configured view and verify `dateFieldId`.
- Return the source smoke view to list mode so existing downstream checks keep
  their current assumptions.

## Gates

- `npm run smoke:database-template-ui` passed.
- `npm run typecheck` passed.
- `git diff --check` passed.
