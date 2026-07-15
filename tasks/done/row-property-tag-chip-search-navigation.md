# Row Property Tag Chip Search Navigation

Status: done

Started: 2026-06-12T18:02:33Z

Completed: 2026-06-12T18:13:30Z

## Why

Backlog item: tag pages and richer backlink workflows.

Row-page select and multi-select values were visible as field values, but they
did not feel like navigable tag chips. Users should be able to treat a
tag/status value as a lightweight navigation affordance that opens search for
matching pages, rows, and field values without needing to copy the text.

## Scope

- Kept the data model unchanged and avoided adding a full tag-page database in
  this small slice.
- Made row-page select and multi-select value search affordances render as
  Notion-like clickable chips by reusing the existing `OptionPill` renderer.
- Preserved existing field editing behavior.
- Kept the accessible search labels stable while improving chip visuals.

## Verification

- `node --check scripts/smoke-row-page-navigation-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:row-page-navigation-ui`
- `git diff --check`

The row-page UI smoke now covers desktop and compact viewports, click activation
from the status chip, keyboard activation from a multi-select tag chip, focused
global search with the option value prefilled, visible search results, and
layout/overflow checks.

Backend tests were not applicable because this task only changed renderer UI
markup, styling, and smoke/component assertions; search, row storage, CSV, and
workspace APIs were not changed.
