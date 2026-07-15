# Test Release App Snapshot

Status: done

Priority: P0 / highest

Decision state: ready

## Why

`npm run release:test` currently creates a local release artifact directory with
manifests, build output checksums, UI artifacts, and notes, but it does not
produce a directly openable app. That makes the release feel like metadata
rather than something a tester can launch.

There is a separate manual-test snapshot script that can create a local macOS
`.app` launcher, but it is not part of the test-release workflow and is tied to
the manual-test workspace path. The test release should produce an inspectable,
openable app snapshot as a first-class release artifact.

## Scope

- Update the test-release workflow to generate an app snapshot after gates pass.
  - `npm run release:test` should include an openable app artifact.
  - `npm run release:test:prechecked` should also be able to produce the same
    app artifact when gates were already run.
- Package the built renderer, main, preload, and minimal package metadata into
  the release directory.
- On macOS, create a `.app` launcher inside the release directory.
  - It should open the packaged snapshot build, not the live working tree.
  - It should use isolated user-data by default unless a manual-test override
    is explicitly requested.
  - It should not hard-code the user's manual-test workspace as the generic
    release behavior.
- Record the app artifact in release metadata.
  - `release-manifest.json` should include the relative app path.
  - `build-outputs.json` should set `packagedApp` when the app is created.
  - `checksums.json` should cover app snapshot files where practical.
- Keep the existing manual-test snapshot use case available.
  - Either reuse shared packaging helpers from `release:test`, or keep the
    manual-test script as a thin wrapper around the shared packaging path.

## Out Of Scope

- Production signing, notarization, auto-update, or GitHub Release publishing.
- Cross-platform installer generation.
- Version bumping or production release channels.
- Changing app runtime behavior unrelated to launching the snapshot build.

## Acceptance

- Running `npm run release:test` after passing gates creates a release directory
  that includes a directly openable app snapshot.
- Running `npm run release:test:prechecked` can create the same app snapshot for
  already-verified local builds.
- The app snapshot launches the release build from inside the release artifact,
  not the current source tree.
- Release manifests clearly point to the app artifact.
- Existing release metadata behavior remains compatible.
- The manual-test snapshot path still works or is replaced by an equivalent
  documented command.

## Gates

- Test-release unit tests for app artifact manifest fields.
- Dry-run or temp-dir release test that verifies the app bundle/launcher
  structure without depending on the user's manual-test workspace.
- `npm run typecheck`
- `npm run build`
- `git diff --check`

## Result

- `release:test` now packages copied `dist/`, `dist-electron/`, minimal
  package metadata, isolated `user-data/`, a shell launcher, and a macOS
  `.app` launcher into the release directory when build outputs and Electron
  are available.
- `release-manifest.json` and `build-outputs.json` record the relative app
  artifact path, launcher, snapshot path, and user-data path.
- `checksums.json` includes the generated snapshot/app launcher files.
- The package helper searches upward for the installed Electron runtime so the
  monorepo install layout works without hard-coded manual-test paths.

## Verification

- `node --check scripts/lib/test-release.mjs`
- `node --test test/test-release.test.mjs`
- `npm run typecheck`
- `npm run build`
- `node scripts/release-test.mjs --prechecked --output-root /tmp/lotion-release-dryrun-*`
- `npm run release:test:prechecked -- --output-root /tmp/lotion-release-npm-dryrun-*`
- `git diff --check`
