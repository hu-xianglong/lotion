# Slash Menu And Insert Blocks

Status: done

## Why

Slash insertion is one of the core Notion writing workflows. Lotion already has
a basic slash menu, but the command model is mixed with React icons and the
insertion behavior is too hard to test. Before expanding live preview behavior,
slash insertion should have a small pure core.

## Scope

- Extract slash command definitions, filtering, sorting, and template insertion
  into a testable module.
- Keep existing slash menu UI and keyboard behavior.
- Add page link commands in addition to database view commands.
- Make line-level blocks replace the whole slash line so headings, dividers,
  callouts, tables, code blocks, TOC, and database views do not inherit stray
  indentation.
- Keep inline commands such as text, link, and image inline.

## Non-goals

- Do not build a full Notion block model.
- Do not add drag handles or block reorder controls.
- Do not redesign the editor toolbar.

## Acceptance

- `/` menu still opens from the editor.
- Basic block commands insert correct markdown and place the cursor at `|`.
- Page link commands insert a clickable workspace markdown link.
- Database commands still insert `lotion-view` fences.
- Focused slash logic tests pass.
- `npm run typecheck` passes.
- `npm run test:fixtures` passes.

## Verification

- `npm run test:slash`
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- Electron smoke: opened a temporary demo workspace, typed `/pa`, verified grouped
  basic/page slash results, and captured `/tmp/lotion-slash-menu-smoke.png`.
- Electron smoke: typed `/home`, accepted the active Home page command, verified
  `[Home](databases/system/pages--db_pages/pages/Home--pg_home.md)` was inserted,
  and captured `/tmp/lotion-slash-insert-smoke.png`.
