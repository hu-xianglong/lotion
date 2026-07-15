# Renderer Component Workspace Selector Regression

Status: done

## Why

Workspace switching and workspace icons have repeatedly affected the sidebar
first impression. The shared Electron smoke covers interaction, but the static
renderer component gate does not currently assert the closed workspace selector
markup, icon, label, menu affordance, or absence of menu content before the user
opens it.

## Scope

- Add static renderer coverage for the closed `WorkspaceSelector`.
- Assert the selector button, workspace icon, workspace name, dropdown icon,
  menu ARIA attributes, and that recent/action menu content is not rendered
  before interaction.
- Keep this as renderer presentation coverage only; do not change workspace
  switching, recent workspace storage, icon picker, or IPC behavior.

## Gates

- `node --check scripts/test-renderer-components.mjs` - passed
- `npm run test:renderer-components` - passed
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Added static renderer coverage for the closed `WorkspaceSelector`.
- Asserted the selector button, menu ARIA attributes, current workspace label,
  workspace icon, dropdown affordance, and that the menu/actions are hidden
  before interaction.
- Backend/service tests are not applicable because this only extends renderer
  presentation coverage; workspace switching, recent workspace storage, icon
  picker, and IPC behavior were not changed.
