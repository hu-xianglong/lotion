# Refresh Parity Docs After Import Fidelity Passes

Status: done

## Problem

`tasks/todo/notion-core-parity-sequence.md` still describes queue progress only
through item 166, while the queue has since added backlink polish, importer
audit hardening, file/cache performance work, and a run of Notion import fidelity
fixes.

## Scope

- Refresh the current-status paragraph so future queue work starts from an
  accurate baseline.
- Mention the recent import fidelity improvements without turning the document
  into a full changelog.

## Gates

- `git diff --check`
