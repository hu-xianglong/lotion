#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertLLMChatArtifactContract } from "./lib/llm-chat-artifacts.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  openPage,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const result = await withLotionUIHarness("llm-chat-ui", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const viewports = [];
  const expectedViewports = selectedViewports();
  await forEachViewport(page, expectedViewports, async (viewport) => {
    const fixture = await createLLMChatFixture(viewport.name);
    await openWorkspace(fixture.root);
    await openPage(page, fixture.pageId);
    await page.getByText(fixture.pageTitle).first().waitFor({ timeout: 8_000 });
    await assertNoDocumentHorizontalOverflow(page, `llm chat page ${viewport.name}`, 8);

    let sidebarEntryText = "";
    let modalState;
    let selectionCommandState;
    let interactionState;
    try {
      sidebarEntryText = await openLLMChatFromSidebar(page);
      modalState = await assertLLMChatPanelState(page, fixture, viewport, artifactRoot);
      selectionCommandState = await assertLLMChatSelectionCommand(page, fixture, viewport, artifactRoot);
      interactionState = await assertLLMChatInteraction(page, fixture, viewport, artifactRoot);
    } finally {
      await clearLLMChatDebugHook(page).catch(() => undefined);
    }

    viewports.push({
      viewport: viewport.name,
      workspaceRoot: fixture.root,
      sidebarEntryText,
      modalState,
      selectionCommandState,
      interactionState
    });
  });

  const summary = {
    cdpUrl,
    viewports,
    status: "passed"
  };
  summary.artifactContract = await assertLLMChatArtifactContract(summary, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
  });
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function openLLMChatFromSidebar(page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.locator(".sidebar-footer-link").first().waitFor({ timeout: 8_000 });
  const entry = page.locator(".sidebar-footer-link").filter({ hasText: "Search & AI" }).first();
  await entry.waitFor({ timeout: 8_000 });
  const sidebarEntryText = (await entry.textContent({ timeout: 5_000 }))?.trim() ?? "";
  await entry.click();
  const surface = page.locator('[data-testid="search-ai-surface"]').first();
  await surface.waitFor({ timeout: 8_000 });
  await surface.getByRole("tab", { name: "LLM Chat" }).click();
  await surface.getByRole("button", { name: "Open LLM Chat" }).click();
  return sidebarEntryText;
}

async function openGlobalSearch(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "F",
      code: "KeyF",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true
    }));
  });
  await page.waitForSelector(".global-search-input", { timeout: 5_000 });
}

async function assertLLMChatSelectionCommand(page, fixture, viewport, artifactRoot) {
  await clearLLMChatDebugHook(page).catch(() => undefined);
  await openPage(page, fixture.pageId);
  await page.locator(".cm-content").first().waitFor({ timeout: 8_000 });
  await page.locator(".cm-content").first().click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.waitForFunction(
    () => window.__lotionEditorSelectionText?.includes("Smoke workspace for LLM Chat UI coverage."),
    null,
    { timeout: 5_000 }
  );

  await openGlobalSearch(page);
  const search = page.locator(".global-search-input").first();
  await search.fill("Ask LLM about selection");
  const command = page.locator(".global-search-hit").filter({ hasText: "Ask LLM about selection" }).first();
  await command.waitFor({ timeout: 8_000 });
  await command.getByText("命令").waitFor({ timeout: 8_000 });
  await assertNoDocumentHorizontalOverflow(page, `llm selection command search ${viewport.name}`, 8);
  await command.click();

  const modal = page.locator(".openai-llm-assistant-shell").filter({ hasText: "LLM Chat" }).first();
  await modal.waitFor({ timeout: 8_000 });
  await modal.getByText("Selected text loaded. Edit the prompt or send it.").waitFor({ timeout: 8_000 });
  const input = modal.locator(".openai-llm-chat-input").first();
  await input.waitFor({ timeout: 8_000 });
  const promptValue = await input.inputValue();
  if (!promptValue.startsWith("Help me work with this selected text:")) {
    throw new Error(`Selection command did not insert the selection prompt prefix: ${JSON.stringify(promptValue)}`);
  }
  if (!promptValue.includes("Smoke workspace for LLM Chat UI coverage.")) {
    throw new Error(`Selection command did not include selected editor text: ${JSON.stringify(promptValue)}`);
  }
  const focused = await input.evaluate((node) => document.activeElement === node);
  if (!focused) throw new Error("Selection command should focus the LLM Chat composer.");
  assertLLMChatGeometry(await readLLMChatGeometry(modal));
  await assertNoDocumentHorizontalOverflow(page, `llm selection command panel ${viewport.name}`, 8);

  await installLLMChatDebugHook(page);
  const sendPrompt = `${promptValue}\n\nSummarize the selected passage in one line.`;
  await input.fill(sendPrompt);
  await modal.getByRole("button", { name: "Send" }).first().click();
  await modal.locator(".openai-llm-chat-message.is-user .openai-llm-chat-message-content", { hasText: "Smoke workspace for LLM Chat UI coverage." }).waitFor({ timeout: 8_000 });
  await modal.locator(".openai-llm-chat-message.is-assistant .openai-llm-chat-message-content", { hasText: "Smoke response for:" }).waitFor({ timeout: 8_000 });
  await modal.getByText("Ready.").waitFor({ timeout: 8_000 });
  const requests = await page.evaluate(() => window.__lotionLLMChatDebugRequests ?? []);
  if (!requests.some((request) => request.prompt.includes("Smoke workspace for LLM Chat UI coverage."))) {
    throw new Error(`Selection command prompt was not sent to the LLM debug provider: ${JSON.stringify(requests)}`);
  }
  const snapshot = await captureLLMChatSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "selection-command",
      selectedText: "Smoke workspace for LLM Chat UI coverage."
    },
    modal,
    page,
    viewport
  });
  await modal.getByRole("button", { name: "Close LLM Chat" }).click();
  await modal.waitFor({ state: "detached", timeout: 8_000 });
  await clearLLMChatDebugHook(page);
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    delete window.__lotionEditorSelectionText;
    delete window.__lotionEditorSelectionUpdatedAt;
  });
  await openGlobalSearch(page);
  await page.locator(".global-search-input").first().fill("Ask LLM about selection");
  await page.locator(".global-search-hit").filter({ hasText: "Ask LLM about selection" }).first().click();
  const emptyModal = page.locator(".openai-llm-assistant-shell").filter({ hasText: "LLM Chat" }).first();
  await emptyModal.waitFor({ timeout: 8_000 });
  await emptyModal.getByText("Select text first or type a prompt.").waitFor({ timeout: 8_000 });
  const emptyInput = emptyModal.locator(".openai-llm-chat-input").first();
  await emptyInput.waitFor({ timeout: 8_000 });
  const emptyValue = await emptyInput.inputValue();
  if (emptyValue.trim()) throw new Error(`Selection command should not reuse stale text without a selection: ${JSON.stringify(emptyValue)}`);
  if (!await emptyInput.evaluate((node) => document.activeElement === node)) {
    throw new Error("Selection command without selected text should still focus the composer.");
  }
  assertLLMChatGeometry(await readLLMChatGeometry(emptyModal));
  await assertNoDocumentHorizontalOverflow(page, `llm selection command empty ${viewport.name}`, 8);
  await emptyModal.getByRole("button", { name: "Close LLM Chat" }).click();
  await emptyModal.waitFor({ state: "detached", timeout: 8_000 });
  return {
    promptPreview: promptValue.slice(0, 80),
    requestCount: requests.length,
    snapshot,
    emptyFallback: "focused-empty-composer"
  };
}

