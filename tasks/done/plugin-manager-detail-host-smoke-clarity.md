# Plugin Manager Detail Host Smoke Clarity

## Goal

Make the plugin manager smoke report and assert settings host mounting while
each plugin detail page is actually open.

## Scope

- Return per-plugin detail host counts from `verifyPluginDetail`.
- Fail if a plugin detail page has no `.plugin-settings-tab-host`.
- Keep the existing built-in plugin detail text assertions.

## Gates

- [x] `npm run smoke:plugin-manager-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
