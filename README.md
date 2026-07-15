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

## License

[MIT](LICENSE)
