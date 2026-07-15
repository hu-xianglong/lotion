import { readFile, stat } from "node:fs/promises";

const REQUIRED_PHASES = [
  "empty",
  "selection-command",
  "conversation",
  "error",
  "qa-sources"
];

export async function assertLLMChatArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`LLM Chat artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map((entry) => entry.viewport).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`LLM Chat artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => candidate.viewport === viewportName);
    if (!entry) throw new Error(`LLM Chat artifact contract missing entry for ${viewportName}`);
    assertLLMChatViewport(entry, viewportName);
    const phaseSnapshots = await assertLLMChatSnapshots(entry, viewportName);
    const representative = phaseSnapshots[0];
    snapshots.push({
      viewport: viewportName,
      imageBytes: phaseSnapshots.reduce((total, snapshot) => total + snapshot.imageBytes, 0),
      imagePath: representative?.imagePath || "",
      metadataPath: representative?.metadataPath || "",
      phaseCount: phaseSnapshots.length,
      phases: phaseSnapshots.map((snapshot) => snapshot.phase),
      messageCount: phaseSnapshots.reduce((total, snapshot) => total + snapshot.messageCount, 0),
      historyItems: Math.max(...phaseSnapshots.map((snapshot) => snapshot.historyItems))
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

function assertLLMChatViewport(entry, viewportName) {
  if (!String(entry.sidebarEntryText || "").match(/Search & AI|LLM Chat/)) {
    throw new Error(`LLM Chat artifact contract missing sidebar/search AI entry for ${viewportName}: ${JSON.stringify(entry.sidebarEntryText)}`);
  }

  const modal = entry.modalState || {};
  if (modal.title !== "LLM Chat") {
    throw new Error(`LLM Chat artifact contract missing modal title for ${viewportName}: ${JSON.stringify(modal.title)}`);
  }
  if (modal.emptyTitle !== "No conversation yet.") {
    throw new Error(`LLM Chat artifact contract missing empty state title for ${viewportName}: ${JSON.stringify(modal.emptyTitle)}`);
  }
  if (modal.providerValue !== "openai" || !modal.modelValue) {
    throw new Error(`LLM Chat artifact contract missing provider/model state for ${viewportName}: ${JSON.stringify({ provider: modal.providerValue, model: modal.modelValue })}`);
  }
  if (modal.permissionText !== "Ask before editing") {
    throw new Error(`LLM Chat artifact contract missing permission state for ${viewportName}: ${JSON.stringify(modal.permissionText)}`);
  }
  if (!Array.isArray(modal.quickActions) || !modal.quickActions.includes("Summarize page") || !modal.quickActions.includes("Draft page")) {
    throw new Error(`LLM Chat artifact contract missing quick actions for ${viewportName}: ${JSON.stringify(modal.quickActions)}`);
  }

  const selection = entry.selectionCommandState || {};
  if (!String(selection.promptPreview || "").startsWith("Help me work with this selected text:")) {
    throw new Error(`LLM Chat artifact contract missing selected text command prompt for ${viewportName}: ${JSON.stringify(selection.promptPreview)}`);
  }
  if ((selection.requestCount ?? 0) < 1 || selection.emptyFallback !== "focused-empty-composer") {
    throw new Error(`LLM Chat artifact contract missing selected text send/fallback evidence for ${viewportName}: ${JSON.stringify(selection)}`);
  }

  const interaction = entry.interactionState || {};
  if (interaction.prompt !== "Summarize this smoke page.") {
    throw new Error(`LLM Chat artifact contract missing prompt loop evidence for ${viewportName}: ${JSON.stringify(interaction.prompt)}`);
  }
  if (!String(interaction.assistantText || "").includes("Smoke response for: Summarize this smoke page.")) {
    throw new Error(`LLM Chat artifact contract missing assistant response evidence for ${viewportName}: ${JSON.stringify(interaction.assistantText)}`);
  }
  if ((interaction.requestCount ?? 0) < 1) {
    throw new Error(`LLM Chat artifact contract missing debug request count for ${viewportName}: ${JSON.stringify(interaction.requestCount)}`);
  }
  const history = interaction.historyEvidence || {};
  if (!history.persistedUserPrompt || !history.persistedAssistantResponse || !history.restoredConversation || (history.jsonlRows ?? 0) < 2) {
    throw new Error(`LLM Chat artifact contract missing JSONL history persistence/restore evidence for ${viewportName}: ${JSON.stringify(history)}`);
  }
  if (!String(interaction.qaState?.citationText || "").includes("S1") || interaction.qaState?.openedTitle !== "Customer Feedback") {
    throw new Error(`LLM Chat artifact contract missing local Q&A citation/open evidence for ${viewportName}: ${JSON.stringify(interaction.qaState)}`);
  }
}

async function assertLLMChatSnapshots(entry, viewportName) {
  const snapshots = snapshotEntries(entry);
  const phases = snapshots.map((snapshot) => snapshot.phase);
  const missingPhases = REQUIRED_PHASES.filter((phase) => !phases.includes(phase));
  if (missingPhases.length > 0) {
    throw new Error(`LLM Chat artifact contract missing snapshot phase(s) for ${viewportName}: ${missingPhases.join(", ")}`);
  }

  const checked = [];
  for (const snapshot of snapshots.filter((candidate) => REQUIRED_PHASES.includes(candidate.phase))) {
    checked.push(await assertSnapshot(snapshot, viewportName));
  }
  return checked;
}

function snapshotEntries(entry) {
  return [
    entry.modalState?.visualSnapshot,
    entry.selectionCommandState?.snapshot,
    ...(Array.isArray(entry.interactionState?.visualSnapshots) ? entry.interactionState.visualSnapshots : []),
    entry.interactionState?.qaState?.snapshot
  ].filter(Boolean);
}

async function assertSnapshot(snapshot, viewportName) {
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`LLM Chat artifact contract missing snapshot paths for ${viewportName} ${snapshot?.phase ?? "unknown"}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`LLM Chat artifact contract found empty snapshot image for ${viewportName} ${snapshot.phase}: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`LLM Chat artifact contract viewport mismatch for ${viewportName} ${snapshot.phase}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== snapshot.phase) {
    throw new Error(`LLM Chat artifact contract phase mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  assertGeometry(payload.geometry, viewportName, snapshot.phase);
  assertVisibleState(payload.visibleState, viewportName, snapshot.phase);
  return {
    phase: snapshot.phase,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    messageCount: Array.isArray(payload.visibleState?.messages) ? payload.visibleState.messages.length : 0,
    historyItems: payload.visibleState?.historyItems ?? 0
  };
}

function assertGeometry(geometry, viewportName, phase) {
  for (const key of ["chat", "transcript", "status", "composer", "input", "send"]) {
    const rect = geometry?.[key];
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      throw new Error(`LLM Chat artifact contract missing ${key} geometry for ${viewportName} ${phase}: ${JSON.stringify(rect)}`);
    }
  }
  if (geometry.status.top < geometry.transcript.top) {
    throw new Error(`LLM Chat artifact contract invalid transcript/status geometry for ${viewportName} ${phase}: ${JSON.stringify(geometry)}`);
  }
  if (geometry.composer.top < geometry.status.top) {
    throw new Error(`LLM Chat artifact contract invalid status/composer geometry for ${viewportName} ${phase}: ${JSON.stringify(geometry)}`);
  }
}

function assertVisibleState(visibleState, viewportName, phase) {
  if (visibleState?.providerValue !== "openai" || !visibleState?.modelValue) {
    throw new Error(`LLM Chat artifact contract missing provider/model metadata for ${viewportName} ${phase}: ${JSON.stringify(visibleState)}`);
  }
  if (visibleState.permissionText !== "Ask before editing") {
    throw new Error(`LLM Chat artifact contract missing permission metadata for ${viewportName} ${phase}: ${JSON.stringify(visibleState)}`);
  }
  const messages = Array.isArray(visibleState.messages) ? visibleState.messages : [];
  if (phase === "empty") {
    if (!String(visibleState.statusText || "").includes("Ask a question") || messages.length !== 0) {
      throw new Error(`LLM Chat artifact contract empty snapshot mismatch for ${viewportName}: ${JSON.stringify(visibleState)}`);
    }
    return;
  }
  if (phase === "error") {
    if (!String(visibleState.statusText || "").includes("failed") || !messages.some((message) => message.content.includes("Smoke forced error"))) {
      throw new Error(`LLM Chat artifact contract error snapshot mismatch for ${viewportName}: ${JSON.stringify(visibleState)}`);
    }
    return;
  }
  if (!messages.some((message) => message.label === "You") || !messages.some((message) => message.label === "LLM")) {
    throw new Error(`LLM Chat artifact contract missing transcript messages for ${viewportName} ${phase}: ${JSON.stringify(messages)}`);
  }
  if (phase === "conversation" && !messages.some((message) => message.content === "Summarize this smoke page.")) {
    throw new Error(`LLM Chat artifact contract conversation snapshot missing user prompt for ${viewportName}: ${JSON.stringify(messages)}`);
  }
  if (phase === "selection-command" && !messages.some((message) => message.content.includes("Smoke workspace for LLM Chat UI coverage."))) {
    throw new Error(`LLM Chat artifact contract selection snapshot missing selected text for ${viewportName}: ${JSON.stringify(messages)}`);
  }
  if (phase === "qa-sources" && !messages.some((message) => message.content.includes("retention complaints [S1]"))) {
    throw new Error(`LLM Chat artifact contract Q&A snapshot missing source-grounded response for ${viewportName}: ${JSON.stringify(messages)}`);
  }
}

export function requiredLLMChatSnapshotPhases() {
  return [...REQUIRED_PHASES];
}