async function assertLLMChatPanelState(page, fixture, viewport, artifactRoot) {
  const panel = page.locator(".openai-llm-assistant-shell").filter({ hasText: "LLM Chat" }).first();
  await panel.waitFor({ timeout: 8_000 });
  await panel.locator(".openai-llm-chat").waitFor({ timeout: 8_000 });
  await panel.getByText("Page assistant").waitFor({ timeout: 8_000 });
  await panel.getByText("Workspace assistant").waitFor({ timeout: 8_000 });
  await panel.getByText("Current page: Smoke / LLM Chat Smoke Home").waitFor({ timeout: 8_000 });
  await panel.getByText("No saved chats yet.").waitFor({ timeout: 8_000 });
  await panel.getByText("No conversation yet.").waitFor({ timeout: 8_000 });
  await panel.getByText("Ask a question or request a workspace action.").waitFor({ timeout: 8_000 });
  await panel.getByRole("button", { name: "Summarize page" }).waitFor({ timeout: 8_000 });
  await panel.getByRole("button", { name: "Draft page" }).waitFor({ timeout: 8_000 });

  const provider = panel.locator(".openai-llm-chat-provider").first();
  await provider.waitFor({ timeout: 8_000 });
  const providerValue = await provider.inputValue();
  if (providerValue !== "openai") throw new Error(`Unexpected default chat provider: ${JSON.stringify(providerValue)}`);

  const model = panel.locator(".openai-llm-chat-model").first();
  await model.waitFor({ timeout: 8_000 });
  const modelValue = await model.inputValue();
  if (!modelValue) throw new Error("Expected chat model picker to have a default model.");

  const permissionState = panel.locator(".openai-llm-chat-permissions-state").first();
  await permissionState.waitFor({ timeout: 8_000 });
  const permissionText = (await permissionState.textContent({ timeout: 5_000 }))?.trim() ?? "";
  if (permissionText !== "Ask before editing") throw new Error(`Unexpected permission state: ${JSON.stringify(permissionText)}`);

  const mode = panel.locator(".openai-llm-chat-mode").first();
  await mode.waitFor({ timeout: 8_000 });
  if (await mode.inputValue() !== "ask_before_editing") {
    await mode.selectOption("ask_before_editing");
  }

  const context = panel.locator(".openai-llm-chat-context-select").first();
  await context.waitFor({ timeout: 8_000 });
  if (await context.inputValue() !== "current_page") {
    await context.selectOption("current_page");
  }

  const input = panel.locator(".openai-llm-chat-input").first();
  await input.waitFor({ timeout: 8_000 });
  const placeholder = await input.getAttribute("placeholder");
  if (placeholder !== "Ask about the current page, search the workspace, or request a draft.") {
    throw new Error(`Unexpected LLM Chat input placeholder: ${JSON.stringify(placeholder)}`);
  }

  const clearButton = panel.getByRole("button", { name: "Clear" }).first();
  const sendButton = panel.getByRole("button", { name: "Send" }).first();
  await clearButton.waitFor({ timeout: 8_000 });
  await sendButton.waitFor({ timeout: 8_000 });

  const state = await panel.evaluate((dialog) => {
    const readStyle = (selector) => {
      const element = dialog.querySelector(selector);
      const style = element ? getComputedStyle(element) : null;
      return {
        backgroundColor: style?.backgroundColor ?? "",
        borderRadius: style?.borderRadius ?? "",
        color: style?.color ?? ""
      };
    };
    const radius = (selector) => Number.parseFloat(readStyle(selector).borderRadius) || 0;
    return {
      title: dialog.querySelector(".openai-llm-assistant-header strong")?.textContent?.trim() ?? "",
      emptyTitle: dialog.querySelector(".openai-llm-chat-empty strong")?.textContent?.trim() ?? "",
      emptyHint: dialog.querySelector(".openai-llm-chat-empty span")?.textContent?.trim() ?? "",
      statusText: dialog.querySelector(".openai-llm-chat-status")?.textContent?.trim() ?? "",
      inputRows: dialog.querySelector(".openai-llm-chat-input")?.getAttribute("rows") ?? "",
      providerValue: dialog.querySelector(".openai-llm-chat-provider")?.value ?? "",
      modelValue: dialog.querySelector(".openai-llm-chat-model")?.value ?? "",
      modeValue: dialog.querySelector(".openai-llm-chat-mode")?.value ?? "",
      contextValue: dialog.querySelector(".openai-llm-chat-context-select")?.value ?? "",
      permissionText: dialog.querySelector(".openai-llm-chat-permissions-state")?.textContent?.trim() ?? "",
      toolEvents: Array.from(dialog.querySelectorAll(".openai-llm-chat-tool-event")).map((event) => event.textContent?.trim() ?? ""),
      quickActions: Array.from(dialog.querySelectorAll(".openai-llm-chat-quick-action")).map((button) => button.textContent?.trim() ?? ""),
      clearText: dialog.querySelector(".openai-llm-chat-clear")?.textContent?.trim() ?? "",
      sendText: dialog.querySelector(".openai-llm-chat-send")?.textContent?.trim() ?? "",
      visual: {
        rootVisual: dialog.querySelector(".openai-llm-chat")?.getAttribute("data-visual") ?? "",
        testIds: Array.from(dialog.querySelectorAll("[data-testid]")).map((element) => element.getAttribute("data-testid") ?? ""),
        controlsLabel: dialog.querySelector(".openai-llm-chat-controls")?.getAttribute("aria-label") ?? "",
        activityLabel: dialog.querySelector(".openai-llm-chat-tool-events")?.getAttribute("aria-label") ?? "",
        transcriptLive: dialog.querySelector(".openai-llm-chat-transcript")?.getAttribute("aria-live") ?? "",
        lightSurfaces: {
          chat: readStyle(".openai-llm-chat").backgroundColor,
          history: readStyle(".openai-llm-chat-history").backgroundColor,
          transcript: readStyle(".openai-llm-chat-transcript").backgroundColor,
          composer: readStyle(".openai-llm-chat-composer").backgroundColor
        },
        sendBackground: readStyle(".openai-llm-chat-send").backgroundColor,
        chatRadius: radius(".openai-llm-chat"),
        messageRadius: radius(".openai-llm-chat-message-content"),
        inputRadius: radius(".openai-llm-chat-input")
      }
    };
  });
  if (state.title !== "LLM Chat") throw new Error(`Unexpected modal title: ${JSON.stringify(state.title)}`);
  if (state.emptyTitle !== "No conversation yet.") throw new Error(`Unexpected empty state title: ${JSON.stringify(state.emptyTitle)}`);
  if (state.emptyHint !== "Pick a model and ask Lotion about the current workspace.") {
    throw new Error(`Unexpected empty state hint: ${JSON.stringify(state.emptyHint)}`);
  }
  if (state.statusText !== "Ask a question or request a workspace action.") {
    throw new Error(`Unexpected chat status: ${JSON.stringify(state.statusText)}`);
  }
  if (state.inputRows !== "3") throw new Error(`Unexpected textarea rows: ${JSON.stringify(state.inputRows)}`);
  if (state.providerValue !== "openai") throw new Error(`Unexpected provider value: ${JSON.stringify(state.providerValue)}`);
  if (state.modeValue !== "ask_before_editing") throw new Error(`Unexpected mode value after normalization: ${JSON.stringify(state.modeValue)}`);
  if (state.contextValue !== "current_page") throw new Error(`Unexpected context value after normalization: ${JSON.stringify(state.contextValue)}`);
  if (!state.modelValue) throw new Error(`Unexpected empty model value: ${JSON.stringify(state)}`);
  if (state.permissionText !== "Ask before editing") throw new Error(`Unexpected permission chip: ${JSON.stringify(state.permissionText)}`);
  if (!state.toolEvents.some((event) => /ContextCurrent page/.test(event)) || !state.toolEvents.some((event) => /ModeAsk before editing/.test(event))) {
    throw new Error(`Unexpected tool/context event state: ${JSON.stringify(state.toolEvents)}`);
  }
  if (!state.quickActions.includes("Summarize page") || !state.quickActions.includes("Draft page")) {
    throw new Error(`Missing quick actions: ${JSON.stringify(state.quickActions)}`);
  }
  if (state.clearText !== "Clear" || state.sendText !== "Send") {
    throw new Error(`Unexpected LLM Chat action labels: ${JSON.stringify(state)}`);
  }
  assertLLMChatVisualState(state.visual, viewport.name);
  assertLLMChatGeometry(await readLLMChatGeometry(panel));
  await assertNoDocumentHorizontalOverflow(page, `llm chat panel ${viewport.name}`, 8);
  const visualSnapshot = await captureLLMChatSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "empty",
      statusText: state.statusText,
      providerValue: state.providerValue,
      modelValue: state.modelValue,
      permissionText: state.permissionText
    },
    modal: panel,
    page,
    viewport
  });

  await panel.getByRole("button", { name: "Close LLM Chat" }).click();
  await panel.waitFor({ state: "detached", timeout: 8_000 });
  return { ...state, visualSnapshot };
}

