# Database View Type Switch UI Smoke

Status: done

## Why

The database view management smoke covered table view creation, rename,
duplicate, default, and delete flows, but it did not verify switching a view to
a non-table type. List/gallery/calendar are Notion-core database surfaces and
view type persistence must be guarded.

## Scope

- Create and rename a deterministic view.
- Switch the created view from table to list through the view settings dialog.
- Verify the list body renders.
- Verify the saved view stores `type: "list"`.
- Reload, select the view, and verify the list body still renders.
- Verify duplicate preserves the non-table view type.

## Gates

- `npm run smoke:database-template-ui` passed.
- `git diff --check` passed.
