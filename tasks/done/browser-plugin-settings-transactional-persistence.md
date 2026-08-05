# Browser Plugin Settings Transactional Persistence

Status: done

Verification status: verified

## Goal

Debug and cover the zero-hit browser plugin settings store used by every
built-in renderer plugin, ensuring its synchronous localStorage persistence and
in-memory reads cannot diverge.

## Problem

`BrowserPluginSettings.set` and `.delete` mutate the cache before calling
`localStorage.setItem`. A quota/security failure or JSON serialization error
rejects the returned promise but leaves subsequent `get`/`all` calls reporting
data that was never persisted. JSON-lossy values such as `undefined` also
produce a cache shape different from the value restored after reload.

## Acceptance Criteria

- Commit the cache only after serialization and localStorage write succeed.
- Keep the cache byte-semantically aligned with the JSON that was persisted.
- Preserve the prior cache after failed set/delete/serialization.
- Retain plugin key isolation, default values, defensive `all()` snapshots,
  malformed-storage recovery, successful set/delete, and reload behavior.
- Exercise the real renderer source through the renderer component coverage
  bundle and raise the verified coverage baseline without regressing any metric.
- Run focused tests, renderer coverage, relevant settings/plugin UI, production
  visual, typecheck, build, task documentation, and diff checks.
- Record exact evidence and move to done/verified.

## Debugging

- `set` and `delete` assigned `this.cache` before `localStorage.setItem`.
  Simulated quota/security failures therefore rejected the promise but left
  `get` and `all` reporting values absent from persistent storage.
- Merely moving the assignment after `setItem` was insufficient:
  `JSON.stringify` drops `undefined` and function values and normalizes other
  JSON values. Keeping the original candidate object would still diverge until
  reload. `save` now returns the parsed serialized payload, and only that exact
  persisted representation is committed to the cache.
- A setting literally named `toJSON` with a function value is special:
  `JSON.stringify` invokes it on the whole settings object and can replace or
  suppress the complete payload. This case now rejects before touching
  storage or cache.
- Cyclic/BigInt-style serialization errors and localStorage write failures are
  allowed to reject, but the previous cache and stored JSON remain unchanged.

## Verification

Verified on 2026-07-23.

- The real `BrowserPluginSettings` source is exercised through the renderer
  component bundle. Its contract covers persisted load/defaults, defensive
  `all`, successful set/reload/delete, `undefined` normalization, malformed and
  array payload recovery, plugin-key isolation, simulated failed set/delete,
  cyclic serialization, functional `toJSON`, and rollback.
- `npm run test:renderer-components` passed. Direct source coverage rose from
  0% to 55/57 lines (96.49%), 8/8 functions (100%), and 20/21 branches
  (95.23%).
- `npm run test:renderer-coverage` passed with the exact 67-file inventory and
  64 covered files. The new verified baseline is 15,378/24,416
  lines/statements (62.98%), 286/1,134 functions (25.22%), and 1,188/1,861
  branches (63.84%), improving every metric from queue item 666.
- `npm run smoke:settings-center-ui` and
  `npm run smoke:plugin-manager-ui` passed desktop and compact. All Settings
  Center and Plugin Manager committed baselines had zero differing pixels;
  seven plugins, fourteen providers, settings hosts, plugin lifecycle, and
  command/deep-link flows remained intact. Artifacts:
  `artifacts/ui-smoke/settings-center-ui-2026-07-23T21-25-43-569Z/` and
  `artifacts/ui-smoke/plugin-manager-ui-2026-07-23T21-25-43-568Z/`.
- `npm run test:production-visual` passed all 16 suites, 79 screenshots, and 48
  strict zero-diff baselines. The linked renderer trend has zero delta against
  this task's baseline:
  `artifacts/ui-smoke/ui-suite-2026-07-23T21-26-38-901Z/production-visual-gate/production-visual-gate.json`.
- Focused coverage/nightly/release tests, `npm run typecheck`,
  `npm run build`, `npm run test:task-docs`, and `git diff --check` passed.
  Vite emitted only its existing large-chunk advisory.

## Baseline Successor

Queue item 668 removed an unreachable legacy Markdown renderer. The current
verified inventory is 66 files with 64 covered, at 63.21% lines/statements,
25.24% functions, and 63.87% branches.
