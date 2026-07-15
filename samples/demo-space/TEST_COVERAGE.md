# Demo Space Test Coverage

This fixture maps MVP use cases to concrete sample data.

## Pages

- Create page: use the app action after loading the demo.
- Rename page: rename `Markdown Lab`.
- Edit Markdown: edit `Markdown Lab`.
- Preview Markdown: switch `Markdown Lab` between edit, split, and preview.
- Embedded view: `Home`, `Weekly Review`, `Markdown Lab`, `Database Lab`, and
  `Kanban Plugin Test`.

## Databases

- Create database: use the app action after loading the demo.
- Add field: open `Field Type Lab` and add a field.
- Default system fields: every sample database includes `id`, `created_time`,
  and `updated_time`.
- Field types: `Field Type Lab` covers text, number, select, multi select,
  date, URL, checkbox, and formula.
- Select fields: `Tasks`, `Reading List`, `Field Type Lab`, `View Sort Filter
  Lab`, and `Formula Lab` only allow values from configured options.
- Multi select fields: `Tasks` and `Field Type Lab` store multiple option values
  in one cell.
- Option colors: every select and multi select field in the demo has colored
  options.
- Inline option colors: open a select or multi select cell dropdown and use the
  color chooser on the right side of an option.
- Option ordering: drag the handle on the left side of an option inside a cell
  dropdown; the saved schema option order should update.
- Option deletion: delete an option from the right side of a cell dropdown; any
  cells using that option should be cleared or filtered.
- Multi select dropdown: `Tasks` and `Field Type Lab` use dropdown pickers for
  multi select cells.
- Column type visibility: every table header shows a type badge.
- Column rename: click a non-system table header and update the name.
- Formula editing: click a formula column header in `Formula Lab` or `Tasks`.

## Records

- Add row: open `Tasks` or `Field Type Lab`.
- Edit cell: edit `Tasks`, `Reading List`, or `Field Type Lab`.
- Delete row: delete any non-demo-critical row from `Tasks`.
- CSV edge cases: `CSV Edge Case Lab` includes commas, quotes, empty cells, long
  text, numbers, and booleans.

## Formula Fields

- `Tasks` tests Excel-style `IF()` with priority/status.
- `Reading List` tests boolean comparison.
- `Field Type Lab` tests arithmetic.
- `Formula Lab` tests arithmetic, nested `IF()`, text, boolean, and range formulas.

## Views

- `Tasks` tests date sorting.
- `Reading List` tests numeric descending sorting.
- `View Sort Filter Lab` tests sorting plus filtering.
- Embedded live views appear on `Home`, `Weekly Review`, `Markdown Lab`, and
  `Database Lab`.
- Multiple views: `Tasks`, `Reading List`, `Field Type Lab`, `View Sort Filter
  Lab`, and `Formula Lab` include extra view JSON files beyond the default.
- View creation: open any database and use `New view`.
- View editing: use `View settings` to rename the view, change visible fields,
  reorder fields, sort, and filter.
- Non-default embedded views: several demo pages embed specific non-default
  views to test reference-based rendering.
- Plugin-backed view: `Tasks -> Board` uses the built-in Kanban provider and
  persists `type: "kanban"` plus `config.groupBy`.
- Embedded plugin-backed view: `Kanban Plugin Test` embeds `Tasks -> Board`
  inside a Markdown page without copying data.

## Search

The sidebar search should match:

- `markdown`
- `database`
- `alpha`
- `invoice`
- `formula`
- `reading`
- `field`

## Git Backup

After editing any page or cell, click `Backup` to test manual Git backup.
