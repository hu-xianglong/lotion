# Renderer Component Backup Button Regression

Status: done

## Why

The sidebar backup action is a persistent, user-visible control. Existing UI
smokes exercise broader plugin/Git workflows, but the static renderer component
gate does not assert the basic idle backup button contract.

## Scope

- Add static renderer coverage for `BackupButton` idle rendering.
- Assert the button class, enabled state, and localized idle label.
- Keep this as renderer presentation coverage only; do not change Git backup
  IPC, scheduler, status, or persistence behavior.

## Gates

- `node --check scripts/test-renderer-components.mjs` - passed
- `npm run test:renderer-components` - passed
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Added static renderer coverage for `BackupButton` idle rendering.
- Asserted the backup button class, enabled idle state, localized idle label,
  and absence of the busy label before a backup starts.
- Backend/service tests are not applicable because this only extends renderer
  presentation coverage; Git backup IPC, scheduler, status, and persistence
  behavior were not changed.
