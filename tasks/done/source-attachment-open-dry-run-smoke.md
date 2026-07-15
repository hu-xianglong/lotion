# Source Attachment Open Dry-run Smoke

## Goal

Upgrade source/attachment UI smoke from render-only checks to real click-path
checks without opening system apps.

## Scope

- Use shell open dry-run mode in the source/attachment smoke.
- Click imported source HTML and source CSV property links.
- Click a markdown document attachment link.
- Assert all three workspace-relative paths were recorded by the shell dry-run
  IPC.

## Gates

- [x] `npm run smoke:source-attachments-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
