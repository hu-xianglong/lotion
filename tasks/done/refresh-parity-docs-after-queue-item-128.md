# Refresh Parity Docs After Queue Item 128

Status: done

## Why

The operational queue has advanced through the gallery/calendar polish and full
UI smoke verification items. The parity sequence document should reflect the
current queue position so future continuous runs do not restart from stale
guidance.

## Scope

- Update the current-progress summary in `tasks/todo/notion-core-parity-sequence.md`.
- Keep this as a documentation-only change.

## Gates

- `git diff --check`
