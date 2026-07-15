# Cmd-click links in raw markdown mode

Status: done

## Why

The Markdown editor intentionally lets plain clicks edit link text when raw
markdown mode is enabled. The roadmap calls out the missing modifier-click path:
users should still be able to Cmd/Ctrl-click a raw Markdown link to open it,
matching desktop editor expectations without sacrificing editability.

## Scope

- Keep unmodified raw-markdown clicks editable.
- Let Cmd/Ctrl-click in raw markdown mode reuse the existing link target
  resolver and navigation/open-link handling.
- Add a focused smoke assertion to prevent regressions.

## Gates

- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`

## Result

- Raw markdown keeps plain clicks editable.
- Cmd/Ctrl-click now continues through the existing Markdown link resolver and opens the target.
- The markdown preview smoke now dry-runs `shell.openLink` and verifies raw-mode modifier-click opens `https://example.com/project-a`.
