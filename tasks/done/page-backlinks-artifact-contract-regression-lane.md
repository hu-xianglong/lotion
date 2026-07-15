# Page Backlinks Artifact Contract And Regression Lane

Status: done

Queue item: 600

Backlog source: `tasks/todo/ui-regression-lab-and-renderer-coverage.md`.

## Why

Backlinks are a Notion-like page relationship surface. The smoke already covered
keyboard navigation and latency, but it did not publish a machine-readable
artifact contract or focused regression-lane evidence.

## What Changed

- Added a Page Backlinks artifact contract for desktop and compact viewport
  evidence.
- Extended the Page Backlinks UI smoke to expand the page details panel, capture
  backlink screenshots/metadata, validate markdown and database-row backlink
  rows, and record repeated page-open latency.
- Included Page Backlinks in the focused UI regression lane.
- Fixed the smoke-discovered focus regression where backlink buttons could be
  focused without a stable visible focus affordance.

## Verification

- [x] `node --check scripts/lib/page-backlinks-artifacts.mjs`
- [x] `node --check scripts/smoke-page-backlinks-ui.mjs`
- [x] `node --test test/ui-harness-artifacts.test.mjs`
- [x] `npm run smoke:page-backlinks-ui`
  - Artifact: `artifacts/ui-smoke/page-backlinks-ui-2026-06-17T16-12-06-440Z/harness-result.json`
- [x] `LOTION_UI_SUITE_FILTER=page-backlinks npm run smoke:ui`
  - Artifact index: `artifacts/ui-smoke/ui-suite-2026-06-17T16-13-31-052Z/ui-suite-artifacts.json`
- [x] `npm run typecheck`
- [x] `git diff --check`

## Notes

No backend/service tests were needed; this item only changes UI harness coverage
and a small renderer focus style for the user-visible backlink control.
