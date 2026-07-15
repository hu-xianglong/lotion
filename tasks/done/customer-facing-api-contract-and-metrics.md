# Customer-Facing API Contract And Metrics

Status: done

Priority: P0 / highest

Decision state: ready

## Why

Customer-facing APIs are currently defined across multiple surfaces:

- Electron renderer API types in `src/preload/lotion-api.ts`.
- Main-process package API in `src/main/customer-api.ts`.
- Actual IPC channels in `src/main/ipc.ts`.

That makes it easy for public API behavior, types, and coverage to drift. We
also do not have uniform per-API performance metrics, which makes page-open,
search, backlinks, plugin, and Git latency harder to diagnose from the product
surface.

## Scope

- Create a single shared customer-facing API contract module.
  - List every public `window.lotion` API group and method in one interface.
  - Include the package/customer API surface exposed by
    `createLotionCustomerApi`.
  - Explicitly classify or document any debug/internal-only method that remains
    exposed.
- Make preload and main customer API types import or re-export from the shared
  contract instead of maintaining parallel hand-written interfaces.
- Add metrics to every customer-facing call path.
  - Cover Electron IPC handlers for workspace, pages, databases, views,
    rowPages, git, attachments, search, entities, icons, covers, plugins,
    favorites, environment, windows, shell, debug, and Notion import APIs.
  - Cover the package/customer API returned by `createLotionCustomerApi`.
  - Capture method id, IPC channel where relevant, start time, duration,
    success/error status, and safe error classification.
  - Use a bounded in-memory buffer plus aggregate summaries so metrics cannot
    grow unbounded.
- Expose a local metrics inspection API, for example list, summary, and clear.
- Keep metrics privacy-safe: do not record user content, payload bodies, query
  text, file contents, API keys, or remote URLs.
- Keep metrics overhead low enough for hot paths like `pages.get`,
  `pages.list`, `entities.backlinks`, and `search.query`.

## Out Of Scope

- External telemetry upload.
- A full performance dashboard UI.
- Changing existing API semantics or breaking plugin/renderer callers.
- Fixing any latency regression discovered by metrics unless it is a small
  prerequisite for safe instrumentation.

## Acceptance

- A single shared contract lists the complete customer-facing API surface.
- Preload types, `window.lotion`, and `createLotionCustomerApi` stay compatible
  with the shared contract.
- Customer-facing IPC handlers are registered through a measured wrapper or an
  equivalent declarative registry, with no unmeasured public handler left
  undocumented.
- Metrics record both successful and failed API calls without storing sensitive
  payload data.
- A local API can return recent metric entries and aggregate summaries.
- Tests cover contract completeness and metrics recording for success and error
  cases.
- Existing customer-facing API compatibility is preserved.

## Gates

- Customer API contract and metrics unit tests: passed via
  `npm run test:customer-api`.
- `npm run typecheck`: passed.
- `npm run build`: passed. Vite emitted the existing Node 20.18.1 engine
  warning, but the build completed successfully.
- `git diff --check`: passed.

## Result

- Added a shared customer-facing API contract for renderer, IPC, and package
  API surfaces.
- Added bounded, privacy-safe metrics collection for public IPC handlers and
  the package customer API, including success/error counts and duration
  summaries.
- Exposed local `metrics.list`, `metrics.summary`, and `metrics.clear` APIs.
- Added contract and metrics tests that assert package API shape consistency,
  renderer-to-IPC mapping coverage, success/error metric recording, bounded
  listing, clearing, and no payload/user-content leakage.

No frontend UI smoke was added because this item exposes an API/diagnostic
surface and does not introduce a visible workflow. The preload contract and IPC
surface are covered by typecheck plus the customer API contract tests.