async function assertLLMChatInteraction(page, fixture, viewport, artifactRoot) {
  await installLLMChatDebugHook(page);
  await openLLMChatFromSidebar(page);
  const modal = page.locator(".openai-llm-assistant-shell").filter({ hasText: "LLM Chat" }).first();
  await modal.waitFor({ timeout: 8_000 });

  const prompt = "Summarize this smoke page.";
  const input = modal.locator(".openai-llm-chat-input").first();
  const modelInput = modal.locator(".openai-llm-chat-model").first();
  const clearButton = modal.getByRole("button", { name: "Clear" }).first();
  const sendButton = modal.getByRole("button", { name: "Send" }).first();
  await modelInput.fill("gpt-5");
  await input.fill(prompt);
  await sendButton.click();

  await modal.getByText("Thinking...").waitFor({ timeout: 8_000 });
  await modal.locator(".openai-llm-chat-message.is-user .openai-llm-chat-message-label", { hasText: "You" }).waitFor({ timeout: 8_000 });
  await modal.locator(".openai-llm-chat-message.is-user .openai-llm-chat-message-content", { hasText: prompt }).waitFor({ timeout: 8_000 });
  if (!await input.isDisabled()) throw new Error("LLM Chat input should be disabled while completion is running.");
  if (!await modelInput.isDisabled()) throw new Error("LLM Chat model input should be disabled while completion is running.");
  if (!await modal.locator(".openai-llm-chat-mode").first().isDisabled()) {
    throw new Error("LLM Chat mode picker should be disabled while completion is running.");
  }
  if (!await modal.locator(".openai-llm-chat-context-select").first().isDisabled()) {
    throw new Error("LLM Chat context picker should be disabled while completion is running.");
  }
  if (!await sendButton.isDisabled()) throw new Error("LLM Chat send button should be disabled while completion is running.");
  if (!await clearButton.isDisabled()) throw new Error("LLM Chat clear button should be disabled while completion is running.");

  await modal.locator(".openai-llm-chat-message.is-assistant .openai-llm-chat-message-label", { hasText: "LLM" }).waitFor({ timeout: 8_000 });
  const assistantText = `Smoke response for: ${prompt}`;
  await modal.locator(".openai-llm-chat-message.is-assistant .openai-llm-chat-message-content", { hasText: assistantText }).waitFor({ timeout: 8_000 });
  await modal.locator(".openai-llm-chat-write-preview", { hasText: "Proposed page update" }).waitFor({ timeout: 8_000 });
  await modal.getByRole("button", { name: "Apply" }).waitFor({ timeout: 8_000 });
  await modal.getByRole("button", { name: "Copy" }).waitFor({ timeout: 8_000 });
  await modal.getByRole("button", { name: "Discard" }).waitFor({ timeout: 8_000 });
  await modal.getByText("Ready.").waitFor({ timeout: 8_000 });
  if (await input.isDisabled()) throw new Error("LLM Chat input stayed disabled after completion.");
  if (await modelInput.isDisabled()) throw new Error("LLM Chat model input stayed disabled after completion.");
  if (await modal.locator(".openai-llm-chat-mode").first().isDisabled()) {
    throw new Error("LLM Chat mode picker stayed disabled after completion.");
  }
  if (await modal.locator(".openai-llm-chat-context-select").first().isDisabled()) {
    throw new Error("LLM Chat context picker stayed disabled after completion.");
  }
  if (await sendButton.isDisabled()) throw new Error("LLM Chat send button stayed disabled after completion.");
  if (await clearButton.isDisabled()) throw new Error("LLM Chat clear button stayed disabled after completion.");

  const requestCount = await page.evaluate(() => window.__lotionLLMChatDebugRequests?.length ?? 0);
  if (requestCount !== 1) throw new Error(`Expected one LLM Chat debug request, saw ${requestCount}.`);

  const historyRows = await page.evaluate(() => window.lotion.plugins.readJsonl("llm-openai", "chat-history.jsonl"));
  if (!historyRows.some((row) => row.role === "user" && row.content === prompt && row.model === "gpt-5")) {
    throw new Error(`Expected prompt/model in chat history JSONL, saw ${JSON.stringify(historyRows)}`);
  }
  const historyEvidence = {
    jsonlRows: historyRows.length,
    persistedUserPrompt: historyRows.some((row) => row.role === "user" && row.content === prompt && row.model === "gpt-5"),
    persistedAssistantResponse: historyRows.some((row) => row.role === "assistant" && row.content.includes(assistantText)),
    restoredConversation: false
  };

  const geometry = await readLLMChatGeometry(modal);
  assertLLMChatGeometry(geometry);
  await assertNoDocumentHorizontalOverflow(page, `llm chat interaction ${viewport.name}`, 8);
  const conversationSnapshot = await captureLLMChatSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "conversation",
      prompt,
      assistantText,
      requestCount
    },
    modal,
    page,
    viewport
  });

  await modal.getByRole("button", { name: "Close LLM Chat" }).click();
  await modal.waitFor({ state: "detached", timeout: 8_000 });
  await openLLMChatFromSidebar(page);
  const restoredModal = page.locator(".openai-llm-assistant-shell").filter({ hasText: "LLM Chat" }).first();
  await restoredModal.waitFor({ timeout: 8_000 });
  await restoredModal.locator(".openai-llm-chat-history-item", { hasText: prompt }).first().click();
  await restoredModal.locator(".openai-llm-chat-message.is-user .openai-llm-chat-message-content", { hasText: prompt }).waitFor({ timeout: 8_000 });
  await restoredModal.locator(".openai-llm-chat-message.is-assistant .openai-llm-chat-message-content", { hasText: assistantText }).waitFor({ timeout: 8_000 });
  historyEvidence.restoredConversation = true;

  await inputErrorScenario(restoredModal);
  const errorSnapshot = await captureLLMChatSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "error",
      expectedError: "Smoke forced error"
    },
    modal: restoredModal,
    page,
    viewport
  });

  const restoredInput = restoredModal.locator(".openai-llm-chat-input").first();
  const restoredClear = restoredModal.getByRole("button", { name: "Clear" }).first();
  const restoredSend = restoredModal.getByRole("button", { name: "Send" }).first();
  await restoredInput.fill("Keyboard send prompt.");
  await restoredInput.press("Enter");
  await restoredModal.locator(".openai-llm-chat-message.is-user .openai-llm-chat-message-content", { hasText: "Keyboard send prompt." }).waitFor({ timeout: 8_000 });
  await restoredModal.getByText("Ready.").waitFor({ timeout: 8_000 });

  await restoredClear.click();
  await restoredModal.getByText("Conversation cleared.").waitFor({ timeout: 8_000 });
  await restoredModal.getByText("No conversation yet.").waitFor({ timeout: 8_000 });
  const remainingMessages = await restoredModal.locator(".openai-llm-chat-message").count();
  if (remainingMessages !== 0) throw new Error(`Expected clear action to remove transcript messages, saw ${remainingMessages}.`);
  if (await restoredInput.isDisabled()) throw new Error("LLM Chat input should be usable after clear.");
  if (await restoredSend.isDisabled()) throw new Error("LLM Chat send button should be usable after clear.");

  const qaState = await assertWorkspaceQASourceCitations(page, restoredModal, fixture, viewport, artifactRoot);
  await assertMobileishGeometry(page, restoredModal, viewport.name);

  await restoredModal.getByRole("button", { name: "Close LLM Chat" }).click();
  await restoredModal.waitFor({ state: "detached", timeout: 8_000 });
  return {
    prompt,
    assistantText,
    requestCount,
    geometry,
    historyEvidence,
    qaState,
    visualSnapshots: [conversationSnapshot, errorSnapshot]
  };
}

