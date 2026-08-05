export const DEFAULT_RENDERER_COVERAGE_THRESHOLDS = Object.freeze({
  lines: 30,
  statements: 30,
  functions: 20,
  branches: 55
});

export function buildRendererCoverageGate(summary, {
  baseline = null,
  baselinePath = null,
  expectedSourcePaths = null,
  thresholds = DEFAULT_RENDERER_COVERAGE_THRESHOLDS,
  generatedAt = new Date().toISOString()
} = {}) {
  const sourceEntries = Object.entries(summary || {})
    .filter(([path]) => path !== "total" && path.includes("/src/renderer/"))
    .map(([path, metrics]) => ({
      path: canonicalRendererPath(path),
      rawPath: path,
      metrics: normalizeMetrics(metrics)
    }));
  const groupedEntries = groupBy(sourceEntries, (entry) => entry.path);
  const files = [...groupedEntries.entries()]
    .map(([path, entries]) => ({
      path,
      category: rendererCoverageCategory(path),
      metrics: mergeSourceAliases(entries, path)
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (files.length === 0) {
    throw new Error("Renderer coverage report contains no src/renderer source files; refusing a bundle-only coverage claim.");
  }
  const sourceInventory = validateSourceInventory(files, expectedSourcePaths);

  const total = aggregateMetrics(files.map((file) => file.metrics));
  const categories = [...new Set(files.map((file) => file.category))]
    .sort()
    .map((category) => {
      const categoryFiles = files.filter((file) => file.category === category);
      return {
        category,
        fileCount: categoryFiles.length,
        coveredFileCount: categoryFiles.filter((file) => file.metrics.lines.covered > 0).length,
        metrics: aggregateMetrics(categoryFiles.map((file) => file.metrics))
      };
    });
  const failures = Object.entries(thresholds)
    .filter(([metric, minimum]) => Number(total[metric]?.pct) < Number(minimum))
    .map(([metric, minimum]) => ({ metric, minimum, actual: total[metric]?.pct ?? 0 }));
  const trend = baseline == null ? null : buildRendererCoverageTrend(total, baseline, {
    baselinePath,
    sourceFileCount: files.length,
    coveredSourceFileCount: files.filter((file) => file.metrics.lines.covered > 0).length
  });
  const gate = {
    kind: "lotion-renderer-coverage-gate",
    status: failures.length === 0 && trend?.status !== "failed" ? "passed" : "failed",
    generatedAt,
    thresholds: { ...thresholds },
    sourceEntryCount: sourceEntries.length,
    sourceFileCount: files.length,
    coveredSourceFileCount: files.filter((file) => file.metrics.lines.covered > 0).length,
    canonicalizedAliasCount: sourceEntries.length - files.length,
    sourceInventory,
    total,
    categories,
    lowestLineCoverageFiles: [...files]
      .sort((left, right) => left.metrics.lines.pct - right.metrics.lines.pct || left.path.localeCompare(right.path))
      .slice(0, 15)
      .map((file) => ({ path: file.path, lines: file.metrics.lines })),
    failures,
    trend
  };
  return gate;
}

function groupBy(entries, keyForEntry) {
  const grouped = new Map();
  for (const entry of entries) {
    const key = keyForEntry(entry);
    const group = grouped.get(key);
    if (group) group.push(entry);
    else grouped.set(key, [entry]);
  }
  return grouped;
}

function canonicalRendererPath(path) {
  return `src/renderer/${String(path).replaceAll("\\", "/").split("/src/renderer/")[1]}`;
}

function mergeSourceAliases(entries, path) {
  const executed = entries.filter((entry) =>
    ["lines", "statements", "functions", "branches"]
      .some((metric) => entry.metrics[metric].covered > 0)
  );
  if (executed.length > 1) {
    const signatures = new Set(executed.map((entry) => JSON.stringify(entry.metrics)));
    if (signatures.size !== 1) {
      throw new Error(`Renderer coverage source aliases contain ambiguous non-zero evidence for ${path}.`);
    }
  }
  const selected = executed[0] ?? [...entries].sort((left, right) =>
    metricTotal(right.metrics) - metricTotal(left.metrics)
  )[0];
  return selected.metrics;
}

function metricTotal(metrics) {
  return ["lines", "statements", "functions", "branches"]
    .reduce((sum, metric) => sum + metrics[metric].total, 0);
}

function validateSourceInventory(files, expectedSourcePaths) {
  const observed = files.map((file) => file.path).sort();
  if (expectedSourcePaths == null) {
    return {
      status: "not-checked",
      expectedFileCount: null,
      observedFileCount: observed.length,
      missing: [],
      unexpected: []
    };
  }
  const expected = [...new Set(expectedSourcePaths.map(canonicalExpectedSourcePath))].sort();
  const missing = expected.filter((path) => !observed.includes(path));
  const unexpected = observed.filter((path) => !expected.includes(path));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Renderer coverage source inventory mismatch: missing ${missing.join(", ") || "none"}; unexpected ${unexpected.join(", ") || "none"}.`
    );
  }
  return {
    status: "passed",
    expectedFileCount: expected.length,
    observedFileCount: observed.length,
    missing,
    unexpected
  };
}

function canonicalExpectedSourcePath(path) {
  const normalized = String(path).replaceAll("\\", "/");
  if (normalized.includes("/src/renderer/")) return canonicalRendererPath(normalized);
  if (normalized.startsWith("src/renderer/")) return normalized;
  throw new Error(`Renderer coverage expected source path is outside src/renderer: ${path}`);
}

export function buildRendererCoverageTrend(total, baseline, {
  baselinePath = null,
  sourceFileCount = null,
  coveredSourceFileCount = null
} = {}) {
  if (baseline?.kind !== "lotion-renderer-coverage-baseline") {
    throw new Error(`Invalid renderer coverage baseline kind: ${baseline?.kind ?? "missing"}`);
  }
  if (!baseline.verifiedAt || !baseline.sourceTask) {
    throw new Error("Renderer coverage baseline requires verifiedAt and sourceTask evidence.");
  }
  for (const field of ["sourceFileCount", "coveredSourceFileCount"]) {
    const value = Number(baseline[field]);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid renderer coverage baseline ${field}: ${baseline[field] ?? "missing"}`);
    }
  }
  const metrics = {};
  const failures = [];
  for (const metric of ["lines", "statements", "functions", "branches"]) {
    const current = Number(total?.[metric]?.pct);
    const baselineValue = baseline.metrics?.[metric];
    const verified = Number(baselineValue);
    if (typeof baselineValue !== "number" || !Number.isFinite(verified) || verified < 0 || verified > 100) {
      throw new Error(`Invalid renderer coverage baseline ${metric}: ${baseline.metrics?.[metric] ?? "missing"}`);
    }
    if (!Number.isFinite(current) || current < 0 || current > 100) {
      throw new Error(`Invalid current renderer coverage ${metric}: ${total?.[metric]?.pct ?? "missing"}`);
    }
    const delta = Number((current - verified).toFixed(2));
    metrics[metric] = { baseline: verified, current, delta };
    if (delta < 0) failures.push({ metric, baseline: verified, current, delta });
  }
  return {
    kind: "lotion-renderer-coverage-trend",
    status: failures.length === 0 ? "passed" : "failed",
    baselinePath,
    verifiedAt: baseline.verifiedAt,
    sourceTask: baseline.sourceTask,
    sourceFiles: {
      baseline: baseline.sourceFileCount,
      current: finiteNumber(sourceFileCount),
      delta: finiteNumber(sourceFileCount) - baseline.sourceFileCount
    },
    coveredSourceFiles: {
      baseline: baseline.coveredSourceFileCount,
      current: finiteNumber(coveredSourceFileCount),
      delta: finiteNumber(coveredSourceFileCount) - baseline.coveredSourceFileCount
    },
    metrics,
    failures
  };
}

