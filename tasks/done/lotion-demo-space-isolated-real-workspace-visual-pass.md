# Lotion Demo Space Isolated Real-Workspace Visual Pass

Status: done

Verification status: verified

## Goal

Run a meaningful visual and stress verification against the named real
`Lotion Demo Space` without allowing Electron or test cleanup to mutate the
original workspace.

## Acceptance Criteria

- Fingerprint the complete real workspace by relative path and file bytes.
- Clone only regular files/directories into a temporary workspace, preferring
  copy-on-write file cloning and rejecting symlinks.
- Prove the clone initially matches the source and prove the source fingerprint
  is unchanged after Electron exits.
- Exercise the real home page and 500K-row database on desktop and compact,
  checking latency, table virtualization/layout, overflow, console errors, and
  screenshots.
- Write a machine-readable artifact contract with redacted source identity,
  clone safety evidence, viewport results, and reproduction guidance.
- Cover clone isolation, clone mutation, source mutation detection, invalid
  workspace, and symlink rejection with focused tests.

## Required Verification

- clone safety unit tests
- real Demo Space Electron smoke
- artifact contract positive/negative tests
- `npm run typecheck`
- `npm run test:task-docs`
- `git diff --check`

## Delivered

- Added a copy-on-write real-workspace clone helper with complete SHA-256
  fingerprints, regular-file/directory enforcement, symlink rejection, clone
  byte-equivalence checks, post-run source checks, and narrow temp cleanup.
- Added a real Electron smoke for the actual Lotion Demo Space Home page and
  500K-row database across desktop and compact viewports.
- Added bounded virtualization, row-count, latency, horizontal-overflow,
  active-clone, screenshot, and console-error gates.
- Persisted redacted source/clone fingerprints, isolation mode, source
  before/after evidence, per-viewport stress metrics, screenshot paths, and the
  reproduce command in `harness-result.json`.
- Restored compatibility with legacy `databases/db_<id>/` workspace folders,
  while continuing to prefer the current `databases/user/` layout.
- Migrated legacy page front matter into page metadata and removed it from the
  visible Markdown body.

## Debugging

- The first real run failed because current database path resolution ignored
  the Demo workspace's legacy database folders. A focused path regression now
  covers the compatible fallback.
- The first Home screenshot exposed YAML front matter rendered as page text.
  The legacy parser now preserves its id/title/timestamps/cover/cover offset
  as metadata and writes body-only Markdown into the clone.
- Initial smoke title waits assumed one heading structure; the real page and
  database components use input and heading titles respectively. The smoke now
  waits on both supported structures.
- Reloading the clone per viewport raced startup restoration of the 500K
  database against Home navigation. The runner now opens the clone once and
  changes viewports/entities in one isolated session.
- The harness initially discarded clone-safety and per-viewport stress data
  while summarizing the result. A redacted whitelist plus regression test now
  preserves the evidence without source or temp paths.

## Verification

Verified on 2026-07-22.

- Final Electron artifact:
  `artifacts/ui-smoke/real-demo-workspace-ui-2026-07-23T02-02-17-008Z/harness-result.json`.
- Source, clone, and post-run source all matched SHA-256
  `54ff5146521a5ee987c61f8cb854175905bd5f46c225151037c96356a6da00ec`
  (183 files, 36 directories, 228,505,681 bytes); source path redaction passed.
- Desktop: Home 247.5 ms, 500K database 35,216.2 ms, 20 rendered rows,
  2 virtual spacers, and 0 px document overflow.
- Compact: Home 383.6 ms, cached 500K navigation 3,564.1 ms, 19 rendered
  rows, 2 virtual spacers, and 0 px document overflow.
- Four screenshots passed artifact checks and visual review; Home front matter
  is absent, cover metadata renders, database controls remain visible, and the
  stress table retains its own horizontal scroll surface.
- Harness recorded both required viewports and zero console/page errors.
- Clone/artifact unit tests passed 6/6; redacted manifest regression passed;
  legacy storage/page migration core regression passed.
- All 79 UI harness artifact tests passed, including the redacted real-workspace
  evidence serialization boundary.
- `npm run typecheck`, `npm run test:task-docs`, and `git diff --check` passed.
