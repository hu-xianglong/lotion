# Lotion

An LLM-first local Notion.

Lotion is a local-first, plain-text-first personal knowledge workspace. It aims
to provide a Notion-like interface while keeping user data portable, readable,
Git-friendly, and LLM-friendly.

The current source of truth for product requirements is:

- [User Requirements](docs/user-requirements.md)
- [Product Design](docs/design.md)
- [Code Design](docs/code-design.md)

## Development

```sh
npm install
npm run dev
```

Load the demo workspace used for local testing:

```sh
npm run demo:reset
```

Useful checks:

```sh
npm test
npm run typecheck
npm run build
```

## Storage Model

Workspace CSV, Markdown, and JSON files remain the source of truth. Lotion
builds a disposable, machine-local cache under the app's
`workspace-cache/` directory in Application Support. A small SQLite projection
contains only the page and database summaries needed for the first paint.
Row-page metadata and body paths live in a generation-addressed sidecar with a
lazy offset index, so opening a row page remains fast without loading every row
during startup. Source fingerprints are validated before every cache hit.
These local cache files can be deleted at any time; Lotion rebuilds them from
the workspace source files without writing cached values back into them.

## License

[MIT](LICENSE)
