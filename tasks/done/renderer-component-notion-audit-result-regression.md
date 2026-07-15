# Renderer Component Notion Audit Result Regression

Status: done

## Why

The Notion audit result is the review surface users rely on after an import:
source roots, workspace roots, issue counts, warning counts, issue/warning
tables, and path open controls must stay readable and discoverable.

## Scope

- Add static renderer coverage for the audit result view using a small fake
  audit result.
- Assert summary counts, success/failure state, issue/warning kind summaries,
  issue/warning tables, path labels, and Open controls render.
- Export the result component as a narrow renderer test seam without changing
  audit service behavior.

## Gates

- `node --check scripts/test-renderer-components.mjs` - passed
- `npm run test:renderer-components` - passed
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Exported `AuditResult` as a narrow renderer test seam.
- Added a static fake audit result fixture to the renderer component gate.
- Asserted summary counts, source/workspace paths, issue and warning counts,
  failure copy, kind summaries, issue/warning tables, truncated helper copy, and
  Open controls render.
- Backend/service tests are not applicable because this only extends renderer
  presentation coverage; audit scanning, comparison, and file-opening behavior
  were not changed.
