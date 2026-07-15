# GitHub Backup Preview Layout Regression

Status: done

## Why

The GitHub Backup plugin had multi-resolution smoke coverage for opening the
panel and running backups, but the version preview and restore confirmation path
did not assert layout behavior after a diff was rendered. That panel is
user-facing and can carry long page content, so it needs the same overflow and
viewport checks as the rest of the plugin surface.

## Scope

- Strengthen the GitHub Backup UI smoke around the selected history version
  preview.
- Assert the selected version row, preview container, diff block, and restore
  action remain visible/interactable at desktop and compact viewports.
- Assert the preview state does not introduce document-level horizontal
  overflow.
- Keep this as UI smoke coverage only; no GitHub service or persistence behavior
  changes.

## Acceptance

- The smoke selects a backed-up version, waits for the diff preview, and verifies
  visible added/removed lines.
- The selected history row, preview container, restore action, and diff body have
  stable non-overlapping geometry in both default UI viewports.
- The document has no horizontal overflow after the preview is open and after
  restore completes.
- Backend/service tests are not applicable because this task only strengthens UI
  coverage.

## Gates

- `node --check scripts/smoke-github-backup-ui.mjs`
- `npm run typecheck`
- `npm run smoke:github-backup-ui`
- `git diff --check`

## Result

- Added preview-layout assertions to `smoke-github-backup-ui` for the selected
  history row, preview card, diff block, restore button, and document horizontal
  overflow.
- Fixed the plugin behavior so the newly rendered restore preview scrolls into
  view instead of appearing partially below the viewport.
- Kept this UI-focused; backend/service tests were not applicable because
  GitHub backup data, persistence, and service logic did not change.

UI smoke artifact:

- `artifacts/ui-smoke/github-backup-ui-2026-06-12T20-03-40-017Z/`
