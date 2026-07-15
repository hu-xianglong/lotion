# Test Release After Passing Gates

Status: done

## Decision

After the configured test gates pass, Lotion can produce a local
non-production test release artifact for testers. Failed gates stop before any
release directory is created.

## Implemented

- Added `scripts/release-test.mjs` and `scripts/lib/test-release.mjs`.
- Added `npm run release:test` for the full gate-and-release workflow.
- Added `npm run release:test:prechecked` for CI or local queue flows that
  already ran the same gates.
- Test releases are written to
  `artifacts/test-releases/lotion-test-<timestamp>-<short-sha>/`.
- Each test release includes:
  - `release-manifest.json` with source revision, dirty state, branch, app
    version, platform, Node/OS metadata, gate results, and UI smoke artifact
    references;
  - `build-outputs.json` with build output file checksums or a clear packaging
    placeholder when no packager/output is available;
  - `ui-artifacts.json` with recent UI smoke harness manifests;
  - `checksums.json` for generated release files;
  - `RELEASE_NOTES.md` and `README.md`.
- Added `test/test-release.test.mjs` and included it in `npm run test:fast`.
- Documented the local test-release commands in `docs/testing.md`.

## Verification

- `node --check scripts/lib/test-release.mjs && node --check scripts/release-test.mjs`
- `node --test test/test-release.test.mjs`
- `tmpdir=$(mktemp -d /tmp/lotion-release-test.XXXXXX) && node scripts/release-test.mjs --prechecked --output-root "$tmpdir"`
- `npm run typecheck`
- `git diff --check`

## Notes

- This is intentionally local-only. It does not publish a GitHub Release, bump
  production version metadata, sign/notarize an app, or delete prior test
  releases.
