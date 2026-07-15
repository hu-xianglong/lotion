# Page Hierarchy And Sidebar Tree

Status: done

## Why

Notion import preserves nested page/database structure, but Lotion has had
repeated bugs where titles containing `/` were treated as path segments, search
results lacked clear hierarchy, or linked pages opened without enough context.
The next increment should make hierarchy data more explicit and testable before
larger sidebar density or tree UX changes.

## Scope

- Inspect the current page/database parent and path model.
- Ensure sidebar/search/navigation surfaces can use stored hierarchy instead of
  deriving paths from titles.
- Add a focused validation for parent/path consistency.
- Keep the change small enough to avoid another broad data-model migration.

## Non-goals

- Do not redesign the sidebar visually in this task.
- Do not rewrite Notion import matching.
- Do not change file naming rules unless a consistency bug requires it.

## Acceptance

- Page/database hierarchy can be read from metadata, not inferred from title
  slashes.
- Existing page links and row/page navigation still open in Lotion.
- Focused hierarchy/path validation passes.
- Search/navigation tests pass.
- `npm run typecheck` passes.
- `npm run test:fixtures` passes.

## Implementation

- Added `scripts/validate-hierarchy.mjs`.
- The validator checks the system pages database, optional system entities
  database, duplicate IDs, missing body paths, parent refs, row/page body-path
  alignment, and title-with-slash path mismatches.
- Slash-title path mismatches are warnings by default and can be made strict
  with `--strict-slash-title`, so old imports can still be audited without
  failing the normal lane.
- Added `npm run test:hierarchy` and included it in `npm run test:fast`.

## Verification

- `npm run test:hierarchy`
- `npm run test:links`
- `npm run typecheck`
- Real Import Notion workspace hierarchy audit:
  43,041 page records, 44,226 entity records, 87,248 parent refs, 86,082 body
  paths, and 5,406 slash-title path warnings.
