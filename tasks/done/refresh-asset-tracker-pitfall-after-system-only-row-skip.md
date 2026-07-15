# Refresh Asset Tracker pitfall after system-only row skip

Status: done

## Why

The Asset Tracker pitfall still says unclaimed system-only row HTML is appended
as a synthesized row. The importer now skips that case and records it in Import
review, so the lesson should describe the current guardrail.

## Scope

- Update pitfall #41 to describe the fixed behavior.
- Reference the focused regression that protects this case.

## Gates

- `git diff --check`
