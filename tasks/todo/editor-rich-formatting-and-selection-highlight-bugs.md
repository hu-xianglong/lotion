# Editor Rich Formatting And Selection Highlight Bugs

Status: fixed

## Context

Real imported pages such as `8. Example imported chapter` expose two editor
parity bugs:

- Callout/widget body markdown should preserve basic inline formatting the same
  way normal page text does. Example imported blockquote content can arrive as:
  `> **text  \n> **`, which markdown-it leaves as literal `**`.
- Text selection must remain visible when the selected range contains Lotion
  highlight/background spans such as `<span data-lotion-bg="yellow">...</span>`.

## Expected Behavior

- Basic formatting such as bold, italic, underline, strikethrough, inline code,
  links, highlights, and blockquote content should render consistently inside
  callout/toggle/widget markdown bodies unless the block is explicitly code.
- Selection color should win while text is selected; the regular highlight
  background should return once selection is cleared.

## Fix Notes

- Normalize imported blockquote-only emphasis closer lines before widget
  markdown rendering.
- Add editor selection-state styling so selection backgrounds are not masked by
  inline highlight/background decorations.
- Cover both cases with focused renderer regression tests.
- Add a UI smoke assertion for selection visibility; the full editor smoke is
  currently flaky earlier in global-search teardown, so the focused renderer
  tests are the passing gate for this issue.
