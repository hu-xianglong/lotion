# Notion HTML checkbox list paste real editor regression

Status: done

## Why

Notion pages commonly use to-do blocks. Browser/Notion rich HTML clipboard data
often represents those blocks as list items with checkbox inputs. Lotion should
preserve checked and unchecked task state when pasting rich HTML into the local
editor instead of degrading tasks into plain bullets.

## Scope

- Converted unordered HTML list items containing checkbox inputs into Markdown
  task list items.
- Extended the shared real editor regression smoke with a multi-resolution HTML
  checkbox list paste case.
- Verified checked and unchecked tasks persist as `- [x]` and `- [ ]`, render
  as task checkboxes, allow continued typing, and have no document overflow.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T19-14-43-882Z`
- [x] `git diff --check`
