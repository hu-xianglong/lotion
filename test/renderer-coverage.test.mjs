import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRendererCoverageGate,
  assertRendererCoverageSourceIntegrity,
  buildRendererCoverageGate
} from "../scripts/lib/renderer-coverage.mjs";

test("renderer coverage gate aggregates real renderer sources by release surface", () => {
  const gate = buildRendererCoverageGate({
    total: metricSet(10, 10),
    "/private/workspace/src/renderer/components/Menu.tsx": metricSet(10, 8, 5, 3),
    "/private/workspace/src/renderer/features/pages/PageEditor.tsx": metricSet(20, 12, 10, 6),
    "/private/workspace/node_modules/react/index.js": metricSet(100, 100)
  }, { thresholds: { lines: 60, statements: 60, functions: 50, branches: 50 }, generatedAt: "2026-07-22T00:00:00.000Z" });
  assert.equal(gate.sourceFileCount, 2);
  assert.equal(gate.sourceEntryCount, 2);
  assert.equal(gate.canonicalizedAliasCount, 0);
  assert.equal(gate.coveredSourceFileCount, 2);
  assert.equal(gate.total.lines.pct, 66.67);
  assert.deepEqual(gate.categories.map((entry) => entry.category), ["page/editor surfaces", "shared UI and contexts"]);
  assert.equal(assertRendererCoverageGate(gate).status, "passed");
});

test("renderer coverage gate canonicalizes macOS private-path aliases without double counting", () => {
  const gate = buildRendererCoverageGate({
    "/workspace/src/renderer/App.tsx": metricSet(90, 0, 2, 0),
    "/private/workspace/src/renderer/App.tsx": metricSet(100, 80, 20, 12),
    "/workspace/src/renderer/components/Menu.tsx": metricSet(20, 0, 10, 0)
  }, {
    expectedSourcePaths: ["src/renderer/App.tsx", "src/renderer/components/Menu.tsx"],
    thresholds: { lines: 1, statements: 1, functions: 1, branches: 1 }
  });
  assert.equal(gate.sourceEntryCount, 3);
  assert.equal(gate.sourceFileCount, 2);
  assert.equal(gate.coveredSourceFileCount, 1);
  assert.equal(gate.canonicalizedAliasCount, 1);
  assert.equal(gate.total.lines.total, 120);
  assert.equal(gate.total.lines.covered, 80);
  assert.equal(gate.total.lines.pct, 66.67);
  assert.deepEqual(gate.sourceInventory, {
    status: "passed",
    expectedFileCount: 2,
    observedFileCount: 2,
    missing: [],
    unexpected: []
  });
  assert.equal(assertRendererCoverageSourceIntegrity(gate).status, "passed");
});

test("renderer coverage gate rejects ambiguous non-zero aliases and inventory drift", () => {
  assert.throws(
    () => buildRendererCoverageGate({
      "/workspace/src/renderer/App.tsx": metricSet(100, 70),
      "/private/workspace/src/renderer/App.tsx": metricSet(100, 80)
    }),
    /ambiguous non-zero evidence/
  );
  assert.throws(
    () => buildRendererCoverageGate({
      "/workspace/src/renderer/App.tsx": metricSet(100, 80)
    }, {
      expectedSourcePaths: ["src/renderer/App.tsx", "src/renderer/components/Menu.tsx"]
    }),
    /source inventory mismatch: missing src\/renderer\/components\/Menu\.tsx; unexpected none/
  );
});

test("renderer coverage source integrity rejects missing or inconsistent alias evidence", () => {
  const gate = buildRendererCoverageGate({
    "/workspace/src/renderer/App.tsx": metricSet(100, 80)
  }, {
    expectedSourcePaths: ["src/renderer/App.tsx"],
    thresholds: { lines: 1, statements: 1, functions: 1, branches: 1 }
  });
  assert.throws(
    () => assertRendererCoverageSourceIntegrity({ ...gate, sourceInventory: { ...gate.sourceInventory, status: "not-checked" } }),
    /source identity or inventory evidence is invalid/
  );
  assert.throws(
    () => assertRendererCoverageSourceIntegrity({ ...gate, canonicalizedAliasCount: 1 }),
    /source identity or inventory evidence is invalid/
  );
});

