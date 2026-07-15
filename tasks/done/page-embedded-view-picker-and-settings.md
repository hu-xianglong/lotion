# Page Embedded View Picker And Settings

Status: done

## Why

Kanban and other plugin-backed database views now render through the normal view
host, but page-side embedded views are still too raw. Inserting or adjusting a
`lotion-view` block should feel like a first-class page workflow while keeping
the Markdown block transparent and Git-friendly.

## Scope

- Replace the current lightweight `Insert view` action with a picker.
- Let the picker choose a database and one of that database's saved views.
- Show enough view metadata in the picker to distinguish table, calendar,
  gallery, Kanban, and future plugin-backed views.
- Add an embedded-view header above rendered `lotion-view` blocks.
- Header should show database name, view name, and view type/provider.
- Header should expose direct `Open`, `Refresh`, and `Settings` actions.
- `Settings` should open the existing view settings surface for the referenced
  saved view, including provider-specific config such as Kanban `groupBy`.
- Preserve the on-disk Markdown representation:

````markdown
```lotion-view
database: db_tasks
view: view_tasks_kanban
```
````

## Non-goals

- Do not invent a separate embedded-view data model.
- Do not copy database records into page Markdown.
- Do not create ad-hoc per-embed view config yet; edit the saved view this block
  references.
- Do not build the external plugin loader.
- Do not redesign the full page editor toolbar.

## Design Notes

- Treat embedded views as references to saved database views.
- Reuse existing `DatabaseTable`, database cache, and view settings code where
  possible.
- The header should be compact and utilitarian, closer to Notion's database view
  frame than to a decorative card.
- Plugin-backed views should work without special cases beyond provider labels
  and icons.
- If the current view settings dialog is too tightly coupled to full database
  pages, extract the smallest reusable settings component instead of duplicating
  settings logic.

## Acceptance

- A user can insert a database view into a page without manually typing a fenced
  block.
- The inserted Markdown remains a readable `lotion-view` fenced block.
- Embedded table views still render and edit records.
- Embedded Kanban views still render through the plugin view host.
- Embedded view header shows the correct database/view/provider labels.
- `Open` navigates to the source database.
- `Refresh` reloads the embedded bundle/view.
- `Settings` can change at least one saved view setting and re-render the embed.
- `npm run typecheck`, `npm run test:fixtures`, `npm run test:latency`, and
  `npm run build` pass.
- Electron smoke test covers inserting one table view and opening settings for
  one Kanban embedded view.

## Verification

- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- Electron smoke via Playwright on a temporary copy of `samples/demo-space`:
  picker found 12 databases, Tasks exposed 4 saved views, insertion wrote a
  `lotion-view` fence for `db_tasks` / `view_kanban`, the embedded Kanban header
  showed `Tasks / Board / Kanban Board`, and the shared view settings dialog
  opened from the embedded header.
