# Source Attachment Property Snapshot Baseline

Status: done

## Why

The UI regression lab needs real smoke suites to produce reviewable visual
artifacts, not only DOM assertions. Source HTML/CSV and attachment rendering is
a high-risk imported Notion surface, so the source attachment smoke now captures
and validates a stable property-panel snapshot across desktop and compact
viewports.

## Scope

- Extended the source attachments UI smoke to capture the expanded row property
  panel with source links and attachment fields.
- Asserted a baseline for snapshot metadata, viewport coverage, and stable
  panel geometry.
- Kept existing link click/open dry-run, media preview, and overflow checks.

## Verification

- `node --check scripts/smoke-source-attachments-ui.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `npm run smoke:source-attachments-ui`
  - Artifact: `artifacts/ui-smoke/source-attachments-ui-2026-06-15T20-20-25-788Z`
  - Covered desktop and compact viewports.
  - Captured `source-attachment-properties-desktop.png` and
    `source-attachment-properties-compact.png`.
- `npm run typecheck`
- `git diff --check`

Backend tests were not applicable because this task only strengthens a UI smoke
and harness artifact usage; no data or service behavior changed.
