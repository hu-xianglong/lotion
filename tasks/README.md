# Tasks

Use one Markdown file per task and move it between status folders:

- `todo/` for work not started.
- `wip/` for work in progress.
- `done/` for finished work.

This folder is intentionally plain text so tasks can be reviewed, searched,
edited by an LLM, and versioned with Git.

Use `QUEUE.md` as the continuous work queue. When asked to continue without a
new priority, start with the first `ready` item in that file.

Run `npm run test:task-docs` after moving or renaming tasks. The gate rejects
broken `tasks/todo`, `tasks/wip`, or `tasks/done` references and completed,
fixed, or reverted statuses that remain under `tasks/todo`. Queue items
completed from #614 onward must also declare `Verification status: verified`
and record both the verification method and result under `## Verification`.
