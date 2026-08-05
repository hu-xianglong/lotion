# Database View Transactional Persistence

Status: done

Verification status: verified

Priority: P0

## Goal

Make saved-view changes durable in the same order the user sees them, and
restore the last active view without changing the database default.

## Delivered

- Added atomic patch-based view persistence with monotonic revisions,
  timestamps, typed conflict results, and legacy view compatibility.
- Added a shared optimistic renderer mutation queue that serializes changes,
  retries conflicts, preserves queued patches, and rolls back failed writes.
- Debounced typed filter values without losing a pending value when the
  popover closes.
- Persisted the last active standalone view per database while keeping
  embedded and explicitly requested views scoped correctly.
- Added visible saving, saved, and error states.
- Kept the full-view update API for backward compatibility.

## Verification

- Database patch/revision/concurrency service regression.
- Customer and renderer API contract coverage.
- Renderer component regression suite.
- Database persistence Electron smoke with reload and forced write failure.
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- `git diff --check`

### Verified evidence — 2026-07-22

- `node --test --test-name-pattern='database view (patches|updates)' test/package-core.test.mjs`
  passed 2/2 focused tests. This covered revision-0 compatibility, monotonic
  increments, typed stale conflicts, concurrent-write rejection, durable
  reloads, and customized generated-view persistence.
- `npm run test:renderer-components` passed. It covers last-active standalone
  restoration, explicit/embedded view precedence, and minimal mutable patches
  that exclude revision metadata.
- `npm run smoke:database-created-views-ui` passed at desktop 1440x1000 and
  compact 1040x820 without console or page errors. The smoke proved rapid
  filter editing followed immediately by column resize preserved both changes;
  a simulated second surface advanced the revision and the stale UI surface
  retried and converged without losing either patch; reload restored the last
  active view; and an injected write failure displayed an alert and rolled the
  optimistic change back without changing the disk revision. Evidence is in
  `artifacts/ui-smoke/database-created-views-ui-2026-07-22T16-24-30-291Z/`.
- `npm run typecheck`, `npm run test:fixtures`, `npm run test:latency`, and
  `npm run build` all passed. Fixture validation covered 11 pages, 13 user
  databases, and 2 system databases. The latency gate covered 20k-row queries
  plus 50k-row CSV reads (42.573 ms median, 62.282 ms max). Vite built 2,322
  modules; its existing large-chunk advisory remained non-fatal.

Debugging found and fixed three defects before verification: generated
Created-date views overwrote persisted customizations on every read, the column
resize handler triggered a cache update from inside a React state updater, and
fire-and-forget toolbar mutations leaked rejected promises as renderer page
errors.
