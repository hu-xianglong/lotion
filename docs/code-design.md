# Lotion MVP Code Design

## Scope

This document describes the first implementation of Lotion as an Electron,
React, TypeScript, and Vite app.

The goal is to build a useful MVP without overbuilding the future plugin or LLM
architecture. The code should still leave clean extension points for those later.

## Process Model

Lotion has three TypeScript execution areas.

```text
Electron main process
  Owns windows, app lifecycle, filesystem access, Git commands, IPC handlers.

Electron preload script
  Exposes a small typed API to the renderer through contextBridge.

React renderer
  Owns UI, local UI state, editing interactions, and calls preload APIs.
```

Rules:

- The renderer does not use Node APIs directly.
- The main process validates all workspace paths and operation inputs.
- The preload API stays small and typed.
- Domain types are shared between main, preload, and renderer.

## Proposed Repository Structure

```text
lotion/
  package.json
  vite.config.ts
  tsconfig.json
  electron.vite.config.ts
  index.html

  src/
    main/
      index.ts
      window.ts
      ipc.ts
      services/
        workspace-service.ts
        page-service.ts
        database-service.ts
        view-service.ts
        git-service.ts
      storage/
        paths.ts
        json-file.ts
        markdown-file.ts
        csv-file.ts

    preload/
      index.ts
      lotion-api.ts

    renderer/
      main.tsx
      App.tsx
      styles.css
      components/
        AppShell.tsx
        Sidebar.tsx
        Toolbar.tsx
      features/
        pages/
          PageEditor.tsx
          MarkdownPreview.tsx
          EmbeddedViewRenderer.tsx
        databases/
          DatabaseTable.tsx
          CellEditor.tsx
          FieldDialog.tsx
          ViewSettingsDialog.tsx
        search/
          SearchBox.tsx
        backup/
          BackupButton.tsx
      state/
        app-store.ts
      lib/
        markdown.ts
        formula.ts
        view-query.ts

    shared/
      types.ts
      ids.ts
      result.ts
      constants.ts
```

This structure can be adjusted during scaffolding, but the main separation should
stay intact.

## Workspace Storage

Users should not need to know this structure. It is the MVP implementation
format.

```text
space/
  lotion.json
  databases/
    user/
      <database-title>--db_<id>/
        schema.json
        data.csv
        views/
          view_<id>.json
        pages/
          <title>--<row-id>.md
        templates/
          data.csv
          pages/
            <template-title>--<template-id>.md
    system/
      pages--db_pages/
      schema.json
      data.csv
      views/
        view_<id>.json
      pages/
        <title>--<page-id>.md
  attachments/
    images/
    documents/
    misc/
```

### `lotion.json`

Workspace metadata and navigation order.

```json
{
  "version": 1,
  "spaceId": "sp_...",
  "name": "My Space",
  "pages": ["pg_..."],
  "databases": ["db_..."],
  "activePageId": "pg_..."
}
```

### Page Markdown

Pages are Markdown files with frontmatter.

~~~markdown
---
id: pg_abc
title: Weekly Review
created_time: 2026-05-16T12:00:00.000Z
updated_time: 2026-05-16T12:00:00.000Z
---

# Weekly Review

```lotion-view
database: db_tasks
view: view_default
```
~~~

The page title is stored in frontmatter for fast listing. The first heading can
diverge later, but for the MVP renaming the page should update both frontmatter
and the first `#` heading when safe.

### Database Schema

`schema.json` defines fields and the default view.

```json
{
  "id": "db_tasks",
  "name": "Tasks",
  "created_time": "2026-05-16T12:00:00.000Z",
  "updated_time": "2026-05-16T12:00:00.000Z",
  "fields": [
    { "id": "id", "name": "ID", "type": "id", "system": true },
    {
      "id": "created_time",
      "name": "Created time",
      "type": "created_time",
      "system": true
    },
    {
      "id": "updated_time",
      "name": "Updated time",
      "type": "updated_time",
      "system": true
    },
    { "id": "title", "name": "Title", "type": "text" }
  ],
  "defaultViewId": "view_default"
}
```

### Database CSV

`data.csv` stores records. The header uses stable field IDs, not display names.

```csv
id,created_time,updated_time,title,status
row_1,2026-05-16T12:00:00.000Z,2026-05-16T12:00:00.000Z,Try Lotion,Todo
```

System fields are stored as normal columns so the files are easy to inspect.

### View JSON

Views store presentation and query configuration, not records. A database can
have multiple view JSON files in its `views/` directory.

```json
{
  "id": "view_default",
  "databaseId": "db_tasks",
  "name": "Default",
  "type": "table",
  "visibleFieldIds": ["title", "status", "created_time"],
  "fieldOrder": ["title", "status", "created_time"],
  "sorts": [],
  "filters": []
}
```

For MVP, filters and sorts should be structured JSON. SQL-like view queries can
be added later.

