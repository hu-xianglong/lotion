# Generate Release App Snapshot Artifact

Status: done

Queue item: 571

Priority: P0 / highest

Decision state: ready

## Why

The release workflow now has code and tests for app snapshot support, but the
current `artifacts/test-releases/` directory still contains only old release
metadata folders and no `.app` artifact. The user-facing release snapshot is
not complete until testers can open an actual `.app` from the latest test
release directory.

## Scope

- Run the updated release workflow and produce a fresh test release under
  `artifacts/test-releases/`.
- Ensure the generated release directory contains a directly openable macOS
  `.app` artifact.
- Verify release metadata points to that app:
  - `release-manifest.json` has non-null `build.packagedApp`.
  - `build-outputs.json` records the app snapshot paths.
  - `checksums.json` includes generated snapshot/app files where practical.
- Surface the final `.app` path clearly for manual testing.

## Out Of Scope

- Further packaging implementation changes unless the workflow fails to create
  the required `.app`.
- Production signing, notarization, installers, or GitHub Release publishing.

## Acceptance

- A new latest directory exists under `artifacts/test-releases/`.
- That directory contains a `.app`.
- The `.app` launches the packaged release snapshot, not the live working tree.
- The manifest does not report `packagedApp: null`.
- The final app path is documented for testers.

## Gates

- `npm run release:test` or `npm run release:test:prechecked` after equivalent
  gates have passed.
- Inspect latest `release-manifest.json`.
- Confirm `.app` exists in the generated release directory.
- `git diff --check`

## Verification

- [x] `npm run build`
- [x] `npm run release:test:prechecked`
- [x] Inspect latest `release-manifest.json`
- [x] Inspect latest `build-outputs.json`
- [x] Confirm `.app` bundle and launcher are executable
- [x] Confirm `checksums.json` includes app/launcher entries
- [x] `git diff --check`

## Result

- Release directory: `artifacts/test-releases/lotion-test-2026-06-17T05-44-24-205Z-8bb0efb`
- App artifact: `artifacts/test-releases/lotion-test-2026-06-17T05-44-24-205Z-8bb0efb/Lotion Test Release.app`
- Manifest: `build.status` is `app-snapshot-packaged`; `build.packagedApp.path` is `Lotion Test Release.app`.
- Launcher chain: the `.app` executable invokes `open-lotion-test-release.sh`, which changes into `app-snapshot` and launches Electron with isolated `user-data`.
- Checksums: 85 entries total; app bundle launcher files and `open-lotion-test-release.sh` are included.
- Note: the manifest records a dirty worktree because this WIP task bookkeeping and pre-existing untracked local files were present during release generation. The generated `.app` snapshot itself is based on the freshly built `dist` and `dist-electron` outputs.
