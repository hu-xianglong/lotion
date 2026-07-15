# CSV Parser No-Quote Fast Path

Status: done

## Why

Large database cold loads still spend meaningful time in CSV parsing. Most
Lotion-generated database CSVs do not contain quoted cells, so they can avoid
the slower character-by-character parser.

## Scope

- Add a no-quote fast path to main-process CSV parsing.
- Preserve the quoted-cell parser fallback for commas/newlines/escaped quotes.
- Add focused package-core coverage for both fast-path and quoted fallback
  behavior.

## Gates

- `node --test test/package-core.test.mjs`
- `npm run typecheck`
- `npm run test:latency`
- `git diff --check`
