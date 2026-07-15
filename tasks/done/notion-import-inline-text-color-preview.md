# Notion import inline text color preview

Status: done

## Why

Notion exports inline text colors as `block-color-*` classes. Lotion currently
drops those classes, so imported pages lose a visible formatting signal even
when the text itself survives.

## Scope

- Preserve inline Notion text foreground colors and inline background colors in
  stable, safe markdown-compatible HTML.
- Render those safe spans in CodeMirror live preview, including inside widget
  markdown such as callouts and tables.
- Keep block-level color/layout classes out of scope.

## Gates

- [x] `npm run typecheck`
- [x] `npm run test:notion-html`
- [x] `npm run smoke:markdown-preview-ui`
- [x] `git diff --check`
