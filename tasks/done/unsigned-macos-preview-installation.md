# Task 725: Unsigned macOS preview installation

Status: done

Verification status: verified

Priority: P0

Source: user request to document installation for the unsigned GitHub download

## Problem

The current GitHub macOS downloads use an ad-hoc signature because the project
does not yet have a paid Apple Developer ID certificate. macOS quarantines
browser downloads, so users can mistake Gatekeeper's warning for a broken app.

## Goal

Document an accurate installation path for the current unsigned preview without
implying that it has passed Apple notarization.

## Acceptance

- README links directly to the latest GitHub Release.
- README explains how to choose Apple Silicon or Intel downloads.
- README documents Apple's Privacy & Security `Open Anyway` flow first.
- README includes a terminal fallback scoped to the installed Lotion app.
- README includes a clear unsigned-build security warning and source-build option.
- Backlink reads without live subscribers do not leak recursive file watchers
  into later tests or API consumers.

## Required Gates

- focused backlink watcher lifecycle and external-edit regression
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`
- `npm run test:coverage`

## Verification

- `npm run test:task-docs` passed all 3 validator tests and validated 725 queue items.
- `git diff --check` passed.
- The coverage gate reproduced `EMFILE: too many open files, watch`; investigation
  found that backlink reads armed recursive watchers without live update
  subscribers. Watchers are now subscriber-owned and close after the final
  unsubscribe. macOS recursive watches use one native FSEvents stream, with
  canonical `/private/var` paths normalized back to `fs.watch`-compatible
  relative paths.
- The focused real external-edit test passed outside the filesystem sandbox,
  including unlink, relink, incremental refresh, and corrupt-cache recovery.
- `npm run typecheck`, `npm run test:fixtures`, `npm run test:latency`, and
  `npm run build` passed. The build reports the repository's existing Node
  20.19+ recommendation while completing successfully on Node 20.18.1.
- `npm run test:coverage` passed, including all 80 core package tests. Runtime
  coverage was 84.8% for the package and 84.1% for built-in plugins.
- The README points to the latest Release, distinguishes arm64 and x64, leads
  with Apple's Privacy & Security override, and scopes the terminal fallback to
  `/Applications/Lotion.app`.
