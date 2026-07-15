# Keyboard Shortcut Settings And Registry

Status: done

## Decision

Keyboard shortcut settings are a high-priority product surface. Lotion should
not rely only on hard-coded shortcuts; users need a discoverable and configurable
shortcut system for keyboard-first workflows.

## Why

Lotion already has many keyboard paths: global search/command palette, navigation
history, tabs, editor shortcuts, slash menu, modals, plugin commands, and LLM
Chat. They are currently spread across renderer code, CodeMirror keymaps,
plugin UI handlers, and plugin command surfaces. That makes shortcuts hard to
discover, hard to change, and risky to extend without conflicts.

## Scope

- Add a central shortcut registry for built-in app actions.
- Model shortcuts with stable action ids, labels, categories, default chords,
  platform-specific display labels, and active scopes.
- Support at least these first-party shortcut categories:
  - global navigation and window/tab actions;
  - command palette/search actions;
  - page/editor toggles such as raw Markdown, Vim mode, embed source, full
    width, small text, favorite, and open current item in a new window;
  - LLM Chat assistant open/close actions when available.
- Add a keyboard shortcuts settings UI:
  - searchable shortcut list;
  - category grouping;
  - edit shortcut;
  - reset one shortcut;
  - reset all shortcuts;
  - disable shortcut where safe.
- Detect conflicts before saving:
  - exact same chord in the same scope;
  - reserved app shortcuts that should not be overridden;
  - text-input conflicts where the shortcut would steal normal typing.
- Persist user overrides as local user preferences, not workspace content.
- Show shortcut labels where they help discovery:
  - command palette command rows;
  - relevant settings rows;
  - tooltips for high-frequency toolbar buttons.
- Keep OS differences explicit, especially macOS `Cmd` versus Windows/Linux
  `Ctrl`.
- Provide a migration path from hard-coded handlers to the registry without
  changing every shortcut in one risky pass.

## Out Of Scope

- Full CodeMirror keymap customization for every editor command.
- Vim-mode remapping.
- Plugin-defined custom shortcut settings for external plugins.
- Cross-device shortcut sync.
- Rebinding OS-reserved shortcuts that the app cannot reliably capture.

## Acceptance

- Users can open a Keyboard Shortcuts settings surface and see the main app
  shortcuts grouped by category.
- Users can edit, disable, and reset configurable shortcuts.
- Conflicting shortcut assignments are blocked with clear copy.
- Global/app shortcuts are resolved through the registry rather than ad hoc
  hard-coded checks for the migrated first slice.
- Command palette rows can display their registered shortcut labels.
- Existing shortcuts keep their current default behavior unless the user changes
  them.
- Shortcut overrides persist across app reloads on the same device.
- Keyboard handling does not steal ordinary typing in editors, inputs, or
  plugin modals except for explicitly global shortcuts.

## Suggested Slices

1. Shortcut registry data model, normalization, platform labels, and conflict
   detection.
2. Local persistence for user overrides.
3. Keyboard Shortcuts settings UI with search, edit, reset, and disable.
4. Migrate global navigation/search/tab shortcuts to the registry.
5. Display shortcut labels in command palette rows and selected toolbar
   tooltips.
6. Add plugin command shortcut declaration support later if the plugin platform
   permission model calls for it.

## Gates

- Unit tests for shortcut normalization, serialization, platform labels, and
  conflict detection.
- Renderer component coverage for the shortcuts settings UI.
- UI smoke for editing a shortcut, blocking a conflict, resetting a shortcut,
  and verifying the updated shortcut triggers the expected action.
- Regression smoke that typing in editor/input fields is not intercepted by a
  user shortcut.
- `npm run typecheck`
- `git diff --check`

## Result

- Added a shared shortcut registry for the first global shortcut slice:
  command palette/search, settings, history, window, and tab actions.
- Persisted shortcut overrides in local user settings instead of workspace data.
- Migrated App-level global key handling to resolve through the shortcut
  registry, including user overrides and disabled shortcuts.
- Added a Keyboard shortcuts section to Sidebar settings with search, grouped
  rows, edit capture, disable/enable, reset one, reset all, and conflict copy.
- Displayed registered command shortcut labels in command palette rows.
- Kept the first slice scoped out of CodeMirror/Vim remapping and external
  plugin-defined shortcuts.
- Fixed the settings panel geometry so expanded settings stay within compact
  viewport bounds with internal scrolling.

## Verification

- `node --check scripts/smoke-sidebar-settings-ui.mjs`
- `node --check scripts/test-renderer-components.mjs`
- `npm exec -- tsc -p tsconfig.main.json`
- `node --test --test-name-pattern "shortcut registry" test/package-core.test.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:sidebar-settings-ui`
- `git diff --check`

Note: a full `node --test test/package-core.test.mjs` run was attempted during
development and exposed an unrelated pre-existing search-service assertion
failure outside this shortcut slice. The focused shortcut package-core test
passed after rebuilding `dist-electron`.
