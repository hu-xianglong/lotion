# Database Lock And Scoped Settings

Status: done

Verification status: verified

Priority: P1

Depends on: Database settings menu shell; Database property manager

## Goal

Add a database-level lock that prevents structural accidents while allowing
normal row content editing.

## Frontend

- Add Lock database to Database settings with a clear explanation.
- Disable view/property/schema/template mutations while keeping row cell/page
  editing enabled.
- Show a consistent locked indicator and unlock path in all full/embedded views.

## Backend

- Persist `locked` in database metadata.
- Enforce the lock in main-process/customer/plugin mutation APIs, not only UI.
- Return typed locked errors and allow explicit unlock through the metadata API.

## Acceptance

- Direct IPC/customer/plugin calls cannot bypass the lock.
- Row content remains editable; structural menu items explain why disabled.
- Lock state survives reload and applies to embedded views.

## Gates

- Lock enforcement API tests.
- Full/embedded locked-state UI smoke.
- `npm run typecheck`, `npm run build`.

## Delivered

- Added persisted database `locked` metadata, explicit lock/unlock through the metadata API, and a typed `DATABASE_LOCKED` error.
- Enforced the lock in the shared main-process service for database deletion plus view, property, schema, and template mutations, covering IPC, customer, and plugin entry points while preserving row edits and row creation.
- Added locked capability explanations, full/embedded indicators, disabled structural controls, and a consistent unlock path in Database settings.

## Verification

Independently verified on 2026-07-22 against the backend, frontend, acceptance
criteria, public IPC path, persistence behavior, and generated visual evidence.

Defects found and fixed during verification:

- Direct metadata calls could lock system databases even though the UI disables
  that action and exposes no system-database unlock path. The shared service now
  rejects `locked: true` for system databases with a typed invalid-dependency
  error, covering IPC, customer, and renderer-plugin delegates. Explicit
  `locked: false` remains available to recover legacy invalid metadata.
- The original API test sampled only add-field, create-view, save-template, and
  patch-view calls. Coverage now verifies database deletion and tag metadata,
  all field lifecycle operations, template deletion, and create/duplicate/
  reorder/update/patch/delete/default view mutations, plus asserts that failed
  attempts leave schema, tags, templates, and views unchanged.
- The original UI smoke did not reload while locked, did not edit inside the
  embedded view, did not verify row creation or row-page editing, and only
  captured the app's default 1280x788 surface while labeling it 1440x1000.
  The smoke now executes at real desktop and compact viewports and proves lock
  persistence, full/embedded disabled controls, visible locked reasons, cell,
  row-creation and row-page editing, direct structural rejection, and unlock
  from the embedded view.
- Added a lock-specific artifact contract and registered the smoke in the UI
  regression suite so incomplete interaction flags, missing viewport evidence,
  fake viewport metadata, or undersized images fail automatically.

Verification results:

- `node --test test/package-core.test.mjs test/database-lock-artifacts.test.mjs`
  (44/44 passed; 43 core plus one artifact-contract test)
- `LOTION_UI_SUITE_FILTER=database-lock npm run smoke:ui` (passed at 1440x1000
  desktop and 1040x820 compact; all lock, persistence, editable-row, embedded,
  and unlock assertions passed; zero console errors; two validated snapshots)
- `npm run typecheck`, `npm run test:fixtures`, `npm run test:latency`, and
  `npm run build` (all passed; build retains the existing chunk-size warning)
- `git diff --check` (passed)

Evidence:

- Database lock UI artifact:
  `artifacts/ui-smoke/database-lock-ui-2026-07-22T19-09-27-733Z/`
- Filtered suite artifact:
  `artifacts/ui-smoke/ui-suite-2026-07-22T19-09-20-326Z/`
- Manually inspected both locked embedded-view snapshots. The lock indicator,
  controls, table content, and compact layout remain visible and usable without
  viewport clipping.
