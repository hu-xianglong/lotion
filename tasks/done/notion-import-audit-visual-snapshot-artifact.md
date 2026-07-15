# Notion import audit visual snapshot artifact

Status: done

## Source

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/systematic-import-audit-and-performance-lab.md`.

## Why

The Notion Import audit result is the main review surface after an import. The
existing smoke asserts summary rows and open buttons, but it does not leave a
durable visual artifact for reviewing the completed audit result across
viewport sizes.

## Acceptance

- Extend the shared-harness Notion import audit smoke to capture a screenshot
  and metadata for the completed audit result in desktop and compact viewports.
- Preserve existing assertions for audit summary counts, source/workspace path
  Open buttons, shell-open dry-run behavior, and no horizontal overflow.
- Do not change importer, audit, or workspace data behavior.

## Required Gates

- `node --check scripts/smoke-notion-import-ui.mjs`
- `npm run typecheck`
- `npm run smoke:notion-import-ui`
- `git diff --check`

## Result

- Extended the shared-harness Notion Import audit smoke to capture completed
  `.notion-audit-result` visual snapshots and metadata for desktop and compact
  viewports.
- Kept the existing summary, path Open button, shell-open dry-run, and
  horizontal-overflow assertions.
- Stabilized the smoke by scrolling the completed audit result into view before
  asserting and capturing the result panel.
- No importer/audit/workspace behavior changed, so no service test was needed.

## Verification

- `node --check scripts/smoke-notion-import-ui.mjs`
- `npm run typecheck`
- `npm run smoke:notion-import-ui`
- `git diff --check`
