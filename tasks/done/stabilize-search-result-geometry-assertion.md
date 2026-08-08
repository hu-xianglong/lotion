# Stabilize Search-Result Geometry Assertion

Status: done

Verification status: verified

## Goal

Prevent the Search result title UI gate from reading a detached or hidden
result while React replaces command-search results.

## Problem

The harness waited for a visible command hit, then resolved a separate
`:visible` locator before reading its rectangle. On the slower GitHub runner,
React could replace that node between those operations, yielding a zero-sized
rectangle during the built-in raw-Markdown command test.

## Resolution

- Select the first rendered result and read its style and rectangle in one
  browser-context evaluation.
- Require display, visibility, opacity, width, and height to represent a
  visible hit before returning it.
- Preserve the existing viewport-boundary and horizontal-overflow checks.

## Verification

- Shared-CDP Search result title suite matching the GitHub workflow: passed.
- Desktop, compact, and wide viewports: passed.
- Built-in raw-Markdown command and the complete built-in/plugin command
  sequence: passed.
- Artifact contract: one suite passed, three viewport snapshots, no console
  errors, no missing artifact contracts.
- GitHub Actions quality gate: pending publication verification.
