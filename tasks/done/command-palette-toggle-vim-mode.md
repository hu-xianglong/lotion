# Command Palette Toggle Vim Mode

Status: done

## Why

Vim mode is a keyboard-focused editing preference, but it was only reachable
from sidebar settings. Users who rely on command palette workflows can now
toggle it without leaving the keyboard path.

## Result

- Added the built-in `lotion.toggle-vim-mode` command with the title
  `切换 Vim 模式`.
- Wired the command through app actions to the existing persisted `vimMode`
  setting.
- Updated renderer/component search coverage for the command title, source, and
  command id.
- Extended the multi-resolution search title UI smoke to execute the command,
  verify the search closes, assert the visible sidebar toggle and localStorage
  state change, and check desktop/compact layout overflow.

## Gates

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`
