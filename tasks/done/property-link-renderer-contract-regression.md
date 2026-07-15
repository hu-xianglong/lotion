# Property Link Renderer Contract Regression

Status: done

## Why

Source HTML/CSV fields and standalone property links should read as clickable
links, not editable URL inputs or ambiguous text. Existing UI smokes verify
real source links in row pages, but the renderer component contract should also
lock the `PropertyLinks` primitive so regressions are caught before the full
Electron smoke.

## Scope

- Added renderer component coverage for the standalone `WorkspaceLinkButton`.
- Asserted the link renders as a button with visible link text, `title`,
  accessible open label, and the open affordance element.
- Asserted it does not render an editable input or URL-cell chrome.
- Kept the existing multi-viewport source attachment UI smoke as the
  user-facing gate for real property source links.

## Verification

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run smoke:source-attachments-ui`
  - Artifact: `artifacts/ui-smoke/source-attachments-ui-2026-06-15T20-05-45-089Z`
  - Covered desktop and compact viewports.
- `npm run typecheck`
- `git diff --check`

Backend tests were not applicable because this task only locks the renderer
contract and existing source attachment UI behavior; no data or service code
changed.
