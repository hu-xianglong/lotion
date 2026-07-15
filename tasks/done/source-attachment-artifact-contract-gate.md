# Source Attachment Artifact Contract Gate

Status: done

Queue item: 551

## Why

Source HTML/CSV links and imported attachments are fragile Notion-import
surfaces. The source attachment smoke already captures screenshots, but the
regression lab should also expose a machine-readable artifact contract so CI can
verify that each viewport preserved source-link metadata and rendered attachment
previews without relying on manual screenshot inspection.

## Scope

- Added a reusable source attachment artifact contract.
- Validated desktop and compact viewport artifacts, property-panel screenshot
  metadata, Original Notion HTML/CSV source links, document open requests, PDF,
  video, audio, and image preview resolution.
- Exposed the contract in the source attachments smoke result and aggregate UI
  child manifest summary.
- Added focused unit coverage for the contract and kept the existing
  multi-viewport source attachments smoke as the UI gate.

## Verification

- [x] `node --check scripts/lib/source-attachment-artifacts.mjs`
- [x] `node --check scripts/smoke-source-attachments-ui.mjs`
- [x] `node --check scripts/ui-harness.mjs`
- [x] `node --test test/ui-harness-artifacts.test.mjs`
- [x] `npm run smoke:source-attachments-ui`
  - Artifact: `artifacts/ui-smoke/source-attachments-ui-2026-06-16T16-37-45-608Z/harness-result.json`
- [x] `LOTION_UI_SUITE_FILTER=source-attachments node scripts/smoke-ui-suite.mjs`
  - Artifact: `artifacts/ui-smoke/ui-suite-2026-06-16T16-41-39-241Z/harness-result.json`
- [x] `npm run typecheck`
- [x] `git diff --check`
