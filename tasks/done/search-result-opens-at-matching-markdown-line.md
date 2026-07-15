# Search result opens at matching markdown line

Status: done

## Why

Search result previews show the matching line, but opening a result lands at the
top or previous editor position. The Navigation/Search backlog calls out
"search result preview and jump-to-hit"; the smallest useful step is to reuse
the editor's markdown anchor restoration so page and row-page markdown hits open
near their match.

## Scope

- Allow navigation actions to carry a markdown line hint.
- Convert search hit line numbers into markdown anchor positions before
  navigation.
- Keep database hits and non-markdown row hits unchanged.

## Gates

- `npm run typecheck`
- `git diff --check`

## Result

- Search result navigation can now carry a 1-based markdown line hint.
- Page and row-page markdown hits open with the editor selection anchored near the matching line.
- CSV/database row hits keep their existing behavior so field matches do not jump to unrelated markdown positions.