test("renderer coverage gate rejects bundle-only reports", () => {
  assert.throws(
    () => buildRendererCoverageGate({ "/tmp/renderer-component-entry.cjs": metricSet(100, 100) }),
    /no src\/renderer source files/
  );
});

test("renderer coverage gate reports every threshold regression", () => {
  const gate = buildRendererCoverageGate({
    "/workspace/src/renderer/features/search/GlobalSearchPanel.tsx": metricSet(20, 4, 10, 1)
  }, { thresholds: { lines: 50, statements: 50, functions: 30, branches: 40 } });
  assert.equal(gate.status, "failed");
  assert.deepEqual(gate.failures.map((failure) => failure.metric), ["lines", "statements", "functions", "branches"]);
  assert.throws(() => assertRendererCoverageGate(gate), /lines 20% < 50%/);
});

test("renderer coverage trend passes at or above every verified baseline metric", () => {
  const gate = buildRendererCoverageGate({
    "/workspace/src/renderer/components/Menu.tsx": metricSet(100, 70, 20, 12)
  }, {
    baseline: coverageBaseline({ lines: 69, statements: 70, functions: 60, branches: 59 }),
    baselinePath: "test/baselines/renderer-coverage.json",
    thresholds: { lines: 1, statements: 1, functions: 1, branches: 1 }
  });
  assert.equal(gate.status, "passed");
  assert.equal(gate.trend.status, "passed");
  assert.equal(gate.trend.baselinePath, "test/baselines/renderer-coverage.json");
  assert.equal(gate.trend.metrics.lines.delta, 1);
  assert.equal(gate.trend.metrics.statements.delta, 0);
  assert.equal(gate.trend.sourceFiles.delta, 0);
  assert.equal(assertRendererCoverageGate(gate).status, "passed");
});

test("renderer coverage trend rejects regressions that remain above absolute floors", () => {
  const gate = buildRendererCoverageGate({
    "/workspace/src/renderer/features/search/GlobalSearchPanel.tsx": metricSet(100, 70, 20, 12)
  }, {
    baseline: coverageBaseline({ lines: 70.01, statements: 70, functions: 61, branches: 60 }),
    thresholds: { lines: 30, statements: 30, functions: 20, branches: 55 }
  });
  assert.equal(gate.failures.length, 0, "absolute coverage floors should still pass");
  assert.equal(gate.trend.status, "failed");
  assert.deepEqual(gate.trend.failures.map((failure) => failure.metric), ["lines", "functions"]);
  assert.throws(() => assertRendererCoverageGate(gate), /lines 70% < verified 70.01% \(-0.01 points\)/);
});

test("renderer coverage trend rejects malformed or unverified baseline evidence", () => {
  const summary = { "/workspace/src/renderer/App.tsx": metricSet(10, 8) };
  assert.throws(
    () => buildRendererCoverageGate(summary, { baseline: { kind: "wrong" } }),
    /Invalid renderer coverage baseline kind/
  );
  assert.throws(
    () => buildRendererCoverageGate(summary, { baseline: { ...coverageBaseline(), verifiedAt: "" } }),
    /requires verifiedAt and sourceTask evidence/
  );
  assert.throws(
    () => buildRendererCoverageGate(summary, { baseline: coverageBaseline({ branches: null }) }),
    /Invalid renderer coverage baseline branches/
  );
});

function metricSet(total, covered, functionTotal = total, functionCovered = covered) {
  return {
    lines: metric(total, covered),
    statements: metric(total, covered),
    functions: metric(functionTotal, functionCovered),
    branches: metric(functionTotal, functionCovered)
  };
}

function metric(total, covered) {
  return { total, covered, skipped: 0, pct: total === 0 ? 100 : (covered / total) * 100 };
}

function coverageBaseline(metrics = {}) {
  return {
    kind: "lotion-renderer-coverage-baseline",
    verifiedAt: "2026-07-22",
    sourceTask: "tasks/done/renderer-source-coverage-gate.md",
    sourceFileCount: 1,
    coveredSourceFileCount: 1,
    metrics: { lines: 70, statements: 70, functions: 60, branches: 60, ...metrics }
  };
}
