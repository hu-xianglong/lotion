# Database Interaction Parity Audit

Status: accepted backlog definition

Date: 2026-07-22

## Objective

Close the daily-use interaction gap between Lotion databases and Notion without
copying cloud/team-only behavior that does not fit Lotion's local-first product.
This audit covers view management, property/column management, filter, sort,
view persistence, row and view context menus, and database settings.

## Evidence Reviewed

- Current renderer surfaces: `DatabaseTable`, `DatabaseChrome`,
  `ViewSettingsDialog`, `FieldSettingsDialog`, `FilterPopover`, and
  `SortPopover`.
- Current main-process storage and APIs in `DatabaseService`, IPC/preload,
  customer API, plugin API, and the renderer database cache.
- Existing database UI smoke tasks and current visual artifacts.
- Notion's current Help Center documentation for views, filters, sorts,
  groups, database properties, database settings, table views, and row actions.

## Current Lotion Baseline

Lotion already has useful foundations:

- View create, duplicate, rename, delete, set-default, type switch, visible
  fields, field order, widths, wrapping, summaries, filters, and sorts are stored
  in per-view JSON.
- Table, list, calendar, gallery, and plugin-provided view rendering exist.
- Column drag reorder and resize exist and persist.
- Rows open as pages; row templates and a shared renderer cache exist.
- Field create/update/delete APIs exist, including relation, rollup, formula,
  select option, date-format, and wrap settings.

The main usability problem is not missing CRUD alone. The product currently
exposes those capabilities through several unrelated surfaces:

- `+` immediately clones the current view, invents a name, and opens a large
  modal instead of presenting a deliberate create-view flow.
- View tabs have no context menu, drag reorder, overflow management, or direct
  link semantics.
- The gear opens a large all-in-one form. It mixes layout, properties, filter,
  sort, templates, page size, and destructive view actions.
- Clicking a column header opens another large dialog; frequent actions such as
  sort, filter, duplicate, insert, hide, freeze, and delete are not available
  as a compact header menu.
- Filter and sort popovers use raw native selects/inputs, have no priority drag,
  typed option pickers, advanced Boolean groups, validation, or clear save
  state.
- Each filter keystroke writes a complete `TableView`. Concurrent writes can
  finish out of order and silently overwrite another view change.
- The renderer tracks the active tab only in component state. Reopening a
  database returns to the default/prop view rather than the last local view.
- Rows expose permanent `Open` and `Delete` buttons instead of selection,
  hover affordances, and a context menu. Duplicate, rename, copy link, property
  editing, and bulk actions are absent.
- Field and row deletion are destructive. There is no restore path.
- There is no database-level lock/settings model distinct from per-view
  settings.

## Target Interaction Model

Lotion should adopt Notion's useful conceptual split:

| Layer | Scope | Primary UI | Stored as |
| --- | --- | --- | --- |
| Local view session | This device/window | Last active view, transient search, draft popover state | local preference store |
| Saved view | One reusable view | Layout, property visibility/order/width, filter, sort, group, page-open mode | view JSON |
| Database | All views and rows | Property definitions, deleted properties, lock, templates | schema/database metadata |
| Row/page | One or selected rows | Open, rename, duplicate, edit properties, delete/restore, copy link | CSV + page metadata/trash |

The top-right settings control should open a compact, navigable menu. View
tabs, column headers, and rows should each own a context menu for operations on
that object. Larger editors should open only for genuinely complex settings.

## Gap Matrix

| Area | Lotion now | Target | Priority |
| --- | --- | --- | --- |
| Persistence | Whole-view writes on every mutation; no revision/conflict guard | Atomic patch API, serialized writes, optimistic rollback, durable last-active view | P0 |
| Settings | One large modal mixing scopes | Unified menu with separate View settings and Database settings sections | P0 |
| View management | Tabs + instant clone button | Named/type-aware creation, tab drag reorder, overflow, context menu, copy link | P0 |
| Properties | Bottom adder + header dialog | Searchable manager plus compact header actions | P0 |
| Property lifecycle | Hard delete only through API | Duplicate/insert/hide/delete with recoverable deleted properties | P0 |
| Filters | Flat implicit AND, generic value input | Typed operators/editors, validation, nested AND/OR filter tree | P0 |
| Sorts | Multiple rules but no rule reorder | Drag priority, type-aware labels/order, stable tie behavior | P0 |
| Row actions | Always-visible Open/Delete | Hover handle, right-click menu, duplicate/rename/copy/edit/delete | P0 |
| Bulk rows | None | Checkbox/range selection and batch property/delete/duplicate actions | P1 |
| Grouping | Kanban-specific provider config only | Shared group/sub-group contract and table/list rendering | P1 |
| Page opening | Always full navigation | Per-view side peek, center peek, or full page | P1 |
| Database settings | No lock or clear scope boundary | Lock database, property manager, templates, deleted properties | P1 |
| Table ergonomics | Resize/reorder only | Freeze up to column, insert left/right, keyboard menu navigation | P1 |
| Quality | Scattered focused smokes | One database interaction regression lab with storage assertions | P0 |

## Product Decisions

- Persist saved filters/sorts immediately, but debounce/coalesce value typing
  and serialize patches so the last visible state is the last durable state.
- Store the last active view as a local device preference. Do not change the
  database's default view merely because a user switched tabs.
- Introduce a versioned filter expression tree while continuing to read legacy
  flat `filters[]` as an implicit `AND` group.
- Use soft delete for user properties and rows before exposing more destructive
  menus. Permanent deletion belongs in an explicit deleted-items surface.
- Keep the current local single-user model. Notion's `Save for everyone`,
  permissions, collaboration, automations, connections, tasks/sprints, and
  data-source federation are not part of this backlog.
- Timeline, chart, form, map, feed, and dashboard views are separate roadmap
  work. Daily table/view ergonomics come first.

## Delivery Sequence

1. Make view writes safe and make active-view restoration deterministic.
2. Establish reusable menu primitives and the View/Database settings split.
3. Replace ad-hoc view and property actions with object-specific menus.
4. Upgrade filter and sort models/editors.
5. Add recoverable row/property lifecycle actions and row selection.
6. Add grouping, page peek modes, database lock, and table ergonomics.
7. Lock the workflows with a focused multi-viewport UI/storage regression lab.

The executable tasks are queue items 614-629 in `tasks/QUEUE.md`.
