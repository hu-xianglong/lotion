# Source Attachments Shared Harness Migration

Status: done

## Scope

Move the source/original attachment regression smoke onto the shared Electron UI
harness so original HTML/CSV links and rendered attachments use deterministic
lifecycle, cleanup, failure artifacts, and desktop plus compact viewport
coverage.

## Acceptance

- Use `withLotionUIHarness` instead of hand-rolled CDP lifecycle logic.
- Preserve read-only property assertions for Original Notion HTML and Original
  Notion CSV source links.
- Preserve dry-run shell-open assertions for original source links and document
  attachment links.
- Preserve rendered preview assertions for PDF, video, audio, and image
  attachments.
- Run the workflow across desktop and compact viewports with isolated fixture
  workspaces.
- Assert source link controls and rendered content remain visible/interactable
  without document horizontal overflow.
- This should remain UI smoke coverage only; no attachment parser, shell-open,
  or workspace service behavior changes are expected.

## Gates

- `node --check scripts/smoke-source-attachments-ui.mjs`
- `npm run typecheck`
- `npm run smoke:source-attachments-ui`
- `git diff --check`

## Result

- Migrated `scripts/smoke-source-attachments-ui.mjs` to
  `withLotionUIHarness`.
- Ran the source/original attachment workflow independently across desktop and
  compact viewports.
- Preserved read-only source property assertions for Original Notion HTML and
  Original Notion CSV.
- Preserved shell-open dry-run assertions for source links and document
  attachment links.
- Preserved rendered preview assertions for PDF, video, audio, and image
  attachments.
- Added no-horizontal-overflow checks plus viewport/intersection assertions for
  source and document attachment controls.
- This change only updates UI smoke harness coverage; attachment parser,
  shell-open, and workspace services were not changed, so backend tests were not
  applicable.
