# Lotion Customer API

`lotion/customer-api` is the stable customer-facing API for automation,
tests, integrations, and future CLI entry points.

```ts
import { createLotionCustomerApi } from "lotion/customer-api";

const lotion = createLotionCustomerApi();
await lotion.workspace.open("/path/to/workspace");
const page = await lotion.pages.create({ title: "Research" });
```

## Stability Contract

The API object has a `version` field. Breaking changes require a major
version bump. The current version is `1.0`.

Stable surfaces:

- `workspace`: deterministic workspace create/open and workspace metadata.
- `pages`: list, create, read, update, rename, and delete pages.
- `databases`: list, read, create, delete, fields, cells, rows, templates, and cached stats.
- `views`: create and update database views.
- `rowPages`: open and update database rows as pages.
- `attachments`: list/read/write content-addressed attachments and import files by absolute path.
- `search`: workspace search.
- `entities`: resolve page/database/row entities and inspect backlinks.
- `notion`: scan, import, and audit Notion exports.

Not stable in this API:

- Electron UI behavior such as native dialogs, windows, and shell opening.
- Renderer-only details such as React components and CodeMirror state.
- Direct filesystem paths beyond workspace-relative paths returned by the API.
- Internal service classes under `src/main/services`.

## Testing And Coverage

Run the customer API contract test:

```sh
npm run test:customer-api
```

Run the package coverage gate:

```sh
npm run test:coverage
```

`test:coverage` enforces 90% line coverage independently for the main/shared
runtime package, bundled plugin runtime, and testable Renderer core. The
Renderer core gate covers parsing, state, settings, query, routing, template,
and option-color logic; Electron UI behavior is covered separately by the
multi-viewport UI regression lane.

Run the API-only coverage gate when changing this entry point:

```sh
npm run test:coverage:customer-api
```

The API-only gate also enforces 90% line coverage.
