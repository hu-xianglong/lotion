# Workspace Smoke Empty Scaffold Resilience

Status: done

Verification status: verified

## Goal

Keep the repository workspace smoke gate strict for real database corruption
without failing on an unrelated, file-free database directory scaffold.

## Debugging

`npm run test:fast` stopped at `test:workspace` because the local demo workspace
contains `Quote_Builder--db_quote_builder/views/` but no `schema.json` or
`data.csv`. The directory is not registered in `lotion.json`, contains no files,
and is therefore not a database that the application can list or open.

The validator previously treated every directory immediately beneath
`databases/user` or `databases/system` as a materialized database. That made an
empty filesystem scaffold indistinguishable from a partially corrupted
database.

## Delivered

- Ignore only database directories that contain neither `schema.json` nor
  `data.csv` and have no files anywhere below them.
- Continue rejecting schema-only, data-only, and view/file-only database
  directories as partial/corrupt databases.
- Report the number of ignored empty scaffolds in workspace smoke output.
- Run an isolated CLI fixture before validating the repository demo workspace.

## Verification

Independently verified on 2026-07-22.

Results:

- `npm run test:workspace` passed its focused test 1/1. The positive fixture
  proved an empty nested `views/` scaffold is ignored; negative phases proved a
  view-file-only directory and a schema-only directory are both rejected.
- The real demo-space validation passed with 15 databases, 622,302 rows, 58
  Markdown files, 201 searchable files, and one empty scaffold ignored.
- `npm run test:fixtures` passed with 13 user and two system databases.
- `npm run test:latency` passed all view-query and 50,000-row CSV latency gates.
- `node scripts/bench-rollup-latency.mjs --check` passed with a 17.9 ms median
  against the 80 ms threshold.
- Final `npm run test:fast` passed end to end, including file boundaries,
  task-documentation integrity, TypeScript compilation, Node/service/import/
  renderer regressions, links, hierarchy, workspace smoke, fixtures, and all
  latency gates. Its repeated rollup benchmark passed at a 21.5 ms median.
- `npm run test:coverage` subsequently completed the same full chain under V8
  instrumentation and passed both 80% gates: package runtime coverage was
  83.4% (12,037/14,429 lines across 58 files), and builtin plugin runtime
  coverage was 83.1% (2,383/2,867 lines across 14 files).
