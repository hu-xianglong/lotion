# Configure Sidebar Sections By Selected Tags

Status: done

## What Changed

- Added a persisted sidebar tag order setting.
- Replaced fixed Pages/Databases sidebar sections with sections built from the
  selected tag order.
- Kept `page` and `database` as built-in default tags.
- Added a sidebar settings control for selecting, reordering, and resetting
  sidebar sections.
- Synced page property updates back into the sidebar page list so tag changes
  appear without a reload.

## Verification

- `npm run typecheck`
- `git diff --check`
- Manual Electron UI smoke:
  - Opened the sidebar settings panel.
  - Verified Pages and Databases appear as default sidebar tags.
  - Moved Databases above Pages and confirmed the sidebar order changed.
  - Reset the setting and confirmed Pages returned above Databases.

The automated sidebar navigation smoke could not attach because the local
debugging port was already occupied, so this item used a focused manual
Electron smoke for the settings interaction.
