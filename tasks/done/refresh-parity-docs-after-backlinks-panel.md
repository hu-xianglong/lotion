# Refresh Parity Docs After Backlinks Panel

Status: done

## Why

The operational queue now includes backlinks API, UI, and smoke coverage. The
planning docs should stop describing backlinks as entirely pending so future
queue picks do not duplicate recently completed work.

## Scope

- Update the core parity sequence current-status paragraph through item 166.
- Mark backlinks as partially covered in the Notion gap backlog, leaving tag
  pages and richer backlink workflows open for discussion.

## Gates

- `git diff --check`
