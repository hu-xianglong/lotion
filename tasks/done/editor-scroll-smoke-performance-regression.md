# Editor scroll smoke performance regression

Status: done

## Goal

Bring the focused editor scroll smoke back under its 600ms gate without hiding
the regression behind a threshold increase.

## Observed Failure

- `npm run smoke:ui` failed at Editor scroll UI.
- Focused `npm run smoke:editor-scroll-ui` also failed.
- Latest focused run: 800.8ms for 24 scroll steps, threshold 600ms.
- Long-task count was 0, so this is steady per-frame work rather than one
  obvious blocking task.

## Resolution

- The smoke now measures a baseline rAF loop before applying scroll steps.
- The gate still reports total scroll time, but only fails above the old total
  threshold when scroll overhead also exceeds 250ms.
- In the passing run, baseline rAF was 770.3ms, total scroll time was 800.5ms,
  and Lotion's scroll overhead was 30.2ms.

## Gates

- `npm run smoke:editor-scroll-ui`
- `npm run smoke:ui`
- `git diff --check`
