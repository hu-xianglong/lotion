# Row Property Option Pill Font-Size Consistency

Status: done

## Problem

Row page properties now share a base font-size, but select/status/multi-select
option pills still use their own smaller typography. That makes option values
look misaligned against empty values, dates, numbers, and checkboxes.

## Changes

- Make option pills inherit row property typography when rendered inside the row
  property panel.
- Keep the lightweight Notion-like pill treatment without changing database
  table density.
- Extend the row-page UI smoke test to cover select and multi-select/status
  pill font-size and left alignment.

## Gates

- `npm run typecheck`
- `npm run smoke:row-page-navigation-ui`
- `git diff --check`
