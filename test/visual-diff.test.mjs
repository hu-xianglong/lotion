import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PNG } from "pngjs";
import {
  VisualBaselineMismatchError,
  assertPngVisualBaseline
} from "../scripts/lib/visual-diff.mjs";

test("PNG visual baseline accepts identical images and writes machine-readable evidence", async () => {
  const fixture = await createFixture("identical");
  try {
    await writeSolidPng(fixture.expectedPath, 12, 8, [250, 250, 250, 255]);
    await writeSolidPng(fixture.actualPath, 12, 8, [250, 250, 250, 255]);
    const result = await assertPngVisualBaseline(fixture);
    assert.equal(result.status, "passed");
    assert.equal(result.diffPixels, 0);
    assert.equal(result.diffRatio, 0);
    assert.equal((await stat(fixture.diffPath)).size > 0, true);
    assert.equal(JSON.parse(await readFile(fixture.metadataPath, "utf8")).status, "passed");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("PNG visual baseline tolerates an explicitly bounded pixel delta", async () => {
  const fixture = await createFixture("bounded");
  try {
    await writeSolidPng(fixture.expectedPath, 10, 10, [255, 255, 255, 255]);
    await writeSolidPng(fixture.actualPath, 10, 10, [255, 255, 255, 255], [{ x: 2, y: 2, color: [0, 0, 0, 255] }]);
    const result = await assertPngVisualBaseline({ ...fixture, maxDiffPixels: 1, maxDiffRatio: 0.01 });
    assert.equal(result.status, "passed");
    assert.equal(result.diffPixels, 1);
    assert.equal(result.diffRatio, 0.01);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("PNG visual baseline ignores a small antialias color delta at the configured threshold", async () => {
  const fixture = await createFixture("antialias");
  try {
    await writeSolidPng(fixture.expectedPath, 10, 10, [245, 245, 245, 255]);
    await writeSolidPng(fixture.actualPath, 10, 10, [245, 245, 245, 255], [{ x: 4, y: 4, color: [248, 248, 248, 255] }]);
    const result = await assertPngVisualBaseline({ ...fixture, threshold: 0.1 });
    assert.equal(result.status, "passed");
    assert.equal(result.diffPixels, 0);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("PNG visual baseline rejects layout drift and preserves actual, expected, diff, and metadata paths", async () => {
  const fixture = await createFixture("drift");
  try {
    await writeSolidPng(fixture.expectedPath, 10, 10, [255, 255, 255, 255]);
    const changes = [];
    for (let y = 2; y < 6; y += 1) {
      for (let x = 3; x < 7; x += 1) changes.push({ x, y, color: [20, 20, 20, 255] });
    }
    await writeSolidPng(fixture.actualPath, 10, 10, [255, 255, 255, 255], changes);
    await assert.rejects(
      () => assertPngVisualBaseline({ ...fixture, maxDiffPixels: 2, maxDiffRatio: 0.02 }),
      (error) => {
        assert.equal(error instanceof VisualBaselineMismatchError, true);
        assert.equal(error.result.status, "failed");
        assert.equal(error.result.diffPixels, 16);
        assert.equal(error.result.actualPath, fixture.actualPath);
        assert.equal(error.result.expectedPath, fixture.expectedPath);
        return true;
      }
    );
    assert.equal((await stat(fixture.diffPath)).size > 0, true);
    const metadata = JSON.parse(await readFile(fixture.metadataPath, "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPath, fixture.diffPath);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("PNG visual baseline rejects dimension changes with a full red diff artifact", async () => {
  const fixture = await createFixture("dimensions");
  try {
    await writeSolidPng(fixture.expectedPath, 8, 8, [255, 255, 255, 255]);
    await writeSolidPng(fixture.actualPath, 9, 8, [255, 255, 255, 255]);
    await assert.rejects(() => assertPngVisualBaseline(fixture), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(fixture.metadataPath, "utf8"));
    assert.equal(metadata.dimensionsMatch, false);
    assert.deepEqual(metadata.actual, { width: 9, height: 8 });
    assert.deepEqual(metadata.expected, { width: 8, height: 8 });
    assert.equal(metadata.diffPixels, 72);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createFixture(name) {
  const root = await mkdtemp(join(tmpdir(), `lotion-visual-diff-${name}-`));
  return {
    root,
    actualPath: join(root, "actual.png"),
    expectedPath: join(root, "expected.png"),
    diffPath: join(root, "artifacts", "diff.png"),
    metadataPath: join(root, "artifacts", "diff.json")
  };
}

async function writeSolidPng(path, width, height, color, changes = []) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) setPixel(png, x, y, color);
  }
  for (const change of changes) setPixel(png, change.x, change.y, change.color);
  await writeFile(path, PNG.sync.write(png));
}

function setPixel(png, x, y, color) {
  const offset = (png.width * y + x) * 4;
  png.data[offset] = color[0];
  png.data[offset + 1] = color[1];
  png.data[offset + 2] = color[2];
  png.data[offset + 3] = color[3];
}