async function assertWorkspaceQASourceCitations(page, modal, fixture, viewport, artifactRoot) {
  const contextSelect = modal.locator(".openai-llm-chat-context-select").first();
  const input = modal.locator(".openai-llm-chat-input").first();
  const sendButton = modal.getByRole("button", { name: "Send" }).first();
  await contextSelect.selectOption("workspace");
  await modal.locator(".openai-llm-chat-tool-event", { hasText: "Workspace search" }).waitFor({ timeout: 8_000 });
  await input.fill("What are the retention complaints?");
  await sendButton.click();
  await modal.getByText(/Found \d+ local sources|Workspace evidence:/).waitFor({ timeout: 10_000 });
  await modal.locator(".openai-llm-chat-message.is-assistant .openai-llm-chat-message-content", { hasText: "retention complaints [S1]" }).waitFor({ timeout: 10_000 });
  const citation = modal.locator(".openai-llm-chat-citation").filter({ hasText: fixture.rowTitle }).first();
  await citation.waitFor({ timeout: 10_000 });
  await citation.getByText("S1").waitFor({ timeout: 8_000 });
  await citation.getByText("Row page").waitFor({ timeout: 8_000 });
  await citation.getByText("Research DB").waitFor({ timeout: 8_000 });
  await citation.focus();
  await assertNoDocumentHorizontalOverflow(page, `llm chat qa citations ${viewport.name}`, 8);
  assertLLMChatGeometry(await readLLMChatGeometry(modal));
  const qaSnapshot = await captureLLMChatSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "qa-sources",
      expectedCitation: fixture.rowTitle
    },
    modal,
    page,
    viewport
  });

  const requests = await page.evaluate(() => window.__lotionLLMChatDebugRequests ?? []);
  const qaRequest = requests.find((request) => request.prompt === "What are the retention complaints?");
  if (!qaRequest) throw new Error(`Expected Q&A debug request, saw ${JSON.stringify(requests)}`);
  if (!qaRequest.system.includes("[S1] Row page: Customer Feedback") || !qaRequest.system.includes("Local workspace Q&A mode")) {
    throw new Error(`Q&A system prompt did not include source grounding: ${qaRequest.system}`);
  }

  await citation.click();
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.rowTitle,
    { timeout: 8_000 }
  );
  return {
    snapshot: qaSnapshot,
    openedTitle: fixture.rowTitle,
    citationText: (await citation.textContent({ timeout: 5_000 }))?.trim() ?? ""
  };
}

