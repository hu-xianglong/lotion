# Page Path Slash Title Smoke

## Goal

Add a UI regression smoke for pages whose title contains `/`, ensuring the page
path/breadcrumb uses the stored path array rather than splitting the title into
fake hierarchy segments.

## Scope

- Create a temporary workspace with a page titled `2024/04/24 尤宁城 给北`.
- Store its path as `["书写", "<full title>"]`.
- Open the page and assert the visible path has exactly two segments.
- Add the focused smoke to `smoke:ui` and testing docs.

## Gates

- [x] `npm run smoke:page-path-slash-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
