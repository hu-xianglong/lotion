# Top-level page URL link affordance

Status: done

## Problem

Database URL cells and row-page URL properties already use Lotion's link-style
URL editor: clicking the text edits the value, and a separate open button opens
the normalized URL. Top-level page URL properties still render as a plain input,
which makes page properties visually inconsistent and does not expose the
explicit open affordance users expect from URL fields.

## Scope

- Reuse the URL cell interaction model for top-level page URL properties.
- Keep URL text editable by clicking/focusing the text, not by opening the URL.
- Add a separate open button for valid page URL values.
- Cover the rendered markup and a real multi-resolution UI path.

## Acceptance

- Top-level page URL properties render with `.url-cell`, `.url-cell-display`,
  and `.url-cell-open`.
- Clicking URL text focuses the editable input and does not open the link.
- Editing the page URL persists through the existing page metadata update path.
- Clicking the open button opens the normalized URL.
- The field does not overlap or overflow on desktop and compact widths.

## Verification

- [x] `node --check scripts/smoke-url-field-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:url-field-ui`
  - Artifact: `artifacts/ui-smoke/url-field-ui-2026-06-14T15-47-25-671Z`
  - Desktop and compact results include `pageUrlProperty` with no text-click
    open requests, persisted edited URL, underlined display text, non-overlap,
    and normalized open-button title.
- [x] `git diff --check`

Backend tests were not added because this item reuses the existing page metadata
update IPC/service path and only changes frontend URL property rendering and UI
interaction coverage.
