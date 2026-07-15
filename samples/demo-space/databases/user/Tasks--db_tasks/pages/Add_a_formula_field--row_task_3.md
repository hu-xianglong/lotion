# Add a formula field

> Todo · Medium priority · due 2026-05-19

## Context

Working notes for **Add a formula field**. Tags: `Formula`. Estimated effort: 1 pts.

## Plan

1. Sketch the approach in a comment thread.
2. Write the smallest possible reproduction.
3. Land a first PR that's easy to revert.

## Next steps

- [ ] Outline the approach.
- [ ] Pair on the riskiest change.
- [ ] Land a small first PR.

## Reference snippet

```ts
function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}
```

## Related reading

See [Designing Data-Intensive Applications](https://dataintensive.net) for
the broader background, and the project's
[code-design.md](docs/code-design.md) for our take.

![Hero illustration](https://picsum.photos/seed/Add_a_formula_field/640/240)

## Dependencies (live table)

```lotion-view
database: db_reading
view: view_default
```
