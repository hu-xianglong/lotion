# Renderer Component Page Backlinks Regression

Status: done

## Why

The backlinks panel is a high-risk navigation surface: it needs to show source
type, path context, reference context, excerpts, icons, and clickable rows
without falling back to raw ids or ambiguous labels. Existing UI smokes cover
click-through behavior, but the static renderer component harness does not
guard the visible backlink panel markup.

## Scope

- Add renderer component coverage for page backlinks with markdown and property
  references.
- Assert titles, source type labels, paths, context labels, excerpts, icons,
  count, and clickable row affordances.
- Keep this as renderer presentation coverage only; do not change backlink
  lookup, navigation, or persistence behavior.

## Gates

- `node --check scripts/test-renderer-components.mjs` - passed
- `npm run test:renderer-components` - passed
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Exported the `PageBacklinks` presentation component for static renderer
  regression coverage.
- Added renderer assertions for backlink count, source titles, source type
  labels, path context, markdown/property context labels, excerpts, emoji icons,
  and clickable row affordance.
- Backend/service tests are not applicable because this only changes renderer
  presentation testability and static component coverage; backlink lookup and
  navigation behavior were not changed.
