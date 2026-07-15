# Frontend Architecture Boundaries

Status: done

## Why

The frontend is functional, but its complexity is starting to make layout and
interaction fixes expensive. Page layout, CodeMirror decorations, React portals,
embedded databases, row pages, Notion-import compatibility, and database view
chrome currently influence each other too easily.

This task tracks a gradual cleanup so future Notion-parity work can be added
without creating more fragile CSS and component coupling.

## Scope

- Introduce a single page layout owner, likely `PageLayout`.
- Move normal width, full width, floating TOC, body rail, page header, and
  properties alignment into that layout owner.
- Replace scattered `760px`, `920px`, TOC width, and gutter compensation rules
  with named CSS variables.
- Split `DatabaseTable` into smaller responsibilities:
  - database chrome / toolbar / tabs
  - table body
  - embedded table frame
  - row editing cells
  - footer / summaries
- Isolate CodeMirror-to-React bridge logic for markdown decorations, portals,
  and embedded view preloading.
- Keep Notion import normalization separate from interactive page rendering.
- Add small visual smoke checks for normal width, full width, floating TOC, and
  embedded database layout.

## Non-goals

- Do not rewrite the frontend from scratch.
- Do not replace CodeMirror.
- Do not replace the current markdown storage model.
- Do not redesign the product while doing this cleanup.
- Do not block bug fixes on completing the whole refactor.

## Acceptance

- Normal width, full width, and floating TOC layout are controlled by one clear
  set of layout variables.
- `DatabaseTable` no longer owns every standalone and embedded database concern
  in one component.
- CodeMirror portal/preload logic has a narrow API and does not leak layout
  assumptions into database rendering.
- Existing Notion-import fixture pages still render.
- `npm run typecheck` passes.
- Electron screenshots cover at least one normal page, one full-width page, and
  one page with embedded databases and floating TOC.

## Progress

- Added `PageLayout` as the page shell for cover, header, properties, overlay,
  and body content.
- Moved page width, full-width, gutter, and TOC dimensions into named CSS
  variables in `styles.css`.
- Added `DatabaseChrome` for standalone database headers, embedded database
  headers, view tabs, and database properties.
- Kept `DatabaseTable` responsible for query results, virtualization, plugin
  bodies, table body rendering, summaries, and cell editing.
- Added latency commands to `package.json` and documented them in
  `docs/testing.md`.

## Verification

- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- Electron screenshots:
  - `/tmp/lotion-layout-normal.png`
  - `/tmp/lotion-layout-full-width.png`
  - `/tmp/lotion-layout-embedded.png`
  - `/tmp/lotion-home-embedded-smoke.png`

## Follow-Up

- Split more table body concerns out of `DatabaseTable` without changing cell
  editing behavior.
- Add or preserve visual smoke coverage for floating TOC once the bridge code is
  separated.
