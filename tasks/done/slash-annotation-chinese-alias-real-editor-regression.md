# Slash Annotation Chinese Alias Real Editor Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

The Callout slash command supports `标注` in addition to `提示` and `强调块`.
Because imported Notion callouts and user-entered callouts are a visible
regression area, the shorter annotation-style Chinese alias should be protected
in the real editor.

## Acceptance Criteria

- Slash command unit coverage asserts that the Chinese `标注` query resolves to
  the Callout command.
- Typing `/标注` in the real editor opens the slash menu and selects Callout.
- Committing the command removes the localized query, creates a rendered
  callout, hides source after leaving the fence, persists the body text, and
  allows continued typing below the callout.
- The editor remains focused and layout-safe across desktop and compact
  viewports.

## Backend Tests

No backend service changes are expected. This task adds slash command lookup
coverage plus real renderer/editor smoke coverage.

## Changes

- Added slash-command unit coverage that verifies the Chinese `标注` query
  resolves to the Callout command.
- Added desktop and compact UI smoke coverage for `/标注`, including localized
  query cleanup, rendered callout preview, hidden source after leaving the
  fence, persisted body text, continuation below the callout, focus retention,
  and layout overflow checks.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:slash`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T08-10-11-967Z`
  - Desktop and compact results include
    `slashChineseAnnotationCallout.rendered: true`.
- [x] `git diff --check`
