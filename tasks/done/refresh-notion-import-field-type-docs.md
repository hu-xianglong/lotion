# Refresh Notion import field type docs

Status: done

## Why

The import compatibility docs still describe URL and relation properties as
plain text. Current importer behavior preserves URL fields, relation links as
entity refs, and checkbox properties as canonical booleans with audit coverage.

## Scope

- Update the Notion compatibility checklist field-type table.
- Update the pitfall field-type inference table.
- Mention current type-specific audit coverage.

## Gates

- `git diff --check`
