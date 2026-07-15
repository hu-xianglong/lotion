# Image lightbox smoke

## Goal

Cover the page image interaction where double-clicking an inline image opens an
in-page lightbox instead of leaving the page.

## Scope

- Generate an isolated temporary workspace with one page and one image
  attachment.
- Open the page in Electron.
- Verify the Markdown image renders as an image widget.
- Double-click the image and verify `.cm-md-image-lightbox` appears.
- Press Escape and verify the lightbox closes.
- Restore the previous workspace after the smoke.

## Gates

- `npm run smoke:image-lightbox-ui`
- `git diff --check`