async function captureLLMChatSnapshot({ artifactRoot, fixture, metadata, modal, page, viewport }) {
  const geometry = await readLLMChatGeometry(modal);
  const visibleState = await modal.evaluate((dialog) => ({
    providerValue: dialog.querySelector(".openai-llm-chat-provider")?.value ?? "",
    modelValue: dialog.querySelector(".openai-llm-chat-model")?.value ?? "",
    permissionText: dialog.querySelector(".openai-llm-chat-permissions-state")?.textContent?.trim() ?? "",
    statusText: dialog.querySelector(".openai-llm-chat-status")?.textContent?.trim() ?? "",
    historyItems: dialog.querySelectorAll(".openai-llm-chat-history-item").length,
    messages: Array.from(dialog.querySelectorAll(".openai-llm-chat-message")).map((message) => ({
      label: message.querySelector(".openai-llm-chat-message-label")?.textContent?.trim() ?? "",
      content: message.querySelector(".openai-llm-chat-message-content")?.textContent?.trim() ?? ""
    }))
  }));
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: modal,
    metadata: {
      pageId: fixture.pageId,
      pageTitle: fixture.pageTitle,
      geometry,
      visibleState,
      ...metadata
    },
    name: `llm-chat-${metadata.phase}-${viewport.name}`,
    page,
    viewport
  });
  return {
    phase: metadata.phase,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    height: Number(snapshot.rect.height.toFixed(1)),
    width: Number(snapshot.rect.width.toFixed(1))
  };
}

