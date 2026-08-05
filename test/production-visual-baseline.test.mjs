import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

import { assertProductionVisualBaseline } from "../scripts/lib/production-visual-baseline.mjs";
import { VisualBaselineMismatchError } from "../scripts/lib/visual-diff.mjs";

test("production visual baseline validates committed checksum and writes linked evidence", async () => {
  const fixture = await createFixture("pass");
  try {
    await writeSolidPng(fixture.expectedPath, 12, 8, [250, 250, 250, 255]);
    await writeSolidPng(fixture.actualPath, 12, 8, [250, 250, 250, 255]);
    await writePolicy(fixture);
    const result = await assertProductionVisualBaseline(fixture);
    assert.equal(result.status, "passed");
    assert.equal(result.diffPixels, 0);
    assert.equal(result.policy.surface, "design-system");
    assert.equal(result.policy.theme, "light");
    assert.equal(result.policyPath, "baseline.json");
    assert.equal((await stat(result.diffPath)).size > 0, true);
    assert.equal(JSON.parse(await readFile(result.metadataPath, "utf8")).status, "passed");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("production visual baseline rejects a visible mutation and preserves diff evidence", async () => {
  const fixture = await createFixture("mutation");
  try {
    await writeSolidPng(fixture.expectedPath, 10, 10, [255, 255, 255, 255]);
    await writeSolidPng(fixture.actualPath, 10, 10, [255, 255, 255, 255], [{ x: 4, y: 4, color: [0, 0, 0, 255] }]);
    await writePolicy(fixture, { width: 10, height: 10 });
    await assert.rejects(() => assertProductionVisualBaseline(fixture), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(fixture.artifactRoot, "visual-diff", "design-system-desktop-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels, 1);
    assert.equal((await stat(metadata.diffPath)).size > 0, true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("production visual baseline can absorb bounded text raster drift while retaining a zero-pixel budget", async () => {
  const fixture = await createFixture("text-raster-drift");
  try {
    await writeSolidPng(fixture.expectedPath, 10, 10, [255, 255, 255, 255]);
    await writeSolidPng(fixture.actualPath, 10, 10, [255, 255, 255, 255], [
      { x: 4, y: 4, color: [203, 203, 203, 255] }
    ]);
    await writePolicy(fixture, { width: 10, height: 10, threshold: 0.2 });
    const result = await assertProductionVisualBaseline(fixture);
    assert.equal(result.status, "passed");
    assert.equal(result.diffPixels, 0);
    assert.equal(result.maxDiffPixels, 0);
    assert.equal(result.maxDiffRatio, 0);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("production visual baseline rejects committed image checksum drift before comparison", async () => {
  const fixture = await createFixture("checksum");
  try {
    await writeSolidPng(fixture.expectedPath, 10, 10, [255, 255, 255, 255]);
    await writeSolidPng(fixture.actualPath, 10, 10, [255, 255, 255, 255]);
    await writePolicy(fixture, { width: 10, height: 10, sha256: "0".repeat(64) });
    await assert.rejects(() => assertProductionVisualBaseline(fixture), /checksum mismatch/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("committed compact Design System baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-production-baseline-compact-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "design-system-compact.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "compact-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/design-system-compact.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "design-system-compact-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed Notion Import command modal baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-notion-import-baseline-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "notion-import-command-modal-compact.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "notion-import-command-modal-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/notion-import-command-modal-compact.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "notion-import-command-modal-compact-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed Markdown Preview selected-source baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-markdown-preview-baseline-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "markdown-preview-selected-source-compact.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "markdown-preview-selected-source-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/markdown-preview-selected-source-compact.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "markdown-preview-selected-source-compact-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed row-page property panel baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-row-page-property-baseline-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "row-page-property-panel-compact.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "row-page-property-panel-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/row-page-property-panel-compact.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "row-page-property-panel-compact-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed embedded-view table baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-embedded-view-baseline-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "embedded-view-table-compact.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "embedded-view-table-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/embedded-view-table-compact.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "embedded-view-table-compact-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed database-created-views baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-database-created-views-baseline-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "database-created-views-compact.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "database-created-views-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/database-created-views-compact.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "database-created-views-compact-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed database-interaction settings baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-database-interaction-baseline-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "database-interaction-settings-compact.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "database-interaction-settings-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/database-interaction-settings-compact.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "database-interaction-settings-compact-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed wide Design System baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-production-baseline-wide-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "design-system-wide.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "wide-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/design-system-wide.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "design-system-wide-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed White Theme page baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-white-theme-baseline-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "white-theme-page-desktop.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "white-theme-page-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/white-theme-page-desktop.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "white-theme-page-desktop-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed Settings Center baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-settings-center-baseline-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "settings-center-compact.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "settings-center-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/settings-center-compact.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "settings-center-compact-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed Plugin Manager baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-plugin-manager-baseline-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "plugin-manager-compact.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "plugin-manager-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/plugin-manager-compact.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "plugin-manager-compact-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed LLM Chat conversation baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-llm-chat-baseline-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "llm-chat-conversation-compact.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "llm-chat-conversation-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/llm-chat-conversation-compact.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "llm-chat-conversation-compact-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed Advanced Search stale-result baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-advanced-search-baseline-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "advanced-search-stale-results-compact.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "advanced-search-stale-results-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/advanced-search-stale-results-compact.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "advanced-search-stale-results-compact-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed Search & AI chat-handoff baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-search-ai-baseline-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "search-ai-chat-handoff-compact.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "search-ai-chat-handoff-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/search-ai-chat-handoff-compact.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "search-ai-chat-handoff-compact-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed global-search result baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-global-search-baseline-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "global-search-results-compact.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "global-search-results-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/global-search-results-compact.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "global-search-results-compact-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed page-history restore-preview baselines reject deliberate pixel mutations", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-history-baseline-mutation-"));
  try {
    for (const viewport of ["desktop", "compact", "wide"]) {
      const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", `page-history-restore-preview-${viewport}.png`);
      const png = PNG.sync.read(await readFile(expectedPath));
      setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
      const actualPath = join(root, `page-history-restore-preview-${viewport}-mutated.png`);
      const artifactRoot = join(root, `artifacts-${viewport}`);
      await mkdir(artifactRoot, { recursive: true });
      await writeFile(actualPath, PNG.sync.write(png));
      await assert.rejects(() => assertProductionVisualBaseline({
        actualPath,
        artifactRoot,
        policyPath: `test/baselines/production-visual/page-history-restore-preview-${viewport}.json`
      }), VisualBaselineMismatchError);
      const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", `page-history-restore-preview-${viewport}-diff.json`), "utf8"));
      assert.equal(metadata.status, "failed");
      assert.equal(metadata.diffPixels > 0, true);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed GitHub Backup restore-preview baseline rejects a deliberate pixel mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-github-backup-baseline-mutation-"));
  try {
    const expectedPath = join(process.cwd(), "test", "baselines", "production-visual", "github-backup-restore-preview-compact.png");
    const png = PNG.sync.read(await readFile(expectedPath));
    setPixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2), [255, 0, 255, 255]);
    const actualPath = join(root, "github-backup-restore-preview-mutated.png");
    const artifactRoot = join(root, "artifacts");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(actualPath, PNG.sync.write(png));
    await assert.rejects(() => assertProductionVisualBaseline({
      actualPath,
      artifactRoot,
      policyPath: "test/baselines/production-visual/github-backup-restore-preview-compact.json"
    }), VisualBaselineMismatchError);
    const metadata = JSON.parse(await readFile(join(artifactRoot, "visual-diff", "github-backup-restore-preview-compact-diff.json"), "utf8"));
    assert.equal(metadata.status, "failed");
    assert.equal(metadata.diffPixels > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createFixture(name) {
  const root = await mkdtemp(join(tmpdir(), `lotion-production-baseline-${name}-`));
  const artifactRoot = join(root, "artifacts");
  await mkdir(artifactRoot, { recursive: true });
  return {
    root,
    actualPath: join(root, "actual.png"),
    expectedPath: join(root, "expected.png"),
    artifactRoot,
    policyPath: join(root, "baseline.json")
  };
}

async function writePolicy(fixture, { width = 12, height = 8, sha256, threshold = 0.1 } = {}) {
  const expectedBytes = await readFile(fixture.expectedPath);
  const checksum = sha256 || createHash("sha256").update(expectedBytes).digest("hex");
  await writeFile(fixture.policyPath, `${JSON.stringify({
    kind: "lotion-production-visual-baseline-policy",
    surface: "design-system",
    theme: "light",
    viewport: { name: "desktop", width: 1440, height: 1000 },
    image: { path: "expected.png", sha256: checksum, width, height },
    comparison: { threshold, includeAA: false, maxDiffPixels: 0, maxDiffRatio: 0 },
    verifiedAt: "2026-07-22",
    sourceTask: "tasks/done/design-system-committed-perceptual-baseline.md"
  }, null, 2)}\n`, "utf8");
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
