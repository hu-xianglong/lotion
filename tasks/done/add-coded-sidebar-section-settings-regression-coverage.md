# Add Coded Sidebar Section Settings Regression Coverage

Status: done

## Goal

Replace the manual-only coverage for the sidebar section settings workflow with
a coded Electron UI smoke test.

## Changes

- Added `scripts/smoke-sidebar-settings-ui.mjs`.
- Added `npm run smoke:sidebar-settings-ui`.
- Added the sidebar settings smoke to `scripts/smoke-ui-suite.mjs`.
- Registered the sidebar settings temp workspace prefix for smoke cleanup.

## Coverage

The smoke creates an isolated workspace, temporarily resets local sidebar
settings to the default English UI, opens the sidebar settings panel, and
asserts:

- Pages and Databases are both active default sidebar choices.
- The initial settings order is Pages then Databases.
- The rendered sidebar section order is Pages then Databases.
- Moving Databases upward changes the rendered section order to Databases then
  Pages.
- Reset returns the rendered section order to Pages then Databases.

The smoke restores the previous local sidebar settings and workspace after the
run.

Backend tests were not added because this item only adds frontend UI regression
coverage and does not change settings persistence, workspace APIs, or service
behavior.

## Gates

- `npm run typecheck` passed.
- `npm run smoke:sidebar-settings-ui` passed.
- `git diff --check` passed.
