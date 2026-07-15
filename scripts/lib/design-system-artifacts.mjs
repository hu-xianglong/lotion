import { readFile, stat } from "node:fs/promises";

const REQUIRED_STATUS_PILLS = ["Readable", "Dense", "Tokenized", "Local"];
const REQUIRED_TOKENS = {
  paper: "#ffffff",
  sand: "#f7f7f4",
  vellum: "#f0f1ee",
  kraft: "#e7e9e3"
};

export async function assertDesignSystemArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Design system artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = [...new Set(viewports.map(viewportNameFromEntry).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Design system artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`Design system artifact contract missing entry for ${viewportName}`);
    assertDesignSystemEvidence(entry, viewportName);
    snapshots.push(await assertDesignSystemSnapshot(entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertDesignSystemEvidence(entry, viewportName) {
  assertThemeState(entry.themeState, viewportName);
  assertControlState(entry.controlState, viewportName);
  assertLayoutState(entry.layoutState, viewportName);
}

function assertThemeState(state, viewportName) {
  const tokens = state?.tokens || {};
  for (const [token, expected] of Object.entries(REQUIRED_TOKENS)) {
    if (normalizeColor(tokens[token]) !== expected) {
      throw new Error(`Design system artifact contract token ${token} mismatch for ${viewportName}: ${JSON.stringify(tokens)}`);
    }
  }
  if (!/^#[0-9a-f]{6}$/.test(normalizeColor(tokens.accent))) {
    throw new Error(`Design system artifact contract missing concrete accent token for ${viewportName}: ${JSON.stringify(tokens)}`);
  }
  if (normalizeColor(state?.panel?.backgroundColor) !== REQUIRED_TOKENS.paper) {
    throw new Error(`Design system artifact contract panel background mismatch for ${viewportName}: ${JSON.stringify(state?.panel)}`);
  }
  if (normalizeColor(state?.sourceCard?.backgroundColor) !== REQUIRED_TOKENS.paper) {
    throw new Error(`Design system artifact contract source-card background mismatch for ${viewportName}: ${JSON.stringify(state?.sourceCard)}`);
  }
  if (normalizeColor(state?.primary?.backgroundColor) !== normalizeColor(tokens.accent)) {
    throw new Error(`Design system artifact contract primary button does not use accent for ${viewportName}: ${JSON.stringify(state?.primary)}`);
  }
}

function assertControlState(state, viewportName) {
  if (state?.focusState?.isPrimary !== true || state?.focusState?.activeText !== "New page") {
    throw new Error(`Design system artifact contract missing primary focus evidence for ${viewportName}: ${JSON.stringify(state?.focusState)}`);
  }
  const labels = Array.isArray(state?.statusPills) ? state.statusPills : [];
  const missing = REQUIRED_STATUS_PILLS.filter((label) => !labels.includes(label));
  if (missing.length > 0) {
    throw new Error(`Design system artifact contract missing status pill(s) for ${viewportName}: ${missing.join(", ")}`);
  }
}

function assertLayoutState(state, viewportName) {
  const viewportWidth = Number(state?.viewport?.width || 0);
  const rects = state?.rects || {};
  const required = ["lab", "toolbar", "tokenGrid", "controlGrid", "patternGrid", "sourceCard"];
  for (const key of required) {
    const rect = rects[key];
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      throw new Error(`Design system artifact contract missing ${key} geometry for ${viewportName}: ${JSON.stringify(rect)}`);
    }
    if (rect.left < -8 || rect.right > viewportWidth + 8) {
      throw new Error(`Design system artifact contract ${key} overflows for ${viewportName}: ${JSON.stringify({ rect, viewport: state.viewport })}`);
    }
  }
}

async function assertDesignSystemSnapshot(entry, viewportName) {
  const snapshot = entry?.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Design system artifact contract missing snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Design system artifact contract found empty snapshot for ${viewportName}: ${snapshot.imagePath}`);
  }

  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Design system artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "design-system") {
    throw new Error(`Design system artifact contract phase mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  assertThemeState(payload.themeState, viewportName);
  assertControlState(payload.controlState, viewportName);
  assertLayoutState(payload.layoutState, viewportName);

  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    statusPills: payload.controlState.statusPills,
    tokenCount: Object.keys(REQUIRED_TOKENS).length
  };
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}

function normalizeColor(value) {
  const text = String(value ?? "").trim().toLowerCase();
  const hex = /^#([0-9a-f]{6})$/.exec(text);
  if (hex) return `#${hex[1]}`;
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)$/.exec(text);
  if (!rgb) return text;
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
  if (alpha === 0) return "transparent";
  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

export function requiredDesignSystemStatusPills() {
  return [...REQUIRED_STATUS_PILLS];
}
