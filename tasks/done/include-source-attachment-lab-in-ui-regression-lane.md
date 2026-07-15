# Include Source Attachment Lab In UI Regression Lane

Queue item: 552
Status: wip

## Why

The source attachment smoke now has a contract that checks Original Notion
HTML/CSV links and rendered attachment previews, but the default UI regression
lane still does not run it. That leaves a high-risk imported Notion surface as
an opt-in check instead of part of the shared product-quality gate.

## Scope

- Add the source attachment smoke to `npm run test:ui-regression`.
- Keep the command focused on the shared UI harness lane rather than creating
  another standalone smoke.
- Document that the UI regression lane now covers source attachment artifacts.
- Fix the existing command-palette keyboard navigation visibility regression
  exposed by the full UI regression lane: the active command row must remain
  inside the scroll viewport when keyboard selection moves to lower results.

## Acceptance

- `npm run test:ui-regression` includes the source attachment child smoke and
  fails if its artifact contract is missing or incomplete.
- The focused source attachment UI suite still passes across desktop and
  compact viewports.
- Search-title UI coverage verifies keyboard-selected command rows stay within
  the viewport.

## Verification

- [x] `LOTION_UI_SUITE_FILTER=source-attachments node scripts/smoke-ui-suite.mjs`
  - Artifact: `artifacts/ui-smoke/source-attachments-ui-2026-06-16T16-53-58-718Z/harness-result.json`
- [x] `npm run smoke:search-title-ui`
  - Artifact: `artifacts/ui-smoke/search-title-2026-06-16T17-00-10-142Z/harness-result.json`
- [x] `npm run test:ui-regression`
  - Artifact: `artifacts/ui-smoke/ui-suite-2026-06-16T17-01-32-735Z/harness-result.json`
  - Confirmed selected filters include `source-attachments` and its child
    artifact contract reports desktop/compact snapshots, two source links,
    three open requests, and PDF/video/audio/image previews.
- [x] `npm run typecheck`
- [x] `git diff --check`

## Notes

- The full UI regression lane exposed an existing command-palette keyboard
  navigation issue: the active command row could move below the visible result
  viewport. `GlobalSearchPanel` now scrolls the active result into view whenever
  keyboard selection changes, and `smoke:search-title-ui` covers that behavior.
