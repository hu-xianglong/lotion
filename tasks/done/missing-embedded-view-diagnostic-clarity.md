# Missing Embedded View Diagnostic Clarity

Status: done

Backlog item: UI regression lab imported Notion parity gaps.

## Why

Imported Notion pages can contain embedded databases or linked database views
that cannot be matched to a Lotion database. The old live preview card still
communicated this as a generic `Database not found`, which was too vague for a
user reviewing imported content.

## Scope

- Replace the vague missing-database copy with a Notion-like broken embedded
  view diagnostic that explains this is an imported embedded database/page view
  that could not be matched.
- Keep raw source hidden by default, with the existing edit-source affordance.
- Keep the Search action, but label it as a workspace search recovery path.
- Add coded renderer coverage for the diagnostic copy.
- Update the shared multi-resolution markdown preview UI smoke to assert the
  clearer diagnostic, focused search action, source reveal, and no overflow.

## Result

- Added a shared `missingEmbeddedViewDiagnosticCopy` helper so the live preview
  widget and renderer regression coverage use the same copy.
- Updated the missing embedded view widget to show `Missing imported view`,
  explain the import matching failure, and expose a clearer `Search workspace`
  recovery action.
- Preserved the hidden raw source, hover edit-source affordance, focused search
  behavior, and source fold-back behavior.
- Extended renderer and multi-resolution UI smoke assertions to prevent
  regression to the old vague `Database not found` diagnostic.

## Gates

- [x] `node --check scripts/smoke-markdown-preview-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:markdown-preview-ui`
  - Artifact: `artifacts/ui-smoke/markdown-preview-ui-2026-06-15T04-08-10-628Z`
- [x] `git diff --check`
