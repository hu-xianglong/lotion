# Advanced Search Plugin Cost Guard

Status: done

## Scope

Lock down the user requirement that semantic/vector search remains an
Advanced Search plugin responsibility, not part of Notion import. The default
test path must use a small deterministic dataset and local embeddings so a
Notion import of a large workspace cannot accidentally spend external embedding
provider calls.

## Acceptance

- Add coded regression coverage proving Advanced Search can inspect/build from
  a small fixture without involving Notion import data.
- Assert idle/status/query-before-build paths do not call the embedding
  provider.
- Assert Notion import code paths do not import or instantiate Advanced Search.
- Keep this as a test/cost-boundary item; no product UI change is expected.

## Gates

- `npm exec -- tsc -p tsconfig.main.json && node --test test/package-core.test.mjs`
- `git diff --check`

## Result

- Added package-core regression coverage that Advanced Search uses a small
  deterministic fixture spanning page, database, and row-page documents.
- Verified status, chunk collection, and query-before-build paths do not call
  the embedding provider, so provider cost only happens after an explicit
  rebuild.
- Added a source-boundary assertion that Notion import services, plugin UI, and
  import scripts do not depend on Advanced Search code.
- Confirmed the Advanced Search UI smoke owns its own fixture and does not use
  the Notion import dataset.
