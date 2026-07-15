# Search Jump-to-Line UI Smoke

Status: done

## Why

Search result navigation now passes markdown line hints into the page editor, but
the focused gate only covered types. A renderer smoke should click an actual
search result whose match is deep in the markdown body and assert CodeMirror
scrolls to the matching line.

## Scope

- Add a deterministic deep-line page to the search UI smoke fixture.
- Click that search result through the global search popup.
- Assert the matching CodeMirror line is visible after navigation.

## Gates

- `npm run smoke:search-ui -- --visible-hits 5`
- `git diff --check`

## Result

- `smoke:search-ui` now creates a deep search target and clicks it through the
  global search popup.
- The smoke asserts the matching CodeMirror line is rendered after navigation,
  so search jump-to-hit behavior is covered in the actual UI.
