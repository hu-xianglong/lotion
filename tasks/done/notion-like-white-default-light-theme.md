# Notion-like White Default Light Theme

Status: done

## Why

The user prefers a clean white, Notion-like default visual theme. Lotion's
current tokens still read as cream/beige across the app shell, sidebar, editor,
database, search, and plugin surfaces.

## Scope

- Make the default light theme read as white/light instead of beige/sand by
  updating shared design tokens first.
- Keep imported Notion color rendering, callout/code backgrounds, focus rings,
  hover/selected states, dividers, and readable hierarchy intact.
- Cover the app shell, sidebar, tab strip, editor canvas, page surface, search
  modal, database/table surfaces, and plugin modal surfaces through shared UI
  smoke checks.
- Run the smoke across desktop and compact viewports and assert no horizontal
  overflow or obvious control overlap.

## Non-goals

- Do not add a full theme picker in this item.
- Do not rewrite plugin-specific layouts unless a token change exposes a real
  overlap or contrast issue.
- Do not remove imported Notion color rendering.

## Acceptance

- Root theme tokens use white/light neutral values.
- Core surfaces compute to the new white/light token palette.
- Sidebar and muted sections remain subtly separated without reading beige.
- Global search and plugin modal surfaces keep readable focus/hover states.
- Desktop and compact layouts have no horizontal overflow.

## Required Gates

- `node --check scripts/smoke-white-theme-ui.mjs`
- `npm run typecheck`
- `npm run smoke:white-theme-ui`
- `git diff --check`

## Results

- Updated the shared light-theme surface tokens to a white/neutral Notion-like palette.
- Updated plugin fallback colors for LLM Chat/settings and the kanban view so plugin surfaces do not fall back to beige when tokens are unavailable.
- Added a multi-resolution shared-harness smoke covering page, sidebar, tab, editor, search modal, database/table, and LLM modal surfaces.

## Verification

- `node --check scripts/smoke-white-theme-ui.mjs`
- `npm run typecheck`
- `npm run smoke:white-theme-ui`
- `git diff --check`
