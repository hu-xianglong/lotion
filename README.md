# Lotion

An LLM-first local Notion.

Lotion is a local-first, plain-text-first personal knowledge workspace. It aims
to provide a Notion-like interface while keeping user data portable, readable,
Git-friendly, and LLM-friendly.

The current source of truth for product requirements is:

- [User Requirements](docs/user-requirements.md)
- [Product Design](docs/design.md)
- [Code Design](docs/code-design.md)

## Install on macOS

> **Unsigned preview:** Lotion does not yet have an Apple Developer ID
> certificate or Apple notarization. macOS will warn when you first open a
> build downloaded from GitHub. Only continue if you downloaded Lotion from
> this repository and the Release checksum matches your file.

1. Download the latest `.dmg` from
   [GitHub Releases](https://github.com/hu-xianglong/lotion/releases/latest):
   - Apple Silicon (`M1`, `M2`, `M3`, `M4`, or newer): choose `arm64`.
   - Intel Mac: choose `x64`.
2. Open the `.dmg` and drag `Lotion.app` into `Applications`.
3. Try to open Lotion once, then dismiss the macOS security warning.
4. Open **System Settings → Privacy & Security**, scroll to **Security**, and
   click **Open Anyway** next to Lotion. Confirm with your Mac login password.

The **Open Anyway** button is available for about one hour after the blocked
launch. See [Apple's instructions for opening an app from an unknown
developer](https://support.apple.com/guide/mac-help/mh40616/mac).

If macOS does not show the button, remove the quarantine attribute only from
the Lotion application you installed, then open it:

```sh
xattr -dr com.apple.quarantine /Applications/Lotion.app
open /Applications/Lotion.app
```

Removing quarantine bypasses part of macOS's download protection. Do not run
the command on a copy obtained from another website or an untrusted sender.

To avoid running an unsigned download, build Lotion directly from the public
source using the development steps below.

## Development

```sh
npm install
npm run dev
```

Load the demo workspace used for local testing:

```sh
npm run demo:reset
```

Useful checks:

```sh
npm test
npm run typecheck
npm run build
```

## Storage Model

Workspace CSV, Markdown, and JSON files remain the source of truth. Lotion
builds a disposable, machine-local cache under the app's
`workspace-cache/` directory in Application Support. A small SQLite projection
contains only the page and database summaries needed for the first paint.
Row-page metadata and body paths live in a generation-addressed sidecar with a
lazy offset index, so opening a row page remains fast without loading every row
during startup. Source fingerprints are validated before every cache hit.
These local cache files can be deleted at any time; Lotion rebuilds them from
the workspace source files without writing cached values back into them.

## License

[MIT](LICENSE)