async function inputErrorScenario(modal) {
  const input = modal.locator(".openai-llm-chat-input").first();
  const sendButton = modal.getByRole("button", { name: "Send" }).first();
  await input.fill("Force an error.");
  await sendButton.click();
  await modal.getByText("The LLM request failed.").waitFor({ timeout: 8_000 });
  await modal.locator(".openai-llm-chat-message.is-assistant .openai-llm-chat-message-content", { hasText: "Smoke forced error" }).waitFor({ timeout: 8_000 });
}

async function installLLMChatDebugHook(page) {
  await page.evaluate(() => {
    window.__lotionLLMChatDebugRequests = [];
    window.__lotionLLMChatDebugComplete = async (request) => {
      window.__lotionLLMChatDebugRequests.push(request);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const normalizedPrompt = request.prompt.trim();
      if (normalizedPrompt === "Force an error." || normalizedPrompt.endsWith("User:\nForce an error.")) {
        throw new Error("Smoke forced error");
      }
      if (normalizedPrompt === "What are the retention complaints?") {
        return "The strongest local evidence says customers raised retention complaints [S1].";
      }
      if (normalizedPrompt === "Summarize this smoke page.") {
        return [
          `Smoke response for: ${request.prompt}`,
          "",
          "```lotion-page-update-preview",
          "# Smoke preview",
          "",
          "Updated body preview.",
          "```"
        ].join("\n");
      }
      return `Smoke response for: ${request.prompt}`;
    };
  });
}

async function clearLLMChatDebugHook(page) {
  await page.evaluate(() => {
    delete window.__lotionLLMChatDebugComplete;
    delete window.__lotionLLMChatDebugRequests;
  });
}

function assertLLMChatGeometry(geometry) {
  for (const [key, rect] of Object.entries(geometry)) {
    if (!rect) throw new Error(`Missing LLM Chat geometry for ${key}.`);
    if (rect.width <= 0 || rect.height <= 0) throw new Error(`Invalid LLM Chat ${key} geometry: ${JSON.stringify(rect)}`);
  }
  if (geometry.transcript.bottom > geometry.status.top + 0.5) {
    throw new Error(`LLM Chat transcript overlaps status: ${JSON.stringify(geometry)}`);
  }
  if (geometry.status.bottom > geometry.composer.top + 0.5) {
    throw new Error(`LLM Chat status overlaps composer: ${JSON.stringify(geometry)}`);
  }
  if (geometry.input.bottom > geometry.actions.top + 0.5) {
    throw new Error(`LLM Chat input overlaps actions: ${JSON.stringify(geometry)}`);
  }
  if (geometry.composer.bottom > geometry.chat.bottom + 0.5 || geometry.actions.bottom > geometry.chat.bottom + 0.5) {
    throw new Error(`LLM Chat composer is clipped by chat bounds: ${JSON.stringify(geometry)}`);
  }
  if (geometry.toolbar && geometry.transcript && geometry.toolbar.bottom > geometry.transcript.top + 0.5) {
    throw new Error(`LLM Chat toolbar overlaps transcript: ${JSON.stringify(geometry)}`);
  }
  if (geometry.history && geometry.main && geometry.history.right > geometry.main.right + 0.5) {
    throw new Error(`LLM Chat history has invalid geometry: ${JSON.stringify(geometry)}`);
  }
  if (geometry.controls && geometry.toolbar && geometry.controls.right > geometry.toolbar.right + 1) {
    throw new Error(`LLM Chat controls overflow toolbar: ${JSON.stringify(geometry)}`);
  }
  if (geometry.quickActions && geometry.toolEvents && geometry.quickActions.bottom > geometry.toolEvents.top + 0.5) {
    throw new Error(`LLM Chat quick actions overlap activity strip: ${JSON.stringify(geometry)}`);
  }
  if (geometry.toolEvents && geometry.transcript && geometry.toolEvents.bottom > geometry.transcript.top + 0.5) {
    throw new Error(`LLM Chat activity strip overlaps transcript: ${JSON.stringify(geometry)}`);
  }
  if (geometry.send && geometry.actions && (
    geometry.send.left < geometry.actions.left - 0.5 ||
    geometry.send.right > geometry.actions.right + 0.5 ||
    geometry.send.bottom > geometry.actions.bottom + 0.5
  )) {
    throw new Error(`LLM Chat send button is not contained by action row: ${JSON.stringify(geometry)}`);
  }
}

