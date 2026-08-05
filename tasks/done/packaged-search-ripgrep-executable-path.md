# Task 719: Packaged search ripgrep executable path

Status: done

Verification status: verified

## Problem

Global search works in the repository build but fails in the installed macOS
application with `spawn ENOTDIR`. The `@vscode/ripgrep` package reports an
executable path inside `app.asar`, while electron-builder correctly places the
native binary under `app.asar.unpacked`. Existing package verification only
checks that an `rg` file exists and therefore misses the runtime failure.

## Acceptance criteria

- Keep the development ripgrep path unchanged.
- Map a packaged `app.asar` ripgrep path to the corresponding
  `app.asar.unpacked` executable path before spawning it.
- Handle POSIX and Windows path separators without rewriting unrelated path
  segments.
- Cover development, packaged POSIX, packaged Windows, and unrelated-path
  cases with automated tests.
- Make packaged-app verification execute the bundled `rg --version`, not only
  check that the binary exists.
- Package and install the repaired macOS application.
- Verify that global search returns the imported
  `2026/8/4 [31.216][1.149] 晨间日记` database row from the active workspace.

## Verification

All automated and installed-application checks passed.

- `npx tsc -p tsconfig.main.json`
- `node --test --test-name-pattern='packaged ripgrep paths resolve outside app.asar' test/package-core.test.mjs`
- `npm run test:fast` (run outside the restricted sandbox because the suite
  exercises native macOS file watchers)
- `npm run package:mac`
- `npm run package:mac:verify` (run outside the restricted sandbox because it
  launches the packaged Electron application)
- Installed the generated application at `/Applications/Lotion.app` and
  invoked `search:query` against the active workspace. Searching for
  `2026/8/4 [31.216][1.149] 晨间日记` returned `row_d273c3a8` as the first hit
  from database `每日习惯` with the expected hierarchy path.
