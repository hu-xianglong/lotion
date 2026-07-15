# Command Search Keyboard Activation Smoke

Status: done

## Why

Global search doubles as the command palette. Command execution must work from
keyboard activation, not only mouse clicks.

## Scope

- Extend the plugin-manager smoke to run the `Open Notion Import` command from
  both click and Enter activation.
- Keep the test deterministic by using the existing temp workspace and a
  command that only emits a notification.

## Gates

- `npm run smoke:plugin-manager-ui`
- `npm run typecheck`
- `git diff --check`
