import { readFile, stat } from "node:fs/promises";

const REQUIRED_CONTROLS = ["Zoom in", "Zoom out", "Reset zoom", "Close image preview"];

export async function assertImageLightboxArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Image lightbox artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = [...new Set(viewports.map((entry) => entry?.viewport).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Image lightbox artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => candidate.viewport === viewportName);
    if (!entry) throw new Error(`Image lightbox artifact contract missing entry for ${viewportName}`);
    assertImageLightboxEvidence(entry, viewportName);
    snapshots.push(await assertImageLightboxSnapshot(entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertImageLightboxEvidence(entry, viewportName, { requireClosed = true } = {}) {
  if (entry.opened !== true || (requireClosed && entry.closed !== true) || (!requireClosed && entry.closed === true)) {
    throw new Error(`Image lightbox artifact contract missing open/close evidence for ${viewportName}: ${JSON.stringify({ opened: entry.opened, closed: entry.closed })}`);
  }

  const controls = Array.isArray(entry.controls) ? entry.controls : [];
  const missingControls = REQUIRED_CONTROLS.filter((control) => !controls.includes(control));
  if (missingControls.length > 0) {
    throw new Error(`Image lightbox artifact contract missing control(s) for ${viewportName}: ${missingControls.join(", ")}`);
  }

  const initial = entry.geometry?.initialRect;
  const zoomed = entry.geometry?.zoomedRect;
  const keyboardZoom = entry.geometry?.keyboardZoomRect;
  const reset = entry.geometry?.resetRect;
  if (!isUsableImageRect(initial) || !isUsableImageRect(zoomed) || !isUsableImageRect(keyboardZoom) || !isUsableImageRect(reset)) {
    throw new Error(`Image lightbox artifact contract missing usable image geometry for ${viewportName}: ${JSON.stringify(entry.geometry)}`);
  }
  if (!(zoomed.width > initial.width * 1.15)) {
    throw new Error(`Image lightbox artifact contract missing button zoom-in evidence for ${viewportName}: ${JSON.stringify({ initial, zoomed })}`);
  }
  if (!(keyboardZoom.width > zoomed.width * 1.05)) {
    throw new Error(`Image lightbox artifact contract missing keyboard zoom-in evidence for ${viewportName}: ${JSON.stringify({ zoomed, keyboardZoom })}`);
  }
  if (Math.abs(reset.width - initial.width) > 4 || Math.abs(reset.height - initial.height) > 4) {
    throw new Error(`Image lightbox artifact contract reset geometry drifted for ${viewportName}: ${JSON.stringify({ initial, reset })}`);
  }

  if (entry.noHorizontalOverflow !== true) {
    throw new Error(`Image lightbox artifact contract missing no-overflow evidence for ${viewportName}: ${JSON.stringify(entry)}`);
  }
}

async function assertImageLightboxSnapshot(entry, viewportName) {
  const snapshot = entry?.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Image lightbox artifact contract missing snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Image lightbox artifact contract found empty snapshot for ${viewportName}: ${snapshot.imagePath}`);
  }

  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Image lightbox artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "image-lightbox") {
    throw new Error(`Image lightbox artifact contract phase mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  assertImageLightboxEvidence(payload, viewportName, { requireClosed: false });

  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    zoomedWidth: payload.geometry.zoomedRect.width,
    controls: payload.controls
  };
}

function isUsableImageRect(rect) {
  return rect && Number(rect.width) >= 120 && Number(rect.height) >= 80;
}

export function requiredImageLightboxControls() {
  return [...REQUIRED_CONTROLS];
}