async function readLLMChatGeometry(modal) {
  return await modal.evaluate((dialog) => {
    const chat = dialog.querySelector(".openai-llm-chat")?.getBoundingClientRect();
    const history = dialog.querySelector(".openai-llm-chat-history")?.getBoundingClientRect();
    const main = dialog.querySelector(".openai-llm-chat-main")?.getBoundingClientRect();
    const toolbar = dialog.querySelector(".openai-llm-chat-toolbar")?.getBoundingClientRect();
    const transcript = dialog.querySelector(".openai-llm-chat-transcript")?.getBoundingClientRect();
    const controls = dialog.querySelector(".openai-llm-chat-controls")?.getBoundingClientRect();
    const quickActions = dialog.querySelector(".openai-llm-chat-quick-actions")?.getBoundingClientRect();
    const toolEvents = dialog.querySelector(".openai-llm-chat-tool-events")?.getBoundingClientRect();
    const status = dialog.querySelector(".openai-llm-chat-status")?.getBoundingClientRect();
    const composer = dialog.querySelector(".openai-llm-chat-composer")?.getBoundingClientRect();
    const inputBox = dialog.querySelector(".openai-llm-chat-input")?.getBoundingClientRect();
    const actions = dialog.querySelector(".openai-llm-chat-actions")?.getBoundingClientRect();
    const send = dialog.querySelector(".openai-llm-chat-send")?.getBoundingClientRect();
    return {
      chat: chat ? rectJson(chat) : null,
      history: history ? rectJson(history) : null,
      main: main ? rectJson(main) : null,
      toolbar: toolbar ? rectJson(toolbar) : null,
      controls: controls ? rectJson(controls) : null,
      quickActions: quickActions ? rectJson(quickActions) : null,
      toolEvents: toolEvents ? rectJson(toolEvents) : null,
      transcript: transcript ? rectJson(transcript) : null,
      status: status ? rectJson(status) : null,
      composer: composer ? rectJson(composer) : null,
      input: inputBox ? rectJson(inputBox) : null,
      actions: actions ? rectJson(actions) : null,
      send: send ? rectJson(send) : null
    };

    function rectJson(rect) {
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };
    }
  });
}

function assertLLMChatVisualState(visual, viewportName) {
  const expectedRegions = [
    "llm-chat-surface",
    "llm-chat-history",
    "llm-chat-toolbar",
    "llm-chat-quick-actions",
    "llm-chat-activity",
    "llm-chat-transcript",
    "llm-chat-composer"
  ];
  for (const region of expectedRegions) {
    if (!visual.testIds.includes(region)) {
      throw new Error(`LLM Chat ${viewportName} missing visual region ${region}: ${JSON.stringify(visual)}`);
    }
  }
  if (visual.rootVisual !== "polished") {
    throw new Error(`LLM Chat ${viewportName} should expose polished visual contract: ${JSON.stringify(visual)}`);
  }
  if (visual.controlsLabel !== "Current assistant controls") {
    throw new Error(`LLM Chat ${viewportName} controls should be labelled: ${JSON.stringify(visual)}`);
  }
  if (visual.activityLabel !== "Assistant activity" || visual.transcriptLive !== "polite") {
    throw new Error(`LLM Chat ${viewportName} activity/transcript semantics regressed: ${JSON.stringify(visual)}`);
  }
  for (const [key, color] of Object.entries(visual.lightSurfaces)) {
    if (!isLightRgb(color, 244)) {
      throw new Error(`LLM Chat ${viewportName} ${key} should use a white/light surface, got ${color}`);
    }
  }
  if ((visual.chatRadius !== 0 && visual.chatRadius < 8) || (visual.messageRadius !== 0 && visual.messageRadius < 8) || visual.inputRadius < 8) {
    throw new Error(`LLM Chat ${viewportName} should use stable rounded surfaces: ${JSON.stringify(visual)}`);
  }
  if (isLightRgb(visual.sendBackground, 210)) {
    throw new Error(`LLM Chat ${viewportName} send action should read as the primary action: ${JSON.stringify(visual)}`);
  }
}

function isLightRgb(color, threshold) {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (!match) return false;
  const [, r, g, b] = match.map(Number);
  return (r + g + b) / 3 >= threshold;
}

