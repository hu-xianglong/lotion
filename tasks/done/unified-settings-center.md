# Unified Settings Center

Status: done

Decision state: ready

## Why

Settings should feel like one product surface instead of scattered plugin pages
and one-off configuration panels. The target direction is closer to Notion and
Obsidian: one predictable settings center with sections, searchable settings,
clear plugin/app boundaries, and consistent controls.

This also gives Search & AI, Advanced Search indexing, LLM provider settings,
keyboard shortcuts, Git Sync, and plugin configuration a shared home.

## Scope

- Create a unified `Settings` center.
  - Use a Notion/Obsidian-like layout: left category sidebar, right detail
    pane, dense but readable settings rows.
  - Support top-level categories such as General, Appearance, Search & AI,
    Shortcuts, Plugins, Git Sync / Backup, Import, and Advanced / Developer.
  - Keep settings reachable from sidebar, command palette, plugin pages, and
    related workflow pages.
- Move configuration-heavy plugin settings into the unified settings center.
  - Advanced Search provider/model/vector-store/rebuild settings.
  - LLM Chat provider/API/base URL/model/history/permission settings.
  - Git Sync/GitHub Backup cadence/remote/squash/SSH settings.
  - Notion Import durable preferences where relevant.
- Keep workflow pages focused on daily actions and status.
  - Plugin/workflow pages should link to their settings section instead of
    embedding full configuration forms.
  - Status and immediate actions can remain inline when they are part of the
    primary workflow.
- Add a settings search affordance.
  - Search setting names, descriptions, and plugin-owned setting sections.
  - Results jump to the correct settings section and row.
- Establish shared settings UI primitives.
  - Toggles, selects, text inputs, segmented controls, destructive reset
    buttons, status rows, and inline validation states.
  - Stable dimensions, no nested cards, no horizontal overflow.
- Preserve existing saved settings and storage formats unless a narrow
  migration is required.

## Out Of Scope

- External plugin marketplace or third-party plugin loading.
- New permission model beyond displaying existing plugin permission summaries.
- Reworking every plugin workflow page in one pass if a focused task already
  owns that plugin's product redesign.
- Changing backend semantics for Git Sync, Search, or LLM providers.

## Acceptance

- There is one first-class `Settings` center for app and plugin configuration.
- Configuration-heavy surfaces link into the correct settings section.
- Search & AI, Shortcuts, Plugins, and Git Sync settings have distinct,
  discoverable sections.
- Settings search can find and navigate to app-owned and plugin-owned settings.
- Daily workflow pages no longer look like raw settings forms.
- Desktop and compact layouts have no overlapping text, clipped controls, or
  horizontal overflow.
- Existing settings remain compatible after the move.

## Gates

- Settings center renderer component coverage:
  `npm run test:renderer-components`
- Settings navigation/search focused UI smoke:
  `npm run smoke:settings-center-ui`
- Search & AI settings focused UI smoke:
  `npm run smoke:search-ai-ui`
- Plugin settings deep-link smoke:
  `npm run smoke:plugin-manager-ui`
- Git Sync/GitHub Backup settings smoke:
  covered by `npm run smoke:settings-center-ui` and `npm run smoke:plugin-manager-ui`
- Command palette regression:
  `npm run smoke:search-title-ui`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

## Result

- Added a first-class Settings management surface with searchable categories
  for General, Appearance, Search & AI, Shortcuts, Plugins, Git Sync / Backup,
  Import, and Advanced / Developer.
- Added sidebar and command-palette entry points for the unified center.
- Routed Search & AI settings actions into the unified Search & AI settings
  section instead of a scattered plugin page.
- Mounted plugin-owned settings tabs inside the relevant settings sections
  while keeping existing plugin detail pages working.
- Added a multi-viewport `smoke:settings-center-ui` shared-harness smoke with
  layout, search, plugin settings, Search & AI, Git, Import, and snapshot
  assertions.