## Shared Domain Types

Core types live in `src/shared/types.ts`.

```ts
export type ID = string;

export type FieldType =
  | "id"
  | "created_time"
  | "updated_time"
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "url"
  | "checkbox"
  | "formula";

export interface SpaceManifest {
  version: 1;
  spaceId: ID;
  name: string;
  pages: ID[];
  databases: ID[];
  activePageId?: ID;
}

export interface PageMeta {
  id: ID;
  title: string;
  created_time: string;
  updated_time: string;
}

export interface PageDocument {
  meta: PageMeta;
  markdown: string;
}

export interface DatabaseSchema {
  id: ID;
  name: string;
  created_time: string;
  updated_time: string;
  fields: FieldSchema[];
  defaultViewId: ID;
}

export interface FieldSchema {
  id: ID;
  name: string;
  type: FieldType;
  system?: boolean;
  options?: SelectOption[];
  formula?: string;
}

export interface SelectOption {
  id: ID;
  name: string;
  color?: string;
}

export type RecordValue = string | number | boolean | null;
export type DatabaseRecord = Record<string, RecordValue>;

export interface TableView {
  id: ID;
  databaseId: ID;
  name: string;
  type: "table";
  visibleFieldIds: ID[];
  fieldOrder: ID[];
  sorts: ViewSort[];
  filters: ViewFilter[];
}

export interface ViewSort {
  fieldId: ID;
  direction: "asc" | "desc";
}

export interface ViewFilter {
  fieldId: ID;
  operator: "is" | "is_not" | "contains" | "gt" | "lt" | "checked";
  value: RecordValue;
}
```

## Preload API

The renderer talks to the app through one typed API.

```ts
export interface LotionApi {
  workspace: {
    create(input: CreateWorkspaceInput): Promise<SpaceManifest>;
    open(path?: string): Promise<SpaceManifest>;
    getManifest(): Promise<SpaceManifest>;
  };

  pages: {
    list(): Promise<PageMeta[]>;
    create(input: CreatePageInput): Promise<PageDocument>;
    get(id: string): Promise<PageDocument>;
    update(id: string, input: UpdatePageInput): Promise<PageDocument>;
    rename(id: string, title: string): Promise<PageDocument>;
  };

  databases: {
    list(): Promise<DatabaseSummary[]>;
    create(input: CreateDatabaseInput): Promise<DatabaseBundle>;
    get(id: string): Promise<DatabaseBundle>;
    addField(id: string, input: AddFieldInput): Promise<DatabaseBundle>;
    updateCell(input: UpdateCellInput): Promise<DatabaseBundle>;
    addRow(databaseId: string): Promise<DatabaseBundle>;
    deleteRow(input: DeleteRowInput): Promise<DatabaseBundle>;
  };

  views: {
    create(input: CreateViewInput): Promise<DatabaseBundle>;
    update(input: UpdateViewInput): Promise<DatabaseBundle>;
  };

  git: {
    status(): Promise<GitStatus>;
    backupNow(message?: string): Promise<GitBackupResult>;
  };
}
```

`window.lotion` should be typed through a global declaration in the renderer.

## IPC Design

IPC channels should be centralized in `src/main/ipc.ts`.

Channel naming:

```text
workspace:create
workspace:open
workspace:getManifest
pages:list
pages:create
pages:get
pages:update
pages:rename
databases:list
databases:create
databases:get
databases:addField
databases:updateCell
databases:addRow
databases:deleteRow
views:update
views:create
git:status
git:backupNow
```

Each handler should:

1. Validate that a workspace is open.
2. Validate input shape.
3. Call a service.
4. Return serializable data.
5. Convert thrown errors into consistent app errors.

## Main Process Services

### Workspace Service

Responsibilities:

- Create a new workspace directory.
- Open an existing workspace directory.
- Read and write `lotion.json`.
- Provide safe path helpers for other services.
- Ensure required directories exist.

### Page Service

Responsibilities:

- List page metadata.
- Create page Markdown with frontmatter.
- Parse page frontmatter.
- Update page Markdown.
- Rename pages.
- Update `updated_time`.

### Database Service

Responsibilities:

- Create database directories.
- Create schema, data CSV, and default view.
- Read database bundle: schema, records, views.
- Add fields.
- Add rows.
- Update cells.
- Delete rows.
- Update system timestamps.

### View Service

Responsibilities:

- Read and write view JSON.
- Validate referenced database and fields.
- Apply view sort and filter in memory for renderer display.

### Git Service

Responsibilities:

- Detect whether workspace is a Git repository.
- Run `git status --short`.
- Run manual backup:
  - `git add .`
  - `git commit -m "..."`
- Return friendly status messages.

For MVP, Git errors can be shown plainly. Remote sync is out of scope.

## Renderer State Design

Keep renderer state simple. A lightweight store is enough.

