# Refresh Large-Database Baseline Wording

Status: done

## Goal

Make the performance roadmap's large-database timing table clearly describe the
pre-CSV-fast-path baseline instead of claiming the old char-by-char parser is
the current state.

## Scope

- Update wording around the 500K-row timing table.
- Avoid inventing a new 500K-row number until the dataset is remeasured.

## Gates

- `git diff --check`
