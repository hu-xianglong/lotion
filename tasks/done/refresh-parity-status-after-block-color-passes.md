# Refresh parity status after block color passes

Status: done

## Why

The operational queue had advanced past the Notion block color fidelity work,
but the parity sequence still said the queue was complete through item 231 and
only named the earlier color coverage. That stale status made continuous queue
selection more error-prone.

## Changes

- Updated the current-next-step summary in the Notion parity sequence from
  queue item 231 to 237.
- Documented that Notion color fidelity now includes
  inline/paragraph/heading/quote/list/todo `block-color-*` classes, nested
  colored list items, and callout backgrounds.

## Gate

- `git diff --check`