Recommended initial state:

```ts
interface AppState {
  manifest?: SpaceManifest;
  pages: PageMeta[];
  databases: DatabaseSummary[];
  activeItem?: ActiveItem;
  activePage?: PageDocument;
  activeDatabase?: DatabaseBundle;
  searchQuery: string;
  isLoading: boolean;
  error?: string;
}

type ActiveItem =
  | { type: "page"; id: string }
  | { type: "database"; id: string };
```

Avoid adding a complex client cache in the MVP. After each write, return the
updated document or bundle from the main process and update state directly.

## Renderer Components

### AppShell

Owns layout:

- Sidebar.
- Main content area.
- Top toolbar if needed.

### Sidebar

Shows:

- Space name.
- Search box.
- Filtered pages.
- Filtered databases.
- New page button.
- New database button.

### PageEditor

Shows:

- Title input.
- Markdown editor.
- Preview toggle or split view.
- Insert view action.

### MarkdownPreview

Renders Markdown and detects `lotion-view` code blocks.

MVP approach:

- Use a Markdown parser with custom code-block handling.
- For `lotion-view`, render `EmbeddedViewRenderer`.
- For all other blocks, render normal Markdown.

### EmbeddedViewRenderer

Given `databaseId` and `viewId`:

- Loads the database bundle if needed.
- Renders `DatabaseTable` in embedded mode.
- Provides a button to open the full database view.

### DatabaseTable

Displays:

- Header row.
- Editable cells.
- Add row button.
- Delete row action.
- Basic sort/filter controls.

The table should use stable dimensions and avoid layout jumps.

## Formula Engine

MVP formula support should be intentionally small.

Place formula logic in:

```text
src/renderer/lib/formula.ts
```

or shared code if the main process needs to persist computed values later.

Initial behavior:

- Formula values are computed at display time.
- Formula field values are not written into `data.csv`.
- Formula expressions can reference other fields by field ID first.
- Display-name references can be added later.

Supported MVP grammar:

- Numbers and strings.
- Field references.
- `+`, `-`, `*`, `/`.
- `=`, `!=`, `>`, `<`, `>=`, `<=`.
- `CASE WHEN condition THEN value ELSE value END`.

If parsing gets too expensive, use a small existing expression parser rather than
writing a full SQL parser.

## View Query Engine

MVP views should use structured filters and sorts.

Place logic in:

```text
src/renderer/lib/view-query.ts
```

Responsibilities:

- Hide fields not in `visibleFieldIds`.
- Order fields by `fieldOrder`.
- Apply filters.
- Apply sorts.
- Compute formula values for display.

Later, this can move to shared or main code if databases become large.

## File Safety

Main process writes should be safe enough for personal use.

Rules:

- Write JSON with stable formatting.
- Parse files defensively.
- Never trust paths from renderer.
- Use IDs to resolve paths.
- Update timestamps on writes.
- Prefer atomic write helpers for JSON, Markdown, and CSV.

Atomic write helper:

1. Write to `file.tmp`.
2. Rename existing file to `file.bak` when useful.
3. Rename temp file to final path.

For MVP, `.bak` files can be skipped if Git backup is available, but temp-write
then rename is still useful.

## Error Handling

Use a small app error shape.

```ts
export interface AppError {
  code: string;
  message: string;
  details?: unknown;
}
```

Renderer should show friendly messages:

- Could not open workspace.
- Could not save page.
- Could not read database.
- Formula has an error.
- Backup failed.

Detailed stack traces can go to the developer console.

## Testing Strategy

Start with focused tests where mistakes are likely:

- Frontmatter parsing.
- CSV read/write.
- View filtering and sorting.
- Formula evaluation.
- Storage path helpers.

Recommended tools:

- Vitest for unit tests.
- Playwright later for end-to-end Electron smoke tests.

Do not block the first scaffold on a heavy test suite, but add tests around data
format helpers as soon as those helpers exist.

## Implementation Order

1. Scaffold Electron + React + TypeScript + Vite.
2. Add shared domain types.
3. Add main/preload IPC skeleton.
4. Add workspace creation/opening with a default sample space.
5. Build app shell and sidebar.
6. Implement page list, create page, edit page, save page.
7. Implement Markdown preview.
8. Implement database create/read with schema, CSV, and default view.
9. Implement table view display.
10. Implement add row, edit cell, delete row.
11. Implement embedded view rendering in Markdown preview.
12. Implement visible fields, sort, and filter.
13. Implement formula field display.
14. Implement simple title/name search.
15. Implement manual Git backup.

## Intentional Deferrals

Do not build these in the first code pass:

- Plugin runtime.
- Assistant tool calling.
- Semantic search.
- Remote Git sync UI.
- Conflict resolution UI.
- Multiple view types.
- Page nesting.
- Block editor.
- Native packaging and auto-update.
