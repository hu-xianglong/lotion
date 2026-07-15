# Attachment Media Preview Smoke

## Goal

Cover local PDF, video, and audio attachment previews in the UI smoke suite so
attachment rendering does not regress back to plain links.

## Scope

- Extend the source attachment smoke fixture with PDF, video, and audio
  attachment links.
- Assert the renderer emits the expected iframe/video/audio preview widgets
  with workspace-relative `lotion-file` URLs.
- Refresh the Notion import compatibility checklist for media attachment
  preview coverage.

## Gates

- [x] `npm run smoke:source-attachments-ui`
- [x] `git diff --check`
