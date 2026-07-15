# Lotion MVP Design

For current frontend visual rules, shared primitives, and test expectations, see
[`frontend-design-system.md`](./frontend-design-system.md). This MVP document
describes the original product shape; the frontend design system is the active
guide for new Search & AI, Settings, plugin, management, and editor-adjacent UI.

## Goal

Build a small, useful first version of Lotion: an LLM-first local Notion for one
person.

The MVP should prove the core loop:

1. Write Markdown pages.
2. Create simple databases.
3. Show databases as table views.
4. Embed a live table view inside a page.
5. Keep everything local and Git-friendly.

The MVP should be pleasant enough for personal use, but it should avoid building
the full plugin, sync, semantic search, and assistant architecture upfront.

## MVP Principles

- Keep the UI simple.
- Hide the file layout from normal users.
- Store data in readable local files.
- Prefer boring implementation choices.
- Design for future plugins, but do not build a plugin system yet.
- Build one good table view before adding more view types.

## First App Shape

The MVP has three visible areas.

### Sidebar

The sidebar shows:

- Space name.
- Search box.
- Pages.
- Databases.

Actions:

- New page.
- New database.

No separate plugin, backup, or view sections in the MVP.

### Main Area

The main area shows one of:

- A Markdown page.
- A database table view.

For a page:

- Edit Markdown.
- Preview Markdown.
- Render embedded table views.

For a database:

- Show the selected table view.
- Create additional table views.
- Show rows and fields.
- Let the user configure visible fields, sorting, and filtering.

### Right Panel

The MVP can skip a permanent right panel.

Use simple dialogs or popovers for:

- Field settings.
- View settings.
- Page metadata if needed.

## MVP Features

### Pages

Users can:

- Create a page.
- Rename a page.
- Edit Markdown.
- Preview Markdown.
- Insert a database view reference.
- See the embedded database view rendered inside the page.

Not in MVP:

- Block editor.
- Page nesting.
- Backlinks.
- Rich collaborative editing.

### Databases

Users can:

- Create a database.
- Add fields.
- View the database as a table.
- Use default system fields:
  - ID
  - Created time
  - Updated time

Initial field types:

- Text
- Number
- Select
- Multi-select
- Date
- URL
- Checkbox
- Formula

Not in MVP:

- Relation.
- Rollup.
- File fields.
- Advanced record pages.

### Records

For the MVP, records can be edited directly in the table.

Users can:

- Add a row.
- Edit a cell.
- Delete a row.

This is more useful than requiring manual CSV edits, and it lets us validate the
table interaction early.

### Formula Fields

Formula fields exist in the MVP, but the language should be small.

Start with row-level expressions only:

- Refer to fields by name or ID.
- Basic arithmetic.
- Basic comparison.
- Simple `CASE WHEN` expressions.

Example:

```sql
CASE
  WHEN status = 'Done' THEN 0
  WHEN priority = 'High' THEN 10
  ELSE 1
END
```

Not in MVP:

- Full SQL.
- Joins.
- Aggregations.
- Cross-database formulas.

### Views

The MVP has one native view type: table.

Each database has a default table view.

Users can configure:

- View name.
- Visible fields.
- Field order.
- Sort.
- Filter.

Views do not copy data. A page embeds a view by reference.

Not in MVP:

- Board view.
- Calendar view.
- Timeline view.
- Gallery view.
- Plugin-provided views.

### Page Embedded Views

A page can contain a simple embedded view block.

Proposed syntax:

~~~markdown
```lotion-view
database: tasks
view: default
```
~~~

The editor can insert this syntax for the user. The user does not need to type it
manually.

### Search

MVP search is simple:

- Search page titles.
- Search database names.

Not in MVP:

- Full-text search.
- Semantic search.
- Search inside every database cell.

### Git Backup

Git is important, but the MVP should start simple.

Users can:

- See whether the current space has Git enabled.
- Click "Backup now" to create a commit.

Not in MVP:

- Auto backup.
- Push/pull UI.
- Conflict resolver.
- Remote setup.

Advanced users can still use Git manually in the repo.

### Assistant

The MVP can include an assistant placeholder or very small assistant surface.

Useful first assistant capability:

- Generate a formula for the current database field.

Not in MVP:

- Full workspace chat.
- Semantic search.
- Autonomous edits.
- Plugin tool calling.

## Storage Model

Users should not need to know the storage model, but the MVP can use simple local
files.

Conceptual structure:

```text
space/
  pages/
  databases/
  views/
  settings.json
```

Pages are Markdown files.

Databases use:

- Data file for rows.
- Schema file for fields.
- View file for table configuration.

The exact file format can be finalized during implementation.

## Tech Stack

Use Electron from the beginning.

Stack:

- Electron.
- React.
- TypeScript.
- Vite.
- Node APIs in the Electron main process for local file access and Git.
- A preload API boundary between the renderer UI and local system operations.

Reason:

- Lotion will likely need Electron eventually for local files, Git, plugins,
  background indexing, and LLM tooling.
- Starting with Electron avoids migrating from a temporary local web app later.
- The UI can still be built with normal web technology.
- The plugin direction is closer to Obsidian's model.

Security rule:

- The React renderer should not receive unrestricted Node access.
- Local operations should go through a small typed API exposed by preload.
- The MVP API should include only what the app currently needs.

## First Implementation Milestone

Build a working local app with:

1. App shell with sidebar and main area.
2. Page list.
3. Markdown editor and preview.
4. Database list.
5. Table view for one database.
6. Simple local persistence.
7. Embedded table view rendering inside Markdown pages.

After that, add:

1. Field configuration.
2. Formula fields.
3. Simple search.
4. Manual Git backup.

## Later

These are important, but not MVP:

- Real plugin system.
- LLM workspace chat.
- Semantic search.
- Multi-device Git sync UI.
- Conflict resolution.
- More view types.
- Desktop packaging.
- Rich Markdown editor.
