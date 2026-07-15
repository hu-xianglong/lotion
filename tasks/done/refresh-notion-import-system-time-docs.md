# Refresh Notion Import System Time Docs

## Why

The compatibility table still said Notion created/last-edited time columns were
plain text, but the importer now maps canonical Notion time columns into
Lotion's hidden system timestamps while retaining user-visible source values.

## Scope

- Corrected the Notion import compatibility docs.
- Kept the pitfall doc as the more detailed explanation.

## Gates

- `git diff --check`
