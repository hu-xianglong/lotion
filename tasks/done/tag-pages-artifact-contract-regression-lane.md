# Tag Pages Artifact Contract And Regression Lane

Status: done

Queue item: 594

Backlog source: `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md`.

## Why

Tag pages are now a real Notion-like navigation surface, but their regression
coverage is buried inside sidebar/search smoke output. The shared UI regression
artifact index should show whether tag management pages still render with page
and database rows, remain keyboard navigable, and avoid compact/desktop layout
regressions.

## Acceptance

- Add a tag pages artifact contract that requires desktop and compact viewport
  evidence.
- The contract verifies the tag page open affordance is keyboard focusable,
  the tag management view lists matching pages and databases, and Enter/Space
  opens the matching page/database rows.
- The sidebar navigation smoke captures a tag management screenshot and
  metadata per viewport.
- The UI suite index can include tag page screenshot/metadata evidence through
  the sidebar navigation lane.
- Keep this scoped to testing/harness coverage; no product behavior changes.

## Verification

- `node --check scripts/lib/tag-pages-artifacts.mjs`
- `node --check scripts/smoke-sidebar-navigation-ui.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `npm run smoke:sidebar-navigation-ui`
- `LOTION_UI_SUITE_FILTER=smoke-sidebar-navigation-ui.mjs npm run smoke:ui`
  - Artifact index: `artifacts/ui-smoke/ui-suite-2026-06-17T14-33-28-819Z/ui-suite-artifacts.json`
  - Report: `artifacts/ui-smoke/ui-suite-2026-06-17T14-33-28-819Z/ui-suite-artifacts.md`
- `npm run typecheck`
- `git diff --check`

## Result

- Added `assertTagPagesArtifactContract` for tag management pages.
- Extended the real sidebar navigation smoke to capture desktop and compact tag
  management snapshots and metadata.
- The contract now verifies keyboard-focusable tag page entry, visible page and
  database rows, keyboard row activation, and screenshot evidence.
- Hardened the sidebar smoke helper so shared-harness runs only treat real
  `pg_` ids as newly created pages.
- No backend/service tests are applicable because this item only adds UI harness
  coverage and smoke robustness.
