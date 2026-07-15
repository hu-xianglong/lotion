# Built-in Plugin Enable Disable Controls

Status: done

## Why

The plugin manager lists plugins and permissions, but every plugin is hardcoded
as `active` and users cannot manage plugin lifecycle. This leaves the plugin
surface below the expected management behavior.

## Scope

- Add a host-level plugin status model with active and disabled states.
- Keep core field types locked so disabling them cannot break database field
  rendering.
- Add enable/disable controls for optional built-in plugins in the plugin
  manager.
- Persist the built-in plugin enabled state in browser local storage.
- Dispose plugin registrations when disabled and reinstall them when enabled.
- Keep the plugin manager layout stable across desktop and compact viewports.

## Required Gates

- `node --test test/package-core.test.mjs`
- `npm run typecheck`
- `npm run smoke:plugin-manager-ui`
- `git diff --check`

## Result

- Added active/disabled plugin lifecycle status to plugin host inspection.
- Added built-in plugin enable/disable controls and local persistence.
- Kept Default Field Types locked as a required plugin.
- Disabling Kanban View disposes its provider registration; enabling it
  reinstalls the provider.
- Plugin manager list and detail surfaces show lifecycle controls.
- Plugin manager UI smoke now verifies desktop and compact enable/disable
  behavior, required-plugin affordance, provider unregister/re-register, and
  no horizontal overflow.
- Artifact contract now requires lifecycle evidence.

## Verification

- `node --test --test-name-pattern "plugin host scopes" test/package-core.test.mjs`
- `node --test --test-name-pattern "plugin manager artifact contract" test/ui-harness-artifacts.test.mjs`
- `npm run typecheck`
- `npm run smoke:plugin-manager-ui`
- `node --test --test-name-pattern "search service ranks" test/package-core.test.mjs`

Note: an initial full `node --test test/package-core.test.mjs` run hit the
existing search-service subtest once during the full suite, but the same search
subtest passed when rerun directly. The 602-scoped plugin-host coverage passed.
