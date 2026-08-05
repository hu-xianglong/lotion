# Task 713: Local-authoritative public main restoration

Status: done

Verification status: verified

Priority: P0

Source: user-directed public-main recovery after history alignment changed the working local application

## Problem

The previous public-main alignment merged two histories file by file. That made
the public branch look aligned while retaining remote implementations in shared
application files, including a broken Notion import workspace modal. The user
requires the known-working local application to be authoritative, without
publishing private launch assets.

## Goal

Restore shared application, test, and documentation files from local commit
`5acfd1d904f49aa0394ae727cf847dcc9b3306d3`, retain only public-repository
infrastructure that does not replace local application behavior, and publish the
result as one new commit on public `main`.

## Acceptance

- Every path shared with the local snapshot uses the local version unless it is
  an explicitly documented follow-up fix or public release integration.
- Public-only website, branding, packaging, and GitHub workflow files remain.
- Release workflow commands remain executable after restoring local
  `package.json` behavior.
- Private launch screenshots, agreements, and resume files are not tracked.
- Notion import opened from the workspace selector uses the same opaque,
  bounded modal contract as the plugin command path.
- Workspace import supports close-button, Escape, backdrop, and inside-click
  behavior across desktop and compact screenshot viewports.
- The strict Notion import visual baseline passes with zero differing pixels.

## Required Gates

- local snapshot path comparison
- tracked-file privacy and credential scan
- renderer component regression
- Notion import Electron smoke with strict screenshot baselines
- `npm run test:fast`
- `npm run typecheck`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Verification

- Compared the resulting tree with local commit `5acfd1d904f49aa0394ae727cf847dcc9b3306d3`.
  Common-path differences are limited to the Task 713 Notion modal regression,
  its tests and baselines, release-script compatibility in `package.json`, task
  tracking, and deliberately excluded `social-assets/lotion-launch/*` files.
- `git ls-files social-assets` returned no tracked files.
- Tracked-file scans found no private launch document paths, personal absolute
  paths or email addresses, private-key headers, GitHub tokens, AWS access-key
  IDs, or OpenAI-style secret keys. Remaining `/Users/test`, `/Users/me`, and
  `/Users/...` strings are fixtures, placeholders, or documentation patterns.
- `npm run test:renderer-components --workspaces=false` passed.
- `npm run smoke:notion-import-ui --workspaces=false` passed for desktop and
  compact viewports. Both command-modal baselines matched at zero differing
  pixels; the workspace-selector entry was opaque and complete, its close icon
  measured `17x17`, and all dismissal checks passed.
- `npm run test:fast --workspaces=false` passed, including all 79 unrestricted
  Node tests and the Notion import, formula, slash command, renderer, hierarchy,
  workspace, fixture, and latency suites.
- `npm run typecheck --workspaces=false` passed.
- `npm run build --workspaces=false` passed.
- `npm run test:task-docs --workspaces=false` passed before final task move; run
  again after this document and queue update.
- `git diff --check` passed before final task move; run again before commit.
