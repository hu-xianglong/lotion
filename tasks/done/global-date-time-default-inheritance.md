# Task 712: Global date/time default inheritance

Status: done

Verification status: verified

Priority: P0

Source: independent verification of commit `0e40c76`

## Problem

The global date/time display defaults landed without a queue item or completed
verification record. Field settings currently materialize inherited global
formats into local field overrides whenever a date-like field is saved, even
when the user changed only an unrelated setting. That can silently prevent
future global-default changes from applying to the field.

## Goal

Verify the new global date/time default feature end to end and preserve a clear
distinction between inherited defaults and explicit per-field overrides.

## Acceptance

- Date-like fields without explicit formats continue to inherit later global
  date/time changes after their settings are opened and saved.
- Users can explicitly override both date and time formats per field and can
  return each setting to the global default.
- Existing persisted explicit field formats remain authoritative.
- Global settings persist and update representative table, list, gallery,
  row-page, management, history, deleted-row, and startup consumers.
- Every behavior fix has automated regression coverage.

## Required Gates

- focused shared date-format and renderer component regressions
- Settings Center Electron smoke across its configured viewports
- `npm run typecheck`
- `npm run test:fast`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Fix

- Kept absent field-level date/time formats as an explicit inherited selection
  in the field settings dialog instead of resolving them into local values.
- Added a “Use global default” choice for both date and time, while preserving
  existing explicit overrides.
- Centralized serialization so inherited selections and non-date fields omit
  stale format properties.
- Added renderer regressions for the inherited UI state and save payload
  contract.

## Verification

- Pre-fix regression: `node scripts/test-renderer-components.mjs` failed because
  an inherited date field rendered `month_day_year` and `none` as selected
  overrides instead of two selected “Use global default” options.
- `node scripts/test-renderer-components.mjs` — passed after the fix; covers
  inherited date/time controls, omitted inherited save properties, retained
  explicit `iso`/`h24` overrides, discarded non-date formats, and the existing
  global-format consumers across database and page surfaces.
- `npm run typecheck` — passed.
- `npm run smoke:settings-center-ui` — passed in the real Electron app at both
  configured desktop and compact viewports; changing global defaults to ISO
  date and 24-hour time persisted to local storage, both settings screenshots
  matched strict baselines with zero differing pixels, and the artifact
  contract passed.
- `npm run test:fast` — passed unrestricted: task documentation validation,
  all 79 core tests, renderer/shared regressions, workspace/link/hierarchy
  validation, fixture checks, and latency gates passed.
- `npm run build` — passed (`tsc` plus Vite production build). Vite emitted the
  existing Node 20.19+ recommendation and chunk-size warnings; neither failed
  the build.
- `npm run test:task-docs --workspaces=false` — passed: 724 Markdown files,
  850 task references, and 712 queue items. The flag prevents npm from treating
  a concurrently created same-name sibling worktree as a duplicate workspace;
  the task documentation command itself is unchanged.
- `git diff --check` — passed.
