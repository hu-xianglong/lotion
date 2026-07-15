import { readFile, stat } from "node:fs/promises";

const REQUIRED_PHASES = [
  "typed",
  "default-command-palette",
  "recent",
  "tag-default",
  "builtin-open-pages",
  "builtin-open-databases"
];

const REQUIRED_DEFAULT_TITLES = ["新建页面", "打开所有页面"];
const REQUIRED_TYPED_QUERY = "exampleSearchPage";

export async function assertGlobalSearchVisualArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Global search visual artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map(viewportNameFromEntry).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Global search visual artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`Global search visual artifact contract missing entry for ${viewportName}`);

    assertSearchViewportSummary(entry, viewportName);
    const phaseSnapshots = await assertSearchSnapshots(entry, viewportName);

    snapshots.push({
      viewport: viewportName,
      imageBytes: phaseSnapshots.reduce((total, snapshot) => total + snapshot.imageBytes, 0),
      phaseCount: phaseSnapshots.length,
      phases: phaseSnapshots.map((snapshot) => snapshot.phase),
      typedHitCount: entry.rendered?.hits?.length ?? 0,
      commandRowCount: entry.emptyPaletteDefaults?.rows?.filter((row) => row.badge === "命令").length ?? 0,
      recentRowCount: entry.recentDefaults?.rendered?.filter((row) => row.badge === "最近").length ?? 0,
      tagRows: phaseSnapshots.find((snapshot) => snapshot.phase === "tag-default")?.visibleRows?.filter((row) => row.type === "tag").length ?? 0
    });
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertSearchViewportSummary(entry, viewportName) {
  const pageId = String(entry.pageId ?? "");
  const pageTitle = String(entry.pageTitle ?? "");
  const rendered = entry.rendered;
  if (!pageId || !pageTitle) {
    throw new Error(`Global search visual artifact contract missing page identity for ${viewportName}`);
  }
  if (!rendered?.target) {
    throw new Error(`Global search visual artifact contract missing typed target for ${viewportName}`);
  }
  if (rendered.target.title !== pageTitle) {
    throw new Error(`Global search visual artifact contract typed target title mismatch for ${viewportName}: ${JSON.stringify(rendered.target)}`);
  }
  if (!rendered.target.icon || !rendered.target.kind || !rendered.target.matchType) {
    throw new Error(`Global search visual artifact contract typed target missing icon/kind/match badge for ${viewportName}: ${JSON.stringify(rendered.target)}`);
  }
  assertNoRawIdLeak([rendered.target], pageId, `typed target ${viewportName}`);

  const emptyRows = entry.emptyPaletteDefaults?.rows;
  if (!Array.isArray(emptyRows) || emptyRows.length < 6) {
    throw new Error(`Global search visual artifact contract missing default command palette rows for ${viewportName}`);
  }
  for (const title of REQUIRED_DEFAULT_TITLES) {
    if (!emptyRows.some((row) => row.title === title && row.badge === "命令")) {
      throw new Error(`Global search visual artifact contract missing default command row ${title} for ${viewportName}: ${JSON.stringify(emptyRows.slice(0, 10))}`);
    }
  }
  if (!entry.emptyPaletteDefaults?.progress?.label?.includes("最近访问、标签和命令")) {
    throw new Error(`Global search visual artifact contract default progress copy mismatch for ${viewportName}: ${JSON.stringify(entry.emptyPaletteDefaults?.progress)}`);
  }
  if (!entry.emptyPaletteDefaults?.activeCommand?.inputFocused) {
    throw new Error(`Global search visual artifact contract missing keyboard focus for default command row in ${viewportName}`);
  }

  const recentRows = entry.recentDefaults?.rendered;
  if (!Array.isArray(recentRows) || recentRows.filter((row) => row.badge === "最近").length < 3) {
    throw new Error(`Global search visual artifact contract missing recent page/database/row rows for ${viewportName}: ${JSON.stringify(recentRows?.slice?.(0, 8))}`);
  }
  if (!entry.recentDefaults?.keyboard?.pageActive?.inputFocused || !entry.recentDefaults?.keyboard?.databaseActive?.inputFocused || !entry.recentDefaults?.keyboard?.rowActive?.inputFocused) {
    throw new Error(`Global search visual artifact contract recent keyboard focus missing for ${viewportName}`);
  }

  const tagRow = entry.tagPages?.tagRow;
  if (tagRow?.badge !== "标签" || tagRow?.type !== "tag" || !tagRow?.preview?.includes("标签页")) {
    throw new Error(`Global search visual artifact contract tag row mismatch for ${viewportName}: ${JSON.stringify(tagRow)}`);
  }
  if (!entry.tagPages?.typedActive?.inputFocused || entry.tagPages?.typedActive?.type !== "tag") {
    throw new Error(`Global search visual artifact contract tag keyboard focus missing for ${viewportName}: ${JSON.stringify(entry.tagPages?.typedActive)}`);
  }

  assertCommandSummary(entry.builtInCommands?.openPagesRow, "打开所有页面", viewportName);
  assertCommandSummary(entry.builtInCommands?.newPageRow, "新建页面", viewportName);
  assertCommandSummary(entry.databasePluginCommands?.openDatabasesRow, "打开所有数据库", viewportName);
  assertCommandSummary(entry.databasePluginCommands?.openPluginsRow, "打开插件", viewportName);
}

