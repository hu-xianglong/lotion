# Task 724: Restore GitHub Release packaging

Status: done

Verification status: verified

Priority: P0

Source: user report that GitHub Releases do not contain the latest application

## Problem

Every recent `Build Lotion downloads` workflow failed during `npm ci` because
`electron-builder` was declared in `package.json` but absent from the committed
application lockfile. The package command also resolved electron-builder from a
monorepo parent path that does not exist in GitHub's standalone checkout.

## Goal

Restore deterministic standalone installation and packaging, then publish a
verified version tag so GitHub Releases contains the current application.

## Acceptance

- `package.json` and `package-lock.json` lock the same electron-builder version.
- Production packaging resolves electron-builder from this repository.
- A regression test rejects an omitted lock entry or parent-repository binary path.
- A clean isolated `npm ci` succeeds with the workflow Node version.
- The local macOS package is built and passes packaged-app startup verification.
- Both GitHub-hosted architectures complete before version tag publication.

## Required Gates

- production release configuration regression
- isolated `npm ci`
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- local macOS package and packaged-app verification
- GitHub-hosted arm64 and x64 package verification
- `npm run test:task-docs`
- `git diff --check`

## Verification

- Isolated install with Node 24 and npm 10 completed with 498 packages and a
  project-local `node_modules/.bin/electron-builder` executable.
- `node --test test/production-release-config.test.mjs` passed 4/4 tests.
- `npm run typecheck`, `npm run test:fixtures`, `npm run test:latency`, and
  `npm run build` passed.
- The local arm64 package command generated `Lotion-0.1.0-macOS-arm64.zip` and
  `.dmg`; packaged startup verification passed with one native module present.
- The full pre-commit package coverage gate passed outside the file-watcher
  sandbox: 80/80 fast tests, 84.9% package runtime coverage, and 84.1% built-in
  plugin runtime coverage.
- GitHub Actions run `31217646731` verified the exact source commit on hosted
  runners: arm64 completed in 2m23s and x64 completed in 3m41s. Both jobs passed
  clean install, package, packaged-app startup, checksums, and artifact upload.
