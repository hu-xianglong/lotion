# Kanban Plugin Test

This page exists to test database views embedded inside Markdown pages.

The embedded view below should render the same plugin-backed Kanban board as
the standalone Tasks database view. It should not copy records; dragging a card
between columns edits the underlying `status` select cell in `db_tasks/data.csv`.

```lotion-view
database: db_tasks
view: view_kanban
```
