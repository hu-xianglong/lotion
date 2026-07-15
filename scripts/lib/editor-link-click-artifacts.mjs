import { readFile, stat } from "node:fs/promises";

const DEFAULT_EXPECTED_VIEWPORTS = ["desktop", "compact"];

export async function assertEditorLinkClickArtifactContract(summary, {
  expectedViewportNames = DEFAULT_EXPECTED_VIEWPORTS
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Editor link-click artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map((entry) => viewportNameFromEntry(entry)).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Editor link-click artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`Editor link-click artifact contract missing entry for ${viewportName}`);
    assertViewportEvidence(entry, viewportName);
    snapshots.push(await assertSnapshot(entry.visualSnapshot, viewportName, entry));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertViewportEvidence(entry, viewportName) {
  const external = entry.external || {};
  if (typeof external.href !== "string" || !external.href.startsWith("https://")) {
    throw new Error(`Editor link-click ${viewportName} missing external href evidence: ${JSON.stringify(external)}`);
  }
  if (!Array.isArray(external.opened) || !external.opened.includes(external.href)) {
    throw new Error(`Editor link-click ${viewportName} missing external shell-open evidence: ${JSON.stringify(external)}`);
  }
  if (typeof external.lineText !== "string" || external.lineText.includes("](")) {
    throw new Error(`Editor link-click ${viewportName} leaked Markdown source for external link: ${JSON.stringify(external.lineText)}`);
  }

  const internal = entry.internal || {};
  if (typeof internal.target !== "string" || !internal.target.includes("/pages/")) {
    throw new Error(`Editor link-click ${viewportName} missing internal page target: ${JSON.stringify(internal)}`);
  }
  if (typeof internal.navigatedTitle !== "string" || internal.navigatedTitle.length === 0) {
    throw new Error(`Editor link-click ${viewportName} missing internal page navigation evidence: ${JSON.stringify(internal)}`);
  }

  const blankEdit = entry.blankEdit || {};
  if (typeof blankEdit.token !== "string" || blankEdit.token.length === 0 || blankEdit.focused !== true) {
    throw new Error(`Editor link-click ${viewportName} missing blank-space editing evidence: ${JSON.stringify(blankEdit)}`);
  }

  const overflow = entry.overflow || {};
  if (!Number.isFinite(overflow.bodyScrollWidth) || !Number.isFinite(overflow.innerWidth)) {
    throw new Error(`Editor link-click ${viewportName} missing horizontal overflow evidence: ${JSON.stringify(overflow)}`);
  }
  const maxDocumentWidth = Math.max(overflow.bodyScrollWidth, overflow.docScrollWidth || 0);
  const allowedWidth = Math.max(overflow.bodyClientWidth || 0, overflow.docClientWidth || 0, overflow.innerWidth) + 8;
  if (maxDocumentWidth > allowedWidth) {
    throw new Error(`Editor link-click ${viewportName} recorded horizontal overflow: ${JSON.stringify(overflow)}`);
  }
}

async function assertSnapshot(snapshot, viewportName, entry) {
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Editor link-click ${viewportName} missing snapshot paths`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Editor link-click ${viewportName} snapshot image is empty: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Editor link-click ${viewportName} snapshot viewport mismatch: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "editor-link-click") {
    throw new Error(`Editor link-click ${viewportName} snapshot phase mismatch: ${JSON.stringify(payload.phase)}`);
  }
  if (payload.pageId !== entry.pageId) {
    throw new Error(`Editor link-click ${viewportName} snapshot page mismatch: ${JSON.stringify(payload)}`);
  }
  if (payload.externalHref !== entry.external.href || payload.internalTarget !== entry.internal.target) {
    throw new Error(`Editor link-click ${viewportName} snapshot link metadata mismatch: ${JSON.stringify(payload)}`);
  }
  if (payload.blankEditToken !== entry.blankEdit.token) {
    throw new Error(`Editor link-click ${viewportName} snapshot blank edit mismatch: ${JSON.stringify(payload)}`);
  }
  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    phaseCount: 1,
    phases: ["editor-link-click"],
    externalOpenedCount: Array.isArray(entry.external.opened) ? entry.external.opened.length : 0,
    internalNavigatedTitle: entry.internal.navigatedTitle,
    blankEditToken: entry.blankEdit.token
  };
}

function viewportNameFromEntry(entry) {
  const value = entry?.viewport;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.name === "string") return value.name;
  return "";
}
