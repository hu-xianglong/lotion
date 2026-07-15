# Database Table Body Boundaries

Status: done

## Why

`DatabaseTable` no longer owns page headers, embedded headers, view tabs, or
database properties, but it still combines query state, table body rendering,
virtualization, summaries, plugin view dispatch, and cell editing. Further
splitting should make database editing performance work easier without changing
behavior.

## Scope

- Extract table body rendering from `DatabaseTable`.
- Keep row virtualization behavior unchanged.
- Keep cell-local draft / debounce commit behavior unchanged.
- Extract table footer and column summaries if the boundary is clean.
- Avoid redesigning the table UI.

## Acceptance

- `DatabaseTable` keeps orchestration state but delegates body/footer rendering.
- Cell edit behavior is unchanged.
- Embedded table scroll and sticky headers still work.
- `npm run typecheck` passes.
- `npm run test:fixtures` passes.
- `npm run test:latency` passes.

## Changes

- Added `DatabaseTableGrid` as the table rendering boundary for:
  - embedded sticky header shell;
  - scroll container;
  - virtual spacer rows;
  - visible table rows;
  - add-row row;
  - row action slot.
- Kept query state, virtualization calculations, cell draft/debounce behavior,
  column drag/resize, and summary calculations in `DatabaseTable`.
- Left column summaries in `DatabaseTable` for now because summary selection and
  computation still share local helpers; this is a better follow-up than a
  broad mechanical move.

## Verification

- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- `git diff --check`
