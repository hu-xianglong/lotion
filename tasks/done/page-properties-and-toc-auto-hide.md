# Page Properties And TOC Auto-Hide

Status: done

Priority: highest

Requested by user: the top property/backlink area takes too much vertical space,
and the page TOC should always be available without permanently occupying editor
space.

## Goal

Make the page editing surface more Notion-like and writing-focused by collapsing
secondary page chrome by default while keeping it discoverable and fast to
expand.

## Acceptance

- The top page properties/metadata area defaults to a compact auto-hidden state
  that preserves editor vertical space.
- A visible hover/focus handle or button expands the properties panel without
  causing layout overlap or jumpy editor behavior.
- The expanded properties panel remains keyboard accessible and does not hide
  focused inputs while the user is editing.
- Backlinks and imported Notion source-link metadata should be included in the
  compact/expanded model or otherwise moved so they no longer dominate the first
  viewport.
- A page-level TOC is always available as a side rail/handle, not only when a
  manual `lotion-toc` block exists in the markdown.
- The TOC defaults to auto-hidden/collapsed and expands on hover/focus, with
  readable heading entries and click navigation.
- The page title, editor, properties handle, TOC rail, and sidebar must not
  overlap at desktop, laptop, and compact/narrow widths.
- The behavior should feel polished against a Notion-like bar: quiet visual
  hierarchy, no bulky cards, clear affordances, and no first-viewport clutter.

## Required Tests

- Add coded frontend UI coverage across multiple resolutions.
- Tests must assert default collapsed geometry, hover/focus expansion,
  keyboard/focus accessibility, no horizontal overflow, no overlap with title or
  editor controls, and that editor typing remains possible while panels are
  collapsed.
- Tests must cover a page with many properties/backlinks/imported source links
  and a page with enough headings to populate TOC.
- Tests must assert TOC entry click/keyboard navigation moves to the correct
  heading without losing editor usability.

## Gates

- focused page editor UI smoke across desktop/laptop/compact viewports
- renderer/component coverage where available
- `npm run typecheck`
- `git diff --check`

## Result

- Moved page properties, imported source links, and backlinks into a collapsed
  page details panel that expands on hover/focus/toggle without covering the
  title, editor, or sidebar.
- Added renderer coverage for the collapsed page details chrome so source links
  and property content remain mounted but visually hidden by default.
- Added an automatic floating TOC rail for pages with headings even when no
  manual `lotion-toc` block exists. The TOC defaults collapsed and expands on
  hover/focus with heading navigation.
- Fixed CodeMirror TOC decoration rebuild behavior for initial value sync and
  full-document page switches so the auto TOC mounts reliably.
- Kept this renderer/UI-only. Backend/service tests are not applicable because
  no persisted data model, file service, or API behavior changed.

## Verification

- `node --check scripts/smoke-page-secondary-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:page-secondary-ui`
- `git diff --check`