export function assertRendererCoverageGate(gate) {
  if (gate?.kind !== "lotion-renderer-coverage-gate") {
    throw new Error(`Invalid renderer coverage gate kind: ${gate?.kind ?? "missing"}`);
  }
  if (gate.status !== "passed" || gate.failures.length > 0 || gate.trend?.status === "failed") {
    const thresholdFailures = gate.failures.map((failure) => `${failure.metric} ${failure.actual}% < ${failure.minimum}%`);
    const trendFailures = (gate.trend?.failures || []).map((failure) => `${failure.metric} ${failure.current}% < verified ${failure.baseline}% (${failure.delta} points)`);
    throw new Error(`Renderer coverage failure: ${[...thresholdFailures, ...trendFailures].join(", ")}`);
  }
  return gate;
}

export function assertRendererCoverageSourceIntegrity(gate) {
  const sourceEntryCount = Number(gate?.sourceEntryCount);
  const sourceFileCount = Number(gate?.sourceFileCount);
  const aliasCount = Number(gate?.canonicalizedAliasCount);
  const inventory = gate?.sourceInventory;
  if (
    gate?.kind !== "lotion-renderer-coverage-gate"
    || !Number.isInteger(sourceEntryCount)
    || !Number.isInteger(sourceFileCount)
    || !Number.isInteger(aliasCount)
    || sourceEntryCount < sourceFileCount
    || aliasCount !== sourceEntryCount - sourceFileCount
    || inventory?.status !== "passed"
    || inventory.expectedFileCount !== sourceFileCount
    || inventory.observedFileCount !== sourceFileCount
    || inventory.missing?.length !== 0
    || inventory.unexpected?.length !== 0
  ) {
    throw new Error("Renderer coverage source identity or inventory evidence is invalid.");
  }
  return gate;
}

function rendererCoverageCategory(path) {
  const relative = path.startsWith("src/renderer/")
    ? path.slice("src/renderer/".length)
    : path.split("/src/renderer/")[1] || "";
  if (relative.startsWith("features/databases/")) return "database surfaces";
  if (relative.startsWith("features/pages/")) return "page/editor surfaces";
  if (relative.startsWith("features/search/")) return "search surfaces";
  if (relative.startsWith("plugin-host/")) return "plugin host";
  if (relative.startsWith("components/") || relative.startsWith("context/")) return "shared UI and contexts";
  if (relative.startsWith("state/") || relative.startsWith("lib/")) return "renderer state and libraries";
  return "app shell and other";
}

function normalizeMetrics(metrics) {
  return Object.fromEntries(["lines", "statements", "functions", "branches"].map((metric) => {
    const value = metrics?.[metric] || {};
    const total = finiteNumber(value.total);
    const covered = finiteNumber(value.covered);
    return [metric, {
      total,
      covered,
      skipped: finiteNumber(value.skipped),
      pct: percentage(covered, total)
    }];
  }));
}

function aggregateMetrics(metrics) {
  return Object.fromEntries(["lines", "statements", "functions", "branches"].map((metric) => {
    const total = metrics.reduce((sum, entry) => sum + entry[metric].total, 0);
    const covered = metrics.reduce((sum, entry) => sum + entry[metric].covered, 0);
    const skipped = metrics.reduce((sum, entry) => sum + entry[metric].skipped, 0);
    return [metric, { total, covered, skipped, pct: percentage(covered, total) }];
  }));
}

function percentage(covered, total) {
  return total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2));
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