async function assertSearchSnapshots(entry, viewportName) {
  const snapshots = Array.isArray(entry.visualSnapshots) ? entry.visualSnapshots : [];
  const phases = snapshots.map((snapshot) => snapshot.phase);
  const missingPhases = REQUIRED_PHASES.filter((phase) => !phases.includes(phase));
  if (missingPhases.length > 0) {
    throw new Error(`Global search visual artifact contract missing snapshot phase(s) for ${viewportName}: ${missingPhases.join(", ")}`);
  }

  const checked = [];
  for (const snapshot of snapshots.filter((candidate) => REQUIRED_PHASES.includes(candidate.phase))) {
    if (!snapshot?.imagePath || !snapshot?.metadataPath) {
      throw new Error(`Global search visual artifact contract missing snapshot paths for ${viewportName} ${snapshot?.phase ?? "unknown"}`);
    }
    const imageInfo = await stat(snapshot.imagePath);
    if (imageInfo.size <= 0) {
      throw new Error(`Global search visual artifact contract found empty snapshot image for ${viewportName} ${snapshot.phase}: ${snapshot.imagePath}`);
    }
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    const metadataPayload = metadata.metadata || {};
    if (metadata.viewport?.name !== viewportName) {
      throw new Error(`Global search visual artifact contract viewport mismatch for ${viewportName} ${snapshot.phase}: ${JSON.stringify(metadata.viewport)}`);
    }
    if (metadataPayload.phase !== snapshot.phase) {
      throw new Error(`Global search visual artifact contract phase mismatch for ${viewportName}: ${JSON.stringify(metadataPayload)}`);
    }
    const visibleRows = Array.isArray(metadataPayload.visibleRows) ? metadataPayload.visibleRows : [];
    if (visibleRows.length < 1) {
      throw new Error(`Global search visual artifact contract missing visible rows for ${viewportName} ${snapshot.phase}`);
    }
    assertPhaseRows({ metadataPayload, phase: snapshot.phase, viewportName });
    if (metadataPayload.pageId) assertNoRawIdLeak(visibleRows, metadataPayload.pageId, `${snapshot.phase} ${viewportName}`);

    checked.push({
      phase: snapshot.phase,
      imageBytes: imageInfo.size,
      metadataPath: snapshot.metadataPath,
      visibleRows
    });
  }
  return checked;
}

function assertPhaseRows({ metadataPayload, phase, viewportName }) {
  const rows = metadataPayload.visibleRows;
  if (phase === "typed") {
    if (metadataPayload.query !== REQUIRED_TYPED_QUERY) {
      throw new Error(`Global search visual artifact contract typed query mismatch for ${viewportName}: ${metadataPayload.query}`);
    }
    if (!rows.some((row) => row.title === metadataPayload.pageTitle && row.badge)) {
      throw new Error(`Global search visual artifact contract typed snapshot missing page title for ${viewportName}: ${JSON.stringify(rows.slice(0, 8))}`);
    }
    return;
  }
  if (phase === "default-command-palette") {
    for (const title of REQUIRED_DEFAULT_TITLES) {
      if (!rows.some((row) => row.title === title && row.badge === "命令")) {
        throw new Error(`Global search visual artifact contract default snapshot missing command ${title} for ${viewportName}: ${JSON.stringify(rows.slice(0, 10))}`);
      }
    }
    return;
  }
  if (phase === "recent") {
    if (rows.filter((row) => row.badge === "最近").length < 3) {
      throw new Error(`Global search visual artifact contract recent snapshot missing recent rows for ${viewportName}: ${JSON.stringify(rows.slice(0, 8))}`);
    }
    return;
  }
  if (phase === "tag-default") {
    if (!rows.some((row) => row.badge === "标签" && row.type === "tag")) {
      throw new Error(`Global search visual artifact contract tag snapshot missing tag row for ${viewportName}: ${JSON.stringify(rows.slice(0, 8))}`);
    }
    return;
  }
  if (phase === "builtin-open-pages") {
    if (!rows.some((row) => row.title === "打开所有页面" && row.badge === "命令")) {
      throw new Error(`Global search visual artifact contract open-pages snapshot missing command row for ${viewportName}: ${JSON.stringify(rows.slice(0, 8))}`);
    }
    return;
  }
  if (phase === "builtin-open-databases" && !rows.some((row) => row.title === "打开所有数据库" && row.badge === "命令")) {
    throw new Error(`Global search visual artifact contract open-databases snapshot missing command row for ${viewportName}: ${JSON.stringify(rows.slice(0, 8))}`);
  }
}

function assertCommandSummary(row, title, viewportName) {
  if (row?.title !== title || row?.badge !== "命令" || !row?.preview?.includes("Lotion")) {
    throw new Error(`Global search visual artifact contract missing command ${title} for ${viewportName}: ${JSON.stringify(row)}`);
  }
}

function assertNoRawIdLeak(rows, pageId, label) {
  if (!pageId) return;
  for (const row of rows) {
    const haystack = [row.title, row.path, row.preview, row.label].filter(Boolean).join(" ");
    if (haystack.includes(pageId)) {
      throw new Error(`Global search visual artifact contract leaked raw page id in ${label}: ${JSON.stringify(row)}`);
    }
  }
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}
