# Plugin Settings Separation And Surface Polish

Status: done

## Why

Built-in plugin pages should feel like product surfaces, not raw settings
forms. Configuration-heavy plugins currently mix daily actions, status, setup,
and advanced options in the same panel, which makes the UI look noisy and
harder to scan.

## Scope

- Establish a built-in plugin UI pattern:
  - the main plugin page is for the primary workflow, status, and recent
    outcomes;
  - durable configuration lives in a dedicated plugin settings view;
  - the main page exposes a compact Settings affordance;
  - status summaries on the main page are read-only unless they are immediate
    workflow actions.
- Apply the pattern to current configuration-heavy built-in plugins, including
  Advanced Search, LLM Chat, Git Sync/GitHub Backup, and Notion Import where
  relevant.
- Move provider/API-key/base-URL/model/vector-store/cadence/remote settings out
  of daily-use pages unless an inline control is required for the immediate
  task.
- Keep command palette entries distinct where useful:
  - open the plugin workflow page;
  - open the plugin settings page.
- Define shared visual expectations for plugin surfaces:
  - no nested cards;
  - restrained, Notion-like layout;
  - compact status rows;
  - stable dimensions and no horizontal overflow;
  - icon buttons/tooltips for secondary actions.

## Out Of Scope

- New plugin permission model.
- External plugin loading.
- Changing provider semantics or storage formats.
- Rewriting every plugin implementation in one pass if a focused task already
  owns that plugin's redesign.

## Acceptance

- Each configuration-heavy built-in plugin has a clear split between workflow
  page and settings page.
- Plugin workflow pages no longer look like raw setup forms.
- Users can reach settings from the plugin page and, where appropriate, from
  command palette/plugin manager.
- Existing plugin behavior and saved settings remain compatible.
- Desktop and compact layouts have no overlapping text, clipped controls, or
  horizontal overflow.

## Gates

- Plugin manager/settings host smoke coverage.
- Focused UI smoke for at least Advanced Search, LLM Chat, and Git Sync/GitHub
  Backup settings navigation.
- Renderer component coverage for the shared plugin page/settings pattern.
- `npm run typecheck`
- `git diff --check`

## Result

- Added a shared plugin detail split between Overview and Settings in the
  plugin manager. Overview is now the default plugin surface and keeps settings
  hosts unmounted until the user opens Settings.
- Added a compact Settings affordance and workflow summary to plugin detail
  pages, with desktop and compact layout rules for stable Notion-like spacing.
- Added command-palette navigation for Notion Import settings so users can jump
  directly to the configuration surface.
- Hardened React settings host lifecycle for Git Sync, GitHub Backup, Advanced
  Search, and Notion Import/LLM settings so repeated open/switch flows do not
  emit duplicate `createRoot` errors.
- Extended coded coverage:
  - renderer component coverage for plugin Overview vs Settings rendering;
  - multi-viewport plugin manager UI smoke covering plugin listing, source
    drilldown, Overview/Settings switching, command-palette click and Enter
    activation, and no horizontal overflow.

## Verification

- `node --check scripts/smoke-plugin-manager-ui.mjs`
- `npm run test:renderer-components`
- `npm run smoke:plugin-manager-ui`
- `npm run typecheck`
- `git diff --check`
