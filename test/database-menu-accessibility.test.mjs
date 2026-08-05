import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("database menus and recovery surfaces retain keyboard and screen-reader contracts", async () => {
  const menu = await readFile(new URL("../src/renderer/components/Menu.tsx", import.meta.url), "utf8");
  const table = await readFile(new URL("../src/renderer/features/databases/DatabaseTable.tsx", import.meta.url), "utf8");
  const chrome = await readFile(new URL("../src/renderer/features/databases/DatabaseChrome.tsx", import.meta.url), "utf8");
  const filter = await readFile(new URL("../src/renderer/features/databases/FilterPopover.tsx", import.meta.url), "utf8");
  const sort = await readFile(new URL("../src/renderer/features/databases/SortPopover.tsx", import.meta.url), "utf8");
  const mutationErrors = await readFile(new URL("../src/shared/database-mutation-errors.ts", import.meta.url), "utf8");
  assert.match(menu, /role="menu"/);
  assert.match(menu, /ArrowDown/);
  assert.match(menu, /ArrowUp/);
  assert.match(menu, /Home/);
  assert.match(menu, /End/);
  assert.match(menu, /returnFocusRef/);
  assert.match(menu, /menu-sheet-backdrop/);
  assert.match(table, /aria-live="polite"/);
  assert.match(table, />Retry</);
  assert.match(table, /"Undo"/);
  assert.match(table, /Retry delete/);
  assert.match(table, /Retry undo/);
  assert.match(table, /aria-label="Search this view"/);
  assert.match(table, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(table, /closeMenuLayers/);
  assert.doesNotMatch(table, /function clearSelection\(event/);
  assert.match(chrome, /closeOnEscape/);
  assert.match(chrome, /menuLayerOpen/);
  assert.match(chrome, /ArrowDown/);
  assert.match(filter, /querySelector<HTMLElement>\('button:not\(\[disabled\]\)/);
  assert.match(sort, /querySelector<HTMLElement>\('button:not\(\[disabled\]\)/);
  for (const code of ["DATABASE_CONFLICT", "DATABASE_LOCKED", "DATABASE_NOT_FOUND", "DATABASE_INVALID_DEPENDENCY", "DATABASE_PERSISTENCE_FAILURE"]) {
    assert.match(mutationErrors, new RegExp(code));
  }
});
