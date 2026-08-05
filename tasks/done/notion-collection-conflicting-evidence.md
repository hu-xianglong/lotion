# Task 711: Notion collection conflicting evidence

Status: done

Verification status: verified

Priority: P0

Source: independent verification follow-up after Task 710

## Problem

The shared Notion collection resolver rejects multiple href database matches
only when no title fallback exists. If a collection has conflicting href
evidence and a unique title, it currently ignores the conflict and resolves by
title, potentially binding an embedded view to the wrong database.

## Goal

Treat contradictory row or href ownership evidence as terminal ambiguity so
lower-confidence title fallback cannot override it.

## Acceptance

- Multiple distinct row database matches remain unresolved.
- Multiple distinct full/short href database matches remain unresolved even
  when a unique title fallback exists.
- A single matching row or href continues to resolve.
- Existing short-ID import and repair regression coverage remains green.

## Required Gates

- focused Notion resolver/import/repair regressions
- `npm run typecheck`
- `npm run test:fast`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Verification

- Reproduced before the fix with `node scripts/test-notion-view-repair.mjs`:
  the conflicting-href regression expected `null` but resolved
  `lotion-db:db_title`, proving unique-title fallback could override
  contradictory higher-confidence evidence.
- Added automated regressions for both ambiguity paths:
  - two hrefs resolving to distinct databases plus a unique-title fallback;
  - two row hashes owned by distinct databases plus a unique-title fallback.
  Both must remain unresolved.
- `node scripts/test-notion-view-repair.mjs` passed, covering the shared
  resolver and embedded-view repair behavior.
- `node scripts/test-notion-import-service.mjs` passed, preserving short-ID,
  import, and linked-collection-view regressions.
- `npm run typecheck` passed.
- `npm run test:fast` passed outside the restricted filesystem sandbox:
  79/79 Node core tests plus Notion converter/import/repair, renderer,
  workspace, fixture, link, hierarchy, and latency gates. The restricted run's
  three `EMFILE: too many open files, watch` failures were reproduced down to
  the isolated customer API test and matched the repository's documented
  macOS recursive-watcher sandbox limitation; the unrestricted required gate
  exercised the same watcher tests successfully.
- `npm run build` passed: TypeScript and Vite completed 2,342 module
  transformations. Vite reported the repository's existing Node 20.18.1
  version and large-chunk warnings, with exit code 0.
- `npm run test:task-docs` passed after moving this task to `tasks/done`.
- `git diff --check` passed.
