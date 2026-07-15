# Clarify CSV Parsing Rule After Fast Path

Status: done

## Goal

Keep `docs/rules.md` aligned with the centralized CSV reader after adding the
no-quote fast path.

## Scope

- Clarify that application code should still use CSV helpers.
- Clarify that line/comma splitting is only acceptable inside a centralized
  helper after a quote pre-scan.

## Gates

- `git diff --check`
