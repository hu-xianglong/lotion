# Renderer Component Row-Property Regression

Status: done

## Scope

Start the renderer component coverage layer from
`tasks/todo/ui-regression-lab-and-renderer-coverage.md` with a small,
high-signal RowPageProperties regression. This is intentionally below the
Electron smoke layer: it should render the component quickly with Vite SSR and
assert structural UI behavior that has regressed repeatedly.

## Acceptance

- Add a renderer component regression script that can import TSX renderer
  components through Vite SSR without introducing a separate test stack yet.
- Cover RowPageProperties with:
  - imported Original Notion HTML/CSV source fields rendered as read-only
    openable workspace-link buttons;
  - editable text/date/checkbox fields rendered as editable controls;
  - computed/system fields rendered as read-only text;
  - hidden/title/id fields excluded from the property panel.
- Add an npm script so the test is easy to run locally and in future focused
  gates.

## Gates

- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

- Added `npm run test:renderer-components`.
- Added a zero-server renderer component regression script that uses esbuild to
  bundle TSX renderer components into a temporary SSR test entry.
- Covered `RowPageProperties` structure for imported source links, editable
  text/date/checkbox fields, read-only formula/system fields, and hidden/title
  field exclusion.
