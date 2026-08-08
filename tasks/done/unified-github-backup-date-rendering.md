# Unified GitHub Backup Date Rendering

Status: done

Verification status: verified

## Goal

Make GitHub Backup timestamps follow Lotion's global date and time format and
render deterministically across local and CI environments.

## Problem

The plugin used the host operating system's `toLocaleString()` directly.
Timezone and locale differences changed both the date order and wall-clock
time in the production visual gate.

## Resolution

- Read Lotion's stored global date and time defaults for the plugin root.
- Format status, history, and restore-confirmation timestamps through the
  shared date formatter.
- Use timezone-local wall-clock values in deterministic visual fixtures.
- Retain the strict zero-pixel comparison policy.

## Verification

- Renderer component regression test passed with an exact formatted timestamp.
- Three-viewport GitHub Backup visual test in America/Los_Angeles passed with
  zero changed pixels.
- Three-viewport GitHub Backup visual test with `TZ=UTC` passed with zero
  changed pixels.
- Typecheck, fixture, latency, and committed-baseline mutation tests passed.
- Coverage and build gates are verified by the pre-commit hook.
- GitHub Actions quality gate: pending publication verification.
