# URL Field Open Smoke

## Goal

Add an Electron UI smoke that verifies database URL fields render with an
open action and route clicks through Lotion's shell link-opening API.

## Scope

- Create a temporary workspace with a table database containing a URL field.
- Open the database surface.
- Verify the URL open button normalizes bare domains to `https://...`.
- Verify the normalized URL open button is present and enabled.
- The smoke tries to patch `window.lotion.shell.openLink`; if the contextBridge
  API is immutable in the running Electron app, it does not click and avoids
  opening the system browser. A future dry-run shell IPC can make the click
  assertion side-effect free.

## Gates

- [x] `npm run smoke:url-field-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
