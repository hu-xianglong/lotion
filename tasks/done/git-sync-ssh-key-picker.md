# Git Sync SSH Key Picker

Status: done

## Why

SSH key paths are machine-local and error-prone to type manually. The Git Sync
settings page should let users choose a local key file.

## Scope

- Add a main-process file picker for SSH private key paths.
- Expose it through preload under `window.lotion.git`.
- Add a compact `Choose` button next to the SSH key path input.
- Keep the chosen path in local settings only after the user saves or applies.

## Gates

- `npm run typecheck`
- `npm run build`
- `git diff --check`
- UI smoke verifies the picker button renders without opening the dialog.
