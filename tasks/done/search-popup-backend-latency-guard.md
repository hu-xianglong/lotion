# Search Popup Backend Latency Guard

## Goal

Make `smoke:search-ui` fail when the backend search query used to seed the
popup becomes too slow, instead of only checking render latency after results
arrive.

## Scope

- Add a configurable backend query threshold to `smoke-search-ui`.
- Include the threshold in the JSON summary.
- Fail if any candidate query exceeds the threshold.

## Gates

- [x] `npm run smoke:search-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
