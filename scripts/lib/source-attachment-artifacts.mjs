import { readFile, stat } from "node:fs/promises";

const REQUIRED_SOURCE_LINK_COUNT = 2;
const REQUIRED_PREVIEW_KEYS = ["pdf", "video", "audio", "image"];

export async function assertSourceAttachmentArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map(viewportNameFromEntry).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Source attachment artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`Source attachment artifact contract missing entry for ${viewportName}`);
    assertSourceAttachmentViewport(entry, viewportName);

    const snapshot = entry.propertySnapshot;
    if (!snapshot?.imagePath || !snapshot?.metadataPath || !snapshot.imageBytes) {
      throw new Error(`Source attachment artifact contract missing snapshot baseline for ${viewportName}`);
    }
    const imageInfo = await stat(snapshot.imagePath);
    if (imageInfo.size <= 0) {
      throw new Error(`Source attachment artifact contract found empty snapshot image for ${viewportName}: ${snapshot.imagePath}`);
    }
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    const metadataPayload = metadata.metadata || {};
    if (metadata.viewport?.name !== viewportName) {
      throw new Error(`Source attachment artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
    }
    if (metadataPayload.originalHtmlRel !== entry.originalHtmlRel || metadataPayload.originalCsvRel !== entry.originalCsvRel) {
      throw new Error(`Source attachment artifact contract source metadata mismatch for ${viewportName}: ${JSON.stringify(metadataPayload)}`);
    }
    if (metadataPayload.sourceLinkCount !== REQUIRED_SOURCE_LINK_COUNT) {
      throw new Error(`Source attachment artifact contract expected ${REQUIRED_SOURCE_LINK_COUNT} source links for ${viewportName}: ${JSON.stringify(metadataPayload)}`);
    }

    snapshots.push({
      viewport: viewportName,
      imagePath: snapshot.imagePath,
      metadataPath: snapshot.metadataPath,
      imageBytes: imageInfo.size,
      sourceLinkCount: metadataPayload.sourceLinkCount,
      openedCount: entry.rendered.shellOpenDryRunRequests.length,
      previews: renderedPreviewSummary(entry.rendered)
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

function assertSourceAttachmentViewport(entry, viewportName) {
  const rendered = entry.rendered;
  if (!rendered || typeof rendered !== "object") {
    throw new Error(`Source attachment artifact contract missing rendered state for ${viewportName}`);
  }
  if (!Array.isArray(rendered.sourceLinkButtons) || rendered.sourceLinkButtons.length !== REQUIRED_SOURCE_LINK_COUNT) {
    throw new Error(`Source attachment artifact contract missing source link buttons for ${viewportName}: ${JSON.stringify(rendered.sourceLinkButtons)}`);
  }
  if (!rendered.sourceLinkButtons.every((item) => item.readOnly)) {
    throw new Error(`Source attachment artifact contract source links must be read-only for ${viewportName}: ${JSON.stringify(rendered.sourceLinkButtons)}`);
  }
  if (!Array.isArray(rendered.shellOpenDryRunRequests)) {
    throw new Error(`Source attachment artifact contract missing shell-open requests for ${viewportName}`);
  }
  for (const expected of [entry.originalHtmlRel, entry.originalCsvRel, entry.documentRel]) {
    if (!rendered.shellOpenDryRunRequests.includes(expected)) {
      throw new Error(`Source attachment artifact contract missing opened request ${expected} for ${viewportName}`);
    }
  }
  if (rendered.documentLinks < 1) {
    throw new Error(`Source attachment artifact contract expected document link widgets for ${viewportName}`);
  }
  if (!String(rendered.pdfPreviewSrc || "").includes(entry.pdfRel)) {
    throw new Error(`Source attachment artifact contract missing PDF preview for ${viewportName}: ${rendered.pdfPreviewSrc}`);
  }
  if (!String(rendered.videoPreview?.src || "").includes(entry.videoRel) || !rendered.videoPreview?.controls) {
    throw new Error(`Source attachment artifact contract missing video preview controls for ${viewportName}: ${JSON.stringify(rendered.videoPreview)}`);
  }
  if (!String(rendered.audioPreview?.src || "").includes(entry.audioRel) || !rendered.audioPreview?.controls) {
    throw new Error(`Source attachment artifact contract missing audio preview controls for ${viewportName}: ${JSON.stringify(rendered.audioPreview)}`);
  }
  if (!String(rendered.imageSrc || "").includes(entry.imageRel)) {
    throw new Error(`Source attachment artifact contract missing image preview for ${viewportName}: ${rendered.imageSrc}`);
  }
}

function renderedPreviewSummary(rendered) {
  return {
    pdf: Boolean(rendered.pdfPreviewSrc),
    video: Boolean(rendered.videoPreview?.src && rendered.videoPreview?.controls),
    audio: Boolean(rendered.audioPreview?.src && rendered.audioPreview?.controls),
    image: Boolean(rendered.imageSrc)
  };
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}

export function requiredSourceAttachmentPreviewKeys() {
  return [...REQUIRED_PREVIEW_KEYS];
}
