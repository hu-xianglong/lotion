# Lotion User Requirements

## Product Vision

Lotion is an LLM-first local Notion: a local-first personal knowledge workspace
that should feel as approachable as Notion, while keeping the user's knowledge
base transparent, portable, Git-friendly, and friendly to LLM workflows.

The product is interface-first: users should be able to use the application
comfortably without understanding the underlying directory structure or file
formats. Plain text storage is an implementation principle, not a burden placed
on the user.

## Product Principles

1. Local-first: user data lives locally by default.
2. Plain-text-first: pages, databases, views, formulas, and configuration should
   be stored in readable and portable formats where practical.
3. Interface-first: users primarily interact through a polished UI, not by
   manually editing files.
4. Git-native: backup, history, and multi-device sync should be designed around
   Git as a first-class capability.
5. LLM-native: the workspace should be understandable and actionable by LLMs.
6. Plugin-first: advanced capabilities should be extensible through a plugin
   system with a smoother experience than Obsidian-style plugin management.

## User Mental Model

Users should understand the product through these visible concepts:

- Space: a personal knowledge workspace.
- Page: a Markdown-capable writing and organization surface.
- Database: a structured collection of information.
- View: a reusable way to look at a database without duplicating data.
- Plugin: an optional capability that can extend the workspace.
- Assistant: an LLM-powered collaborator that can search, explain, organize,
  and operate on workspace content with user permission.

Users should not need to know that pages may be Markdown files, databases may be
CSV files, views may be JSON files, formulas may use SQL files, or backups may
be Git commits. Those details should be available only in advanced or developer
surfaces.

## Pages

Users can create, edit, search, organize, and delete pages from the interface.

Pages should support Markdown as the primary authoring format. The application
may provide editing affordances that make Markdown feel friendly, but the user's
content should remain portable.

Pages can embed database views. Embedded views should be live references, not
copies of data.

Users should be able to:

- Create a page.
- Rename a page.
- Move or organize pages.
- Search pages.
- Edit page content.
- Preview rendered Markdown.
- Insert a database view into a page.
- Edit an embedded view inline.
- Open the full management surface for an embedded view.

## Databases

Users can create structured collections of information called databases. A
database should feel like a table or collection in the UI, not like a raw CSV
file.

Each database should include default system fields:

- ID
- Created time
- Updated time

The initial field system should include:

- Text
- Number
- Select
- Multi-select
- Date
- Checkbox
- URL
- Long text or Markdown
- Formula

Formula fields should be supported from the beginning. Formulas should use a
SQL-like syntax rather than a custom expression language where practical.

Example formula:

```sql
CASE
  WHEN status = 'Done' THEN 0
  WHEN priority = 'High' THEN 10
  ELSE 1
END
```

The system should distinguish between user-facing database concepts and
implementation details. Users should not need to know how the database is stored.

## Views

A view is a reusable presentation and query configuration for a database. Views
must not duplicate database data.

The first required view type is table view. The system should be designed so new
view types can be added later, including board, calendar, list, gallery,
timeline, graph, and custom plugin-provided views.

Users should be able to:

- Create a view for a database.
- Rename a view.
- Duplicate or fork a view.
- Delete a view.
- Embed a view in a page.
- Edit a view inline from where it is embedded.
- Jump from an embedded view to the full view management surface.
- Configure visible fields.
- Reorder fields.
- Resize fields where relevant.
- Filter records.
- Sort records.
- Group records where the view type supports grouping.
- Search within a view.

When a user edits a view, all places that reference the same view should reflect
the change.

View configuration should be understandable by both the UI and LLM assistant.
SQL-like query expressions should be considered for filters, sorting, and
derived data where appropriate.

## Plugins

The plugin system is a core product area, not a later afterthought. Plugins
should make the product extensible while remaining easy and safe for users.

The plugin experience should be more convenient than Obsidian-style plugin
management. Users should be able to discover, enable, configure, update, and
disable plugins with clear explanations and minimal manual setup.

Plugins may provide:

- Commands
- View types
- Field types
- Search indexers
- Sync providers
- Backup providers
- LLM providers
- LLM tools
- Markdown renderers
- Importers and exporters
- UI panels or settings surfaces

Plugins should have clear permissions. Users should understand whether a plugin
can read workspace content, write workspace content, access the network, call an
LLM provider, run local commands, or modify backup and sync state.

Plugins should be configurable through the UI. Plugin configuration should be
portable with the workspace where appropriate, while secrets and credentials
should be stored safely outside plain workspace files.

The assistant should be able to call plugin-provided tools only when the user has
granted the required permissions.

## Backup And Sync

Backup is essential. Git backup should be available as a default plugin or
built-in plugin-like capability.

Users should be able to:

- See whether the current space is backed up.
- Manually create a backup.
- Enable automatic backups.
- Review recent backup history.
- Connect a Git remote for multi-device sync.
- Pull changes from another device.
- Push local changes to a remote.
- Understand and resolve sync conflicts through a user-friendly interface.

The product should hide Git complexity in the default experience. Advanced users
may inspect commits, diffs, remotes, branches, and raw file changes.

Git should be considered part of the architecture for multi-device sync. The
design should account for conflicts, offline edits, auto-commit behavior, and
safe recovery.

## Search

Search is a core workflow.

Users should be able to search:

- Page titles
- Page content
- Databases
- Database records
- Views
- Plugin commands
- Settings where appropriate

Search should support multiple levels:

- Fast file and title search.
- Full-text search across local content.
- Semantic or vector search through an optional plugin.

Search results should be actionable. Users should be able to open results,
reference them in pages, send them to the assistant, or use them to create new
views and summaries.

## Assistant

The assistant should feel integrated with the workspace rather than bolted on as
a generic chat box.

Users should be able to chat with:

- The current page.
- A selected database.
- A selected view.
- Search results.
- The entire space.

The assistant should be able to help users:

- Find information.
- Explain workspace content.
- Summarize pages and database records.
- Generate formulas.
- Generate view filters and queries.
- Create or modify views after confirmation.
- Organize pages.
- Summarize Git changes.
- Use plugin-provided tools with permission.

Assistant actions should be previewable, confirmable, and reversible where
possible.

## Product Surfaces

The default UI should expose user-facing concepts, not implementation details.

Expected primary surfaces:

- Sidebar for space navigation.
- Page editor and preview area.
- Database and view workspace.
- Global search.
- Assistant panel.
- Plugin management.
- Backup and sync status.
- Settings.

The sidebar may include:

- Quick access.
- Recent pages.
- Favorites.
- Pages.
- Databases.
- Views.
- Plugins.

Advanced or developer surfaces may expose raw files, Git state, schema details,
plugin manifests, logs, indexes, and storage diagnostics.

## Non-Goals For The Initial Product Direction

The ideal product does not require these capabilities to be central at first:

- Cloud-only storage.
- Team collaboration.
- Public publishing.
- Account systems.
- Block-based editing.
- Users manually managing the underlying file layout.

These may be considered later, but they should not compromise the local-first
and plain-text-first foundation.

## Open Questions

1. What should the product name be?
2. Should the first implementation be a desktop app, a local web app, or both?
3. What is the right balance between Markdown source editing and rich editing?
4. How much of SQL should formulas and views support initially?
5. What is the safest default Git backup behavior?
6. How should plugin permissions be presented to non-technical users?
7. Which plugin APIs must exist in the first version?
8. How should semantic search indexes be stored, refreshed, and synced?
9. How should LLM-generated edits be previewed and rolled back?
