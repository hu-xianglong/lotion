# Task Documentation State Integrity Gate

Status: done

Verification status: verified

## Goal

Keep the continuous queue and task folders trustworthy after task moves,
renames, completion, reversion, and supersession.

## Delivered

- Added `npm run test:task-docs` and included it in `test:fast`.
- Validate every explicit `tasks/todo`, `tasks/wip`, and `tasks/done` Markdown
  reference across the task corpus.
- Reject `done`, `fixed`, or `reverted` task statuses left under `tasks/todo`.
- Reject duplicated or non-increasing queue orders and queue status/folder
  mismatches for done, ready, wip, and blocked entries.
- Require every completed queue item from #614 onward to declare
  `Verification status: verified` and record both how it was verified and the
  result under `## Verification`.
- Added isolated positive and negative fixtures proving both acceptance and
  failure behavior.

## Verification

Independently verified on 2026-07-22 after repairing 13 pre-existing broken
task references and archiving a reverted task that was already superseded by a
verified replacement.

Results:

- `npm run test:task-docs` (3/3 validator tests passed)
- Repository scan passed for 651 Markdown files, 772 task references, and 638
  strictly ordered queue items after this record was added.
- A focused audit checked all 25 completed entries from #614 through #638;
  every task now has both the verified marker and verification section.
- `npm run typecheck` (passed)
- `git diff --check` (passed)

The negative fixtures prove the gate fails for missing references, completed
status under todo, done/path mismatch, duplicate order, blocked items that
point into done, and newly completed features without a verified marker and
verification record. The tightened gate also found and repaired missing
verified markers on completed queue items #614–#620.
