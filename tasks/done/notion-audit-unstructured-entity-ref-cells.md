# Notion audit unstructured entity ref cells

Status: done

## Why

Imported relation and page-link fields are stored as structured `entity_ref`
JSON. If a cell regresses to plain text or malformed JSON, links may look like
text while navigation silently breaks.

## Scope

- Corrupt one imported relation cell into a non-JSON value.
- Assert the Notion import audit reports `unstructured_entity_ref`.

## Gates

- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
