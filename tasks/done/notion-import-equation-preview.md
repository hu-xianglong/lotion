# Notion Import Equation Preview

Status: done

## What Changed

- Preserved Notion-exported equation TeX as stable `lotion-equation` fenced
  blocks during HTML import.
- Added a CodeMirror live-preview widget for `lotion-equation` blocks with an
  edit-source affordance.
- Covered both `data-expression` and KaTeX annotation import shapes in the
  Notion HTML converter regression test.
- Extended the markdown preview UI smoke to assert equation rendering and
  edit-source reveal behavior.
- Updated the Notion import compatibility checklist.

## Gates

- `npm run typecheck`
- `npm run test:notion-html`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`
