# Plugin Manager Readonly Surface

Status: done

## Goal

Expose the current plugin host registry as a product surface before building
the external plugin loader.

## Done

- Added a read-only Plugin management page under the existing management route.
- Linked the Plugin management page from the sidebar footer.
- Listed loaded built-in plugins with id, name, version, and active status.
- Listed registered field providers, including the default built-in field
  types: text, number, select, multi-select, date, URL, checkbox, and formula.
- Listed registered database view providers, including Kanban.
- Added host-side inspection metadata so providers can report their source
  plugin without changing the public provider API.
- Showed command, sidebar item, page action, and settings tab registrations
  when present.

## Non-goals Preserved

- No external plugin loading.
- No install, update, disable, or permission grant UI.
- No persistent plugin settings UI.
- No sandboxing or hot reload.

## Verification

- `npm run typecheck`
- `npm run test:fixtures`
- `npm run build`
- `git diff --check`
