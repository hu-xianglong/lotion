# Sidebar Row-Page Recent Icon Smoke

## Goal

Ensure row pages opened through sidebar/file navigation preserve their row icon
in the sidebar Recent section.

## Scope

- Extend the sidebar navigation fixture with a `row_icon` field.
- Open the row page and assert its Recent nav item renders the expected icon.

## Gates

- [x] `npm run smoke:sidebar-navigation-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
