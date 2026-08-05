# Lotion Agent Workflow

These instructions apply to every agent working in this repository.

## One Completed Task, One Published Commit

For every item taken from `tasks/QUEUE.md`:

1. Finish only the current task and run all of its required gates.
2. Move its task file to `tasks/done/` and update the queue and related planning
   documents in the same change.
3. Stage only files that belong to that task. Never include unrelated changes
   from another agent or user.
4. Create one task-scoped commit. Prefer
   `feat(task-<order>): <summary>` or `fix(task-<order>): <summary>`.
5. Push the commit to the current branch's tracked remote. If the branch has no
   upstream, set one with `git push -u <remote> HEAD`.
6. Verify that `HEAD` is present on the tracked remote and that the worktree is
   clean before starting the next queue item.

Do not batch multiple completed queue items into one commit. A task is not fully
complete, and the next queue item must not start, until its commit has been
pushed successfully.

If commit or push fails, stop the queue loop, preserve the completed work, and
report the exact blocker. Never bypass failed required gates just to publish.

## Concurrent Agents

Only one agent may own a queue item. Agents working concurrently must use
separate branches/worktrees and task-scoped commits. They must not stage,
commit, reset, or overwrite another agent's files. A coordinating agent should
merge or rebase those branches deliberately before advancing the shared queue.
