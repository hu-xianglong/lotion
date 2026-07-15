# UI Regression Lab And Renderer Coverage

Status: todo

Decision state: accepted, staged rollout

## Why

The current 80% coverage gate only covers package/core runtime code and builtin
plugins. Renderer/UI code under `src/renderer/**` is not part of that line
coverage target, so visual and interaction regressions can still ship even when
the package coverage gate passes.

We need a production-style UI quality layer that catches the bugs users see:
misaligned properties, awkward date inputs, unclear links, callout/source
rendering regressions, database table interaction issues, and imported Notion
parity gaps.

## Scope

1. Add a UI regression lab.
   - Use Electron/Playwright to open stable fixture pages.
   - Capture screenshots for representative row pages, normal pages,
     embedded databases, callouts, source links, long titles, empty fields,
     date fields, entity references, and sidebar/search states.
   - Store baselines and fail on meaningful screenshot drift.

2. Add renderer component coverage.
   - Introduce renderer test tooling for React components.
   - Cover high-risk components first:
     `RowPageProperties`, `FieldSettingsDialog`, `DatabaseTable`,
     `GlobalSearchPanel`, `PageEditor`, and `PropertyLinks`.
   - Track renderer line coverage separately before deciding whether to enforce
     an 80% threshold.

3. Add explicit UI assertions.
   - Read-only source fields should not render as editable inputs.
   - Editable date fields should align with other property rows and not
     overflow.
   - Source HTML/CSV paths and URL fields should look and behave like links.
   - Callouts should render as callouts, not visible source fences.
   - Missing embedded databases should produce actionable diagnostics.
   - Database table "load more" and row/page links should be visibly clickable.

4. Add Notion import golden UI fixtures.
   - Keep a small, stable imported workspace with known fragile cases.
   - Include nested databases/pages, original Notion HTML/CSV links, attachments,
     empty rows/pages, long Chinese titles, URL fields, date fields, callouts,
     and entity/page references.
   - Validate both imported data and rendered UI against the fixture.

5. Add layered gates.
   - Pre-commit: keep fast package coverage and focused changed tests.
   - Pre-push or manual queue gate: run focused UI smoke and selected screenshot
     checks.
   - Nightly/manual deep gate: run full import golden fixture, full screenshot
     diff, and UI performance checks.

## Suggested First Slice

Start with a small row-page property visual regression suite:

- Open a fixture row page with Original Notion HTML/CSV, date fields, empty
  fields, entity references, and source links.
- Assert read-only/editable differences in the DOM.
- Capture one baseline screenshot of the property panel.
- Add one focused command, for example `npm run test:ui-regression`.
