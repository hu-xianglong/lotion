# Release test requires production visual gate

## Status

Done.

## Context

Item 607 added `npm run test:production-visual`, but a release/test snapshot
could still be produced without that gate if `release:test` only ran the older
fast test, UI regression, build, and diff checks. The production visual gate is
now part of release-test requirements so screenshot/geometry artifact quality
is not optional.

## Implemented

- Added `npm run test:production-visual` to `DEFAULT_TEST_RELEASE_GATES`.
- Added release unit coverage asserting the default gate list includes
  production visual in the expected order.
- Updated testing docs so `npm run release:test` documents the production
  visual gate as required.

## Verification

- [x] `node --test --test-name-pattern "release" test/test-release.test.mjs`
- [x] `npm run typecheck`
- [x] `git diff --check`
