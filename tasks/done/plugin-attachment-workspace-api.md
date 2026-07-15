# Plugin Attachment Workspace API

Status: done

## Why

Renderer plugins exposed `ctx.workspace.listAttachments/getAttachment/addAttachment`,
but those methods still threw TODO errors. That blocked plugins from working
with workspace files through the sanctioned API surface and pushed them toward
direct file access.

## What Changed

- Added attachment list/read/write methods to `AttachmentService`.
- Exposed those methods through the customer API, Electron IPC, preload API,
  and renderer plugin host.
- Kept writes content-addressed under the existing
  `attachments/<category>/...` layout.
- Added customer API coverage for byte-based add/list/get plus existing
  path-based import.

## Gates

- `npm run test:customer-api`
- `npm run typecheck`
- `git diff --check`
