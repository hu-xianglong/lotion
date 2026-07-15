# Include Settings Center In UI Regression Lane

Status: done

Priority: P0

Decision state: accepted

## Why

The unified Settings Center is now a first-class user-facing surface, but it
should not rely only on its standalone smoke. It needs to participate in the
shared UI regression lane with artifact contract checks so future visual,
layout, deep-link, and plugin-settings regressions are caught consistently.

## Scope

- Include the Settings Center smoke in the shared UI suite and the
  `test:ui-regression` lane.
- Add a Settings Center artifact contract that verifies desktop and compact
  snapshots, category coverage, search jump, Search & AI deep-link, plugin
  setting sections, and snapshot files.
- Add unit coverage for the artifact contract.

## Out Of Scope

- New Settings Center product features.
- Changing plugin settings behavior beyond test metadata needed for the
  contract.

## Gates

- `node --test test/ui-harness-artifacts.test.mjs`
- `npm run typecheck`
- `LOTION_UI_SUITE_FILTER=settings-center npm run smoke:ui`
- `git diff --check`

## Result

- Added the Settings Center smoke to the shared UI suite and the
  `test:ui-regression` lane.
- Added a Settings Center artifact contract for desktop and compact screenshots,
  category coverage, Git search jump evidence, Search & AI deep-link plugin
  hosts, Import settings, and Plugins settings.
- Fixed the Settings Center smoke snapshot naming so desktop and compact images
  do not overwrite each other.

## Verification

- `node --check scripts/lib/settings-center-artifacts.mjs`
- `node --check scripts/smoke-settings-center-ui.mjs`
- `node --check scripts/smoke-ui-suite.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `npm run typecheck`
- `LOTION_UI_SUITE_FILTER=settings-center npm run smoke:ui`
- `git diff --check`