async function assertMobileishGeometry(page, modal, viewportName) {
  const previousViewport = page.viewportSize();
  await page.setViewportSize({ width: 720, height: 820 });
  await modal.locator(".openai-llm-chat").waitFor({ timeout: 8_000 });
  const geometry = await readLLMChatGeometry(modal);
  assertLLMChatGeometry(geometry);
  await assertNoDocumentHorizontalOverflow(page, `llm chat mobileish ${viewportName}`, 8);
  if (geometry.history.bottom > geometry.transcript.top + 0.5) {
    throw new Error(`Expected mobile-ish history above transcript without overlap: ${JSON.stringify(geometry)}`);
  }
  if (previousViewport) await page.setViewportSize(previousViewport);
}

async function createLLMChatFixture(viewportName) {
  const safeViewport = viewportName.replace(/[^a-z0-9_-]+/gi, "_");
  const root = await mkdtemp(join(tmpdir(), `lotion-llm-chat-${safeViewport}-`));
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = `pg_llm_chat_smoke_${safeViewport}`;
  const pageTitle = "LLM Chat Smoke Home";
  const databaseId = `db_llm_chat_smoke_${safeViewport}`;
  const databaseName = "Research DB";
  const rowId = `row_customer_feedback_${safeViewport}`;
  const rowTitle = "Customer Feedback";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));
  const rowPageFile = pageMarkdownFileName(rowId, rowTitle);

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_llm_chat_smoke_${safeViewport}`,
    name: "LLM Chat Smoke",
    pages: [pageId],
    databases: [databaseId],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: pageId,
      title: pageTitle,
      now,
      icon: "emoji:✦",
      path: ["Smoke", pageTitle],
      bodyPath: pagePath
    })
  ]);
  await writeFile(join(root, pagePath), `# ${pageTitle}\n\nSmoke workspace for LLM Chat UI coverage.\n`, "utf8");

  await writeJson(join(databaseDir, "schema.json"), {
    id: databaseId,
    name: databaseName,
    icon: "emoji:🧠",
    path: ["Smoke", databaseName],
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "title", name: "Name", type: "title" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true },
      { id: "row_icon", name: "Icon", type: "text", system: true },
      { id: "notes", name: "Notes", type: "text" }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title", "notes"]));
  await writeCsv(join(databaseDir, "data.csv"), ["id", "title", "page_file", "row_icon", "notes"], [
    {
      id: rowId,
      title: rowTitle,
      page_file: rowPageFile,
      row_icon: "emoji:💬",
      notes: "retention complaints customer interviews"
    }
  ]);
  await writeFile(
    join(databaseDir, "pages", rowPageFile),
    `# ${rowTitle}\n\nRetention complaints from customers and support notes.\n`,
    "utf8"
  );
  return { root, pageId, pageTitle, databaseName, rowTitle };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeCsv(path, fields, records) {
  const lines = [
    fields.map(csvCell).join(","),
    ...records.map((record) => fields.map((field) => csvCell(record[field] ?? "")).join(","))
  ];
  await writeFile(path, `${lines.join("\n")}\n`, "utf8");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function workspacePath(group, dbFolder, ...parts) {
  return ["databases", group, dbFolder, ...parts].join("/");
}

function pagesFieldIds() {
  return [
    "id",
    "created_time",
    "updated_time",
    "title",
    "kind",
    "body_path",
    "icon",
    "cover",
    "cover_offset",
    "path",
    "parent_id",
    "tags",
    "date",
    "url",
    "full_width",
    "database_id",
    "row_id",
    "page_file"
  ];
}

function pageRecord({ id, title, now, icon, path, bodyPath }) {
  return {
    id,
    created_time: now,
    updated_time: now,
    title,
    kind: "page",
    body_path: bodyPath,
    icon,
    cover: "",
    cover_offset: "",
    path: serializePathValue(path),
    parent_id: "",
    tags: "",
    date: "",
    url: "",
    full_width: "",
    database_id: PAGES_DATABASE_ID,
    row_id: id,
    page_file: ""
  };
}

function pagesSchema(now) {
  return {
    id: PAGES_DATABASE_ID,
    name: "pages",
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "kind", name: "Kind", type: "text", system: true },
      { id: "body_path", name: "Body path", type: "text", system: true, hidden: true },
      { id: "icon", name: "Icon", type: "text" },
      { id: "cover", name: "Cover", type: "text" },
      { id: "cover_offset", name: "Cover offset", type: "number" },
      { id: "path", name: "Path", type: "text" },
      { id: "parent_id", name: "Parent entity", type: "entity_ref" },
      { id: "tags", name: "Tags", type: "multi_select" },
      { id: "date", name: "Date", type: "text" },
      { id: "url", name: "URL", type: "url" },
      { id: "full_width", name: "Full width", type: "checkbox" },
      { id: "database_id", name: "Database ID", type: "text", system: true, hidden: true },
      { id: "row_id", name: "Row ID", type: "text", system: true, hidden: true },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
    ]
  };
}

function defaultView(databaseId, fields) {
  return {
    id: DEFAULT_VIEW_ID,
    databaseId,
    name: "All",
    type: "table",
    visibleFieldIds: fields,
    fieldOrder: fields,
    wrapFieldIds: fields,
    sorts: [],
    filters: []
  };
}
