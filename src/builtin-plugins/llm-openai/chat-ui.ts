import type { AICompleteRequest, Disposable, PluginContext } from "../../shared/plugin-api.js";
import { completeOpenAILLMRequest, readEnvironmentDefaults, type OpenAILLMInstallOptions } from "./completion.js";
import { activePageSystemContext } from "./page-context.js";
import {
  enabledToolsForMode,
  LLM_TOOL_MODE_LABELS,
  LLM_PROVIDER_DEFINITIONS,
  readLLMToolMode,
  type LLMProviderId,
  type LLMToolMode,
  providerDefinition,
  providerKey,
  readOpenAILLMSettingsForProvider
} from "./settings.js";
import { LOTION_TOOL_CATALOG } from "./tool-catalog.js";
import {
  buildWorkspaceQAContext,
  citationToEntityRef,
  type QASourceCitation
} from "./qa-agent.js";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: QASourceCitation[];
}

interface ChatHistoryEntry extends ChatMessage {
  sessionId: string;
  createdAt: string;
  provider: LLMProviderId;
  model: string;
}

interface ChatSessionSummary {
  sessionId: string;
  title: string;
  subtitle: string;
  messages: ChatMessage[];
  lastAt: string;
}

type LLMChatContext = Pick<PluginContext, "settings" | "storage" | "workspace"> & Partial<Pick<PluginContext, "ui">>;
type LLMChatDebugComplete = (req: AICompleteRequest) => Promise<string> | string;
type ChatContextMode = "current_page" | "workspace" | "none";

interface RenderChatOptions {
  surface?: "modal" | "assistant";
  initialPrompt?: string;
  initialStatus?: string;
}

interface WritePreview {
  title: string;
  markdown: string;
}

const HISTORY_FILE = "chat-history.jsonl";
let activeAssistant: Disposable | null = null;

export const OPENAI_LLM_CHAT_VISUAL_CONTRACT = {
  visualMode: "polished",
  regions: [
    "llm-chat-surface",
    "llm-chat-history",
    "llm-chat-toolbar",
    "llm-chat-quick-actions",
    "llm-chat-activity",
    "llm-chat-transcript",
    "llm-chat-composer"
  ],
  controls: [
    "Assistant tool mode",
    "Assistant context",
    "LLM provider",
    "LLM model",
    "New chat",
    "Clear",
    "Send"
  ]
} as const;

declare global {
  var __lotionLLMChatDebugComplete: LLMChatDebugComplete | undefined;
}

export async function openOpenAILLMChat(
  ctx: PluginContext,
  options: OpenAILLMInstallOptions = {},
  chatOptions: Omit<RenderChatOptions, "surface"> = {}
): Promise<void> {
  if (typeof document !== "undefined" && document.body) {
    activeAssistant?.dispose();
    activeAssistant = openAssistantPanel(ctx, options, chatOptions);
    return;
  }
  await ctx.ui.modal({
    title: "LLM Chat",
    width: 980,
    render: (el) => {
      renderOpenAILLMChat(el, ctx, options, chatOptions);
    }
  });
}

export function renderOpenAILLMChat(
  el: HTMLElement,
  ctx: LLMChatContext,
  options: OpenAILLMInstallOptions = {},
  renderOptions: RenderChatOptions = {}
): Disposable {
  let disposed = false;
  let messages: ChatMessage[] = [];
  let sessionId = newSessionId();
  let sessions: ChatSessionSummary[] = [];
  let currentPreview: WritePreview | null = null;
  let currentContextMode: ChatContextMode = "current_page";

  const style = chatStyleTag();
  const root = document.createElement("div");
  root.className = `openai-llm-chat openai-llm-chat-${renderOptions.surface ?? "modal"}`;
  setDataAttribute(root, "visual", OPENAI_LLM_CHAT_VISUAL_CONTRACT.visualMode);
  setDataAttribute(root, "testid", "llm-chat-surface");
  root.setAttribute("aria-label", "Lotion workspace assistant");

  const history = document.createElement("aside");
  history.className = "openai-llm-chat-history";
  setDataAttribute(history, "testid", "llm-chat-history");
  history.setAttribute("aria-label", "Conversation history");

  const main = document.createElement("section");
  main.className = "openai-llm-chat-main";
  setDataAttribute(main, "testid", "llm-chat-main");

  const toolbar = document.createElement("div");
  toolbar.className = "openai-llm-chat-toolbar";
  setDataAttribute(toolbar, "testid", "llm-chat-toolbar");

  const title = document.createElement("div");
  title.className = "openai-llm-chat-title";
  title.innerHTML = "<strong>Workspace assistant</strong><span class=\"openai-llm-chat-context\">Loading current context...</span>";

  const controls = document.createElement("div");
  controls.className = "openai-llm-chat-controls";
  controls.setAttribute("aria-label", "Current assistant controls");
  setDataAttribute(controls, "testid", "llm-chat-controls");

  const permissionState = document.createElement("span");
  permissionState.className = "openai-llm-chat-permissions-state";
  permissionState.textContent = "Ask before editing";

  const modeSelect = document.createElement("select");
  modeSelect.className = "openai-llm-chat-mode";
  modeSelect.setAttribute("aria-label", "Assistant tool mode");
  modeSelect.innerHTML = [
    ["read_only", "Read-only"],
    ["ask_before_editing", "Ask before editing"],
    ["direct_create", "Direct create"]
  ].map(([value, label]) => `<option value="${value}">${label}</option>`).join("");

  const contextSelect = document.createElement("select");
  contextSelect.className = "openai-llm-chat-context-select";
  contextSelect.setAttribute("aria-label", "Assistant context");
  contextSelect.innerHTML = [
    ["current_page", "Current page"],
    ["workspace", "Workspace search"],
    ["none", "No context"]
  ].map(([value, label]) => `<option value="${value}">${label}</option>`).join("");

  const providerSelect = document.createElement("select");
  providerSelect.className = "openai-llm-chat-provider";
  providerSelect.setAttribute("aria-label", "LLM provider");
  providerSelect.innerHTML = LLM_PROVIDER_DEFINITIONS.map((definition) =>
    `<option value="${definition.id}">${escapeHtml(definition.label)}</option>`
  ).join("");

  const modelListId = `openai-llm-chat-model-options-${Math.random().toString(36).slice(2)}`;
  const modelInput = document.createElement("input");
  modelInput.className = "openai-llm-chat-model";
  modelInput.setAttribute("aria-label", "LLM model");
  modelInput.setAttribute("list", modelListId);
  modelInput.placeholder = "model";

  const modelOptions = document.createElement("datalist");
  modelOptions.id = modelListId;

  const newChatButton = document.createElement("button");
  newChatButton.type = "button";
  newChatButton.className = "openai-llm-chat-new";
  newChatButton.textContent = "New chat";

  controls.append(permissionState, modeSelect, contextSelect, providerSelect, modelInput, modelOptions, newChatButton);
  toolbar.append(title, controls);

  const quickActions = document.createElement("div");
  quickActions.className = "openai-llm-chat-quick-actions";
  setDataAttribute(quickActions, "testid", "llm-chat-quick-actions");
  quickActions.setAttribute("aria-label", "Suggested prompts");
  const quickActionDefs = [
    ["Summarize page", "Summarize the current page in concise bullets."],
    ["Continue writing", "Continue writing from the current page context."],
    ["Action items", "Extract action items from the current page."],
    ["Search workspace", "Search the workspace for related notes and summarize the relevant pages."],
    ["Draft page", "Draft a new page with a clear title and outline."]
  ] as const;
  for (const [label, prompt] of quickActionDefs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "openai-llm-chat-quick-action";
    button.textContent = label;
    button.addEventListener("click", () => {
      input.value = prompt;
      input.focus();
    });
    quickActions.append(button);
  }

  const toolEvents = document.createElement("div");
  toolEvents.className = "openai-llm-chat-tool-events";
  setDataAttribute(toolEvents, "testid", "llm-chat-activity");
  toolEvents.setAttribute("aria-label", "Assistant activity");

  const transcript = document.createElement("div");
  transcript.className = "openai-llm-chat-transcript";
  setDataAttribute(transcript, "testid", "llm-chat-transcript");
  transcript.setAttribute("aria-label", "Conversation transcript");
  transcript.setAttribute("aria-live", "polite");

  const preview = document.createElement("section");
  preview.className = "openai-llm-chat-write-preview";
  preview.setAttribute("aria-label", "Proposed page update");
  preview.hidden = true;

  const status = document.createElement("div");
  status.className = "openai-llm-chat-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = "Ask a question or request a workspace action.";

  const composer = document.createElement("div");
  composer.className = "openai-llm-chat-composer";
  setDataAttribute(composer, "testid", "llm-chat-composer");
  composer.setAttribute("aria-label", "Prompt composer");

  const input = document.createElement("textarea");
  input.className = "openai-llm-chat-input";
  input.rows = 3;
  input.placeholder = "Ask about the current page, search the workspace, or request a draft.";

  const actions = document.createElement("div");
  actions.className = "openai-llm-chat-actions";

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "openai-llm-chat-clear";
  clearButton.textContent = "Clear";

  const sendButton = document.createElement("button");
  sendButton.type = "button";
  sendButton.className = "openai-llm-chat-send";
  sendButton.textContent = "Send";

  actions.append(clearButton, sendButton);
  composer.append(input, actions);
  main.append(toolbar, quickActions, toolEvents, transcript, preview, status, composer);
  root.append(history, main);
  el.replaceChildren(style, root);

  void initialize();

  newChatButton.addEventListener("click", () => {
    sessionId = newSessionId();
    messages = [];
    currentPreview = null;
    status.textContent = "New conversation.";
    renderWritePreview();
    renderMessages();
    renderHistory();
    input.focus();
  });
  clearButton.addEventListener("click", () => {
    messages = [];
    currentPreview = null;
    status.textContent = "Conversation cleared.";
    renderWritePreview();
    renderMessages();
    renderHistory();
  });
  sendButton.addEventListener("click", () => {
    void send();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void send();
  });
  providerSelect.addEventListener("change", () => {
    void applyProvider(providerFromSelect(providerSelect));
  });
  modeSelect.addEventListener("change", () => {
    void ctx.settings.set("toolMode", toolModeFromSelect(modeSelect));
    void applyProvider(providerFromSelect(providerSelect), modelInput.value);
  });
  contextSelect.addEventListener("change", () => {
    currentContextMode = contextModeFromSelect(contextSelect);
    void ctx.settings.set("chatContextMode", currentContextMode);
    renderToolEvents();
  });

  async function initialize(): Promise<void> {
    const defaults = await readEnvironmentDefaults(options);
    if (disposed) return;
    const current = readOpenAILLMSettingsForProvider(
      ctx.settings,
      defaults,
      providerFromStoredSettings()
    );
    currentContextMode = contextModeFromStoredSettings();
    const contextText = await currentContextText(ctx);
    const contextEl = title.querySelector<HTMLElement>(".openai-llm-chat-context");
    if (contextEl) contextEl.textContent = contextText;
    providerSelect.value = current.provider;
    modeSelect.value = readLLMToolMode(ctx.settings);
    contextSelect.value = currentContextMode;
    await applyProvider(current.provider, current.model);
    sessions = groupHistory(await ctx.storage.readJsonl<ChatHistoryEntry>(HISTORY_FILE, { limit: 500 }));
    renderToolEvents();
    renderHistory();
    renderMessages();
    renderWritePreview();
    if (renderOptions.initialPrompt?.trim()) {
      input.value = renderOptions.initialPrompt.trim();
    }
    if (renderOptions.initialStatus?.trim()) {
      status.textContent = renderOptions.initialStatus.trim();
    }
    input.focus();
  }

  async function applyProvider(provider: LLMProviderId, selectedModel?: string): Promise<void> {
    const defaults = await readEnvironmentDefaults(options);
    if (disposed) return;
    const settings = readOpenAILLMSettingsForProvider(ctx.settings, defaults, provider);
    const mode = toolModeFromSelect(modeSelect);
    const enabledTools = enabledToolsForMode(settings.enabledTools, mode);
    providerSelect.value = provider;
    permissionState.textContent = LLM_TOOL_MODE_LABELS[mode];
    permissionState.title = enabledTools.map(toolLabel).join(", ");
    modelInput.value = selectedModel ?? settings.model;
    modelInput.placeholder = providerDefinition(provider).defaultModel || "model";
    modelOptions.innerHTML = modelChoices(provider, modelInput.value).map((model) =>
      `<option value="${escapeAttr(model)}"></option>`
    ).join("");
    renderToolEvents(enabledTools);
  }

  async function send(): Promise<void> {
    const text = input.value.trim();
    if (!text || sendButton.disabled) return;
    input.value = "";
    const previousMessages = messages.slice();
    const provider = providerFromSelect(providerSelect);
    const settings = readOpenAILLMSettingsForProvider(
      ctx.settings,
      await readEnvironmentDefaults(options),
      provider
    );
    const mode = toolModeFromSelect(modeSelect);
    const enabledTools = enabledToolsForMode(settings.enabledTools, mode);
    const model = modelInput.value.trim() || settings.model;
    await ctx.settings.set("provider", provider);
    await ctx.settings.set(providerKey(provider, "model"), model);
    await ctx.settings.set("toolMode", mode);
    await ctx.settings.set("chatContextMode", currentContextMode);

    const userMessage: ChatMessage = { role: "user", content: text };
    messages.push(userMessage);
    await appendHistory(userMessage, provider, model);
    renderMessages();
    renderHistory();
    setBusy(true);
    status.textContent = "Thinking...";
    try {
      const qaContext = currentContextMode === "workspace"
        ? await buildWorkspaceQAContext(ctx, text, { limit: 5 })
        : null;
      if (qaContext) {
        status.textContent = qaContext.status === "ready"
          ? `Found ${qaContext.citations.length} local sources.`
          : `Workspace evidence: ${qaContext.note}`;
      }
      const answer = await completeLLMChat(ctx, options, {
        prompt: promptWithTranscript(previousMessages, text),
        system: [
          await systemContextForMode(ctx, currentContextMode),
          qaContext?.system,
          `Tool mode: ${LLM_TOOL_MODE_LABELS[mode]}.`,
          writePolicyForMode(mode),
          "You are chatting in Lotion's page assistant. Answer directly, cite provided Q&A sources when present, and use Lotion workspace tools when helpful."
        ].filter(Boolean).join("\n\n")
      }, { provider, protocol: settings.protocol, model, baseUrl: settings.baseUrl, enabledTools });
      const parsed = extractWritePreview(answer.trim() || "(empty response)");
      currentPreview = parsed.preview;
      const assistantMessage: ChatMessage = { role: "assistant", content: parsed.content, citations: qaContext?.citations };
      messages.push(assistantMessage);
      await appendHistory(assistantMessage, provider, model);
      status.textContent = "Ready.";
    } catch (error) {
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: error instanceof Error ? error.message : String(error)
      };
      messages.push(assistantMessage);
      await appendHistory(assistantMessage, provider, model);
      status.textContent = "The LLM request failed.";
    } finally {
      setBusy(false);
      renderMessages();
      renderHistory();
      renderWritePreview();
      renderToolEvents(enabledTools);
    }
  }

  async function appendHistory(message: ChatMessage, provider: LLMProviderId, model: string): Promise<void> {
    const entry: ChatHistoryEntry = {
      ...message,
      sessionId,
      provider,
      model,
      createdAt: new Date().toISOString()
    };
    await ctx.storage.appendJsonl(HISTORY_FILE, entry);
    sessions = groupHistory([...(await ctx.storage.readJsonl<ChatHistoryEntry>(HISTORY_FILE, { limit: 500 }))]);
  }

  function renderHistory(): void {
    const heading = document.createElement("div");
    heading.className = "openai-llm-chat-history-heading";
    heading.textContent = "History";
    const list = document.createElement("div");
    list.className = "openai-llm-chat-history-list";
    for (const session of sessions.slice(0, 12)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `openai-llm-chat-history-item${session.sessionId === sessionId ? " is-active" : ""}`;
      button.innerHTML = `<strong>${escapeHtml(session.title)}</strong><span>${escapeHtml(session.subtitle)}</span>`;
      button.addEventListener("click", () => {
        sessionId = session.sessionId;
        messages = session.messages.slice();
        status.textContent = "Loaded conversation.";
        renderMessages();
        renderHistory();
      });
      list.append(button);
    }
    if (sessions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "openai-llm-chat-history-empty";
      empty.textContent = "No saved chats yet.";
      list.append(empty);
    }
    history.replaceChildren(heading, list);
  }

  function renderMessages(): void {
    transcript.replaceChildren();
    if (messages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "openai-llm-chat-empty";
      empty.innerHTML = "<strong>No conversation yet.</strong><span>Pick a model and ask Lotion about the current workspace.</span>";
      transcript.append(empty);
      return;
    }
    for (const message of messages) {
      const item = document.createElement("article");
      item.className = `openai-llm-chat-message ${message.role === "user" ? "is-user" : "is-assistant"}`;
      const label = document.createElement("div");
      label.className = "openai-llm-chat-message-label";
      label.textContent = message.role === "user" ? "You" : "LLM";
      const content = document.createElement("div");
      content.className = "openai-llm-chat-message-content";
      content.textContent = message.content;
      item.append(label, content);
      if (message.role === "assistant" && message.citations?.length) {
        item.append(renderCitations(message.citations));
      }
      transcript.append(item);
    }
    transcript.scrollTop = transcript.scrollHeight;
  }

  function renderCitations(citations: QASourceCitation[]): HTMLElement {
    const list = document.createElement("div");
    list.className = "openai-llm-chat-citations";
    list.setAttribute("aria-label", "Answer sources");
    for (const citation of citations) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `openai-llm-chat-citation ${citation.kind}`;
      setDataAttribute(button, "sourceId", citation.id);
      const kind = citation.kind === "database" ? "Database" : citation.kind === "rowPage" ? "Row page" : "Page";
      button.innerHTML = [
        `<strong>${escapeHtml(citation.id)}</strong>`,
        `<span>${escapeHtml(kind)} · ${escapeHtml(citation.title)}</span>`,
        `<small>${escapeHtml(citation.entityPath || citation.subtitle)}</small>`
      ].join("");
      button.addEventListener("click", () => {
        const ref = citationToEntityRef(citation);
        if (!ref || !ctx.ui?.openEntity) {
          status.textContent = `Source ${citation.id} cannot be opened in this context.`;
          return;
        }
        ctx.ui.openEntity(ref);
        status.textContent = `Opened source ${citation.id}.`;
      });
      list.append(button);
    }
    return list;
  }

  function renderToolEvents(enabledTools?: string[]): void {
    const mode = toolModeFromSelect(modeSelect);
    const tools = enabledTools ?? enabledToolsForMode(
      readOpenAILLMSettingsForProvider(ctx.settings, {}, providerFromSelect(providerSelect)).enabledTools,
      mode
    );
    const rows = [
      ["Context", contextLabel(currentContextMode)],
      ["Mode", LLM_TOOL_MODE_LABELS[mode]],
      ["Tools", `${tools.length} available`]
    ];
    toolEvents.replaceChildren(...rows.map(([label, value]) => {
      const item = document.createElement("span");
      item.className = "openai-llm-chat-tool-event";
      setDataAttribute(item, "kind", label.toLowerCase());
      item.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span>`;
      return item;
    }));
  }

  function renderWritePreview(): void {
    preview.replaceChildren();
    if (!currentPreview) {
      preview.hidden = true;
      return;
    }
    preview.hidden = false;
    const heading = document.createElement("div");
    heading.className = "openai-llm-chat-write-preview-heading";
    heading.innerHTML = `<strong>Proposed page update</strong><span>${escapeHtml(currentPreview.title)}</span>`;
    const code = document.createElement("pre");
    code.textContent = currentPreview.markdown;
    const actions = document.createElement("div");
    actions.className = "openai-llm-chat-write-preview-actions";
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "Apply";
    apply.addEventListener("click", () => {
      status.textContent = "Preview application needs explicit page targeting; no changes were applied.";
    });
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        void navigator.clipboard.writeText(currentPreview?.markdown ?? "");
      }
      status.textContent = "Preview copied.";
    });
    const discard = document.createElement("button");
    discard.type = "button";
    discard.textContent = "Discard";
    discard.addEventListener("click", () => {
      currentPreview = null;
      status.textContent = "Preview discarded.";
      renderWritePreview();
    });
    actions.append(apply, copy, discard);
    preview.append(heading, code, actions);
  }

  function setBusy(busy: boolean): void {
    input.disabled = busy;
    sendButton.disabled = busy;
    clearButton.disabled = busy;
    providerSelect.disabled = busy;
    modelInput.disabled = busy;
    modeSelect.disabled = busy;
    contextSelect.disabled = busy;
  }

  function providerFromStoredSettings(): LLMProviderId {
    const value = ctx.settings.get<unknown>("provider");
    if (value === "deepseek" || value === "custom") return value;
    return "openai";
  }

  function contextModeFromStoredSettings(): ChatContextMode {
    const value = ctx.settings.get<unknown>("chatContextMode");
    if (value === "workspace" || value === "none") return value;
    return "current_page";
  }

  return {
    dispose: () => {
      disposed = true;
      el.replaceChildren();
    }
  };
}

function openAssistantPanel(
  ctx: PluginContext,
  options: OpenAILLMInstallOptions,
  chatOptions: Omit<RenderChatOptions, "surface"> = {}
): Disposable {
  const shell = document.createElement("aside");
  shell.className = "openai-llm-assistant-shell";
  shell.setAttribute("role", "complementary");
  shell.setAttribute("aria-label", "LLM Chat assistant");

  const panel = document.createElement("section");
  panel.className = "openai-llm-assistant-panel";

  const header = document.createElement("div");
  header.className = "openai-llm-assistant-header";
  header.innerHTML = "<div><strong>LLM Chat</strong><span>Page assistant</span></div>";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "openai-llm-assistant-close";
  close.setAttribute("aria-label", "Close LLM Chat");
  close.textContent = "×";
  header.append(close);

  const body = document.createElement("div");
  body.className = "openai-llm-assistant-body";
  panel.append(header, body);
  shell.append(panel);
  document.body.append(shell);

  const chat = renderOpenAILLMChat(body, ctx, options, { ...chatOptions, surface: "assistant" });
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") dispose();
  };
  const dispose = () => {
    window.removeEventListener("keydown", onKeyDown, true);
    chat.dispose();
    shell.remove();
    if (activeAssistant?.dispose === dispose) activeAssistant = null;
  };
  close.addEventListener("click", dispose);
  window.addEventListener("keydown", onKeyDown, true);
  return { dispose };
}

async function completeLLMChat(
  ctx: LLMChatContext,
  options: OpenAILLMInstallOptions,
  request: AICompleteRequest,
  overrides: Parameters<typeof completeOpenAILLMRequest>[3]
): Promise<string> {
  const debugComplete = globalThis.__lotionLLMChatDebugComplete;
  if (debugComplete) return debugComplete(request);
  return completeOpenAILLMRequest(ctx, options, request, overrides);
}

function promptWithTranscript(previousMessages: ChatMessage[], currentPrompt: string): string {
  if (previousMessages.length === 0) return currentPrompt;
  const transcript = previousMessages
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n");
  return [
    "Conversation so far:",
    transcript,
    "",
    "User:",
    currentPrompt
  ].join("\n");
}

function toolModeFromSelect(select: HTMLSelectElement): LLMToolMode {
  if (select.value === "read_only" || select.value === "direct_create") return select.value;
  return "ask_before_editing";
}

function contextModeFromSelect(select: HTMLSelectElement): ChatContextMode {
  if (select.value === "workspace" || select.value === "none") return select.value;
  return "current_page";
}

function toolLabel(name: string): string {
  return LOTION_TOOL_CATALOG.find((tool) => tool.name === name)?.label ?? name;
}

function contextLabel(mode: ChatContextMode): string {
  if (mode === "workspace") return "Workspace search";
  if (mode === "none") return "No context";
  return "Current page";
}

async function systemContextForMode(ctx: LLMChatContext, mode: ChatContextMode): Promise<string> {
  if (mode === "none") return "";
  if (mode === "workspace") {
    return "Workspace context is available through read-only Lotion search and database/page read tools.";
  }
  return (await activePageSystemContext(ctx)) ?? "";
}

function writePolicyForMode(mode: LLMToolMode): string {
  if (mode === "read_only") {
    return "Read-only mode: do not call write tools or claim that workspace changes were made.";
  }
  if (mode === "direct_create") {
    return [
      "Direct create mode: creating new pages or databases may be allowed when the user asks.",
      "Never replace an existing page directly. For edits, return a fenced lotion-page-update-preview block for user review."
    ].join(" ");
  }
  return [
    "Ask before editing mode: do not call write tools.",
    "When suggesting edits, return a fenced lotion-page-update-preview block so the user can review and explicitly apply or discard it."
  ].join(" ");
}

function extractWritePreview(raw: string): { content: string; preview: WritePreview | null } {
  const match = /```lotion-page-update-preview\s*\n([\s\S]*?)\n```/i.exec(raw);
  if (!match) return { content: raw, preview: null };
  const markdown = match[1].trimEnd();
  const content = raw.replace(match[0], "").trim() || "I prepared a page update preview for review.";
  const titleMatch = /^#\s+(.+)$/m.exec(markdown);
  return {
    content,
    preview: {
      title: titleMatch?.[1]?.trim() || "Untitled preview",
      markdown
    }
  };
}

function groupHistory(entries: ChatHistoryEntry[]): ChatSessionSummary[] {
  const byId = new Map<string, ChatHistoryEntry[]>();
  for (const entry of entries) {
    if (!entry.sessionId || !entry.content || (entry.role !== "user" && entry.role !== "assistant")) continue;
    const next = byId.get(entry.sessionId) ?? [];
    next.push(entry);
    byId.set(entry.sessionId, next);
  }
  return Array.from(byId.entries())
    .map(([id, rows]) => {
      const firstUser = rows.find((row) => row.role === "user");
      const last = rows[rows.length - 1];
      return {
        sessionId: id,
        title: truncate(firstUser?.content || "Untitled chat", 42),
        subtitle: `${last?.model || "model"} · ${rows.length} messages`,
        messages: rows.map(({ role, content }) => ({ role, content })),
        lastAt: last?.createdAt ?? ""
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

function providerFromSelect(select: HTMLSelectElement): LLMProviderId {
  if (select.value === "deepseek" || select.value === "custom") return select.value;
  return "openai";
}

function modelChoices(provider: LLMProviderId, selected: string): string[] {
  const definition = providerDefinition(provider);
  return Array.from(new Set([
    ...definition.models,
    definition.defaultModel,
    selected
  ].map((value) => value.trim()).filter(Boolean)));
}

async function currentContextText(ctx: LLMChatContext): Promise<string> {
  try {
    const page = await ctx.workspace.activePage();
    if (!page) return "Workspace context";
    const title = page.meta.title.trim() || "Untitled";
    const path = page.meta.path?.filter(Boolean).join(" / ");
    return path ? `Current page: ${path}` : `Current page: ${title}`;
  } catch {
    return "Workspace context";
  }
}

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function truncate(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function setDataAttribute(element: HTMLElement, key: string, value: string): void {
  if (element.dataset) {
    element.dataset[key] = value;
    return;
  }
  const attr = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  element.setAttribute(`data-${attr}`, value);
}

function chatStyleTag(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
    .openai-llm-assistant-shell { position: fixed; inset: 31px 0 0 auto; width: min(440px, calc(100vw - 280px)); z-index: 70; display: flex; justify-content: flex-end; pointer-events: none; }
    .openai-llm-assistant-panel { width: 100%; height: 100%; border-left: 1px solid var(--rule); background: var(--paper); box-shadow: -18px 0 40px color-mix(in srgb, var(--ink-1) 8%, transparent); display: grid; grid-template-rows: auto minmax(0, 1fr); pointer-events: auto; }
    .openai-llm-assistant-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 14px; border-bottom: 1px solid var(--rule); background: var(--paper); }
    .openai-llm-assistant-header div { display: grid; gap: 2px; }
    .openai-llm-assistant-header strong { font-size: 15px; color: var(--ink-1); }
    .openai-llm-assistant-header span { font-size: 12px; color: var(--ink-3); }
    .openai-llm-assistant-close { width: 28px; height: 28px; border: 1px solid transparent; border-radius: var(--r-2); background: transparent; color: var(--ink-3); font-size: 20px; line-height: 1; cursor: pointer; }
    .openai-llm-assistant-close:hover, .openai-llm-assistant-close:focus-visible { border-color: var(--rule); background: var(--sand); color: var(--ink-1); outline: none; }
    .openai-llm-assistant-body { min-height: 0; overflow: hidden; }
    .openai-llm-chat { display: grid; grid-template-columns: 196px minmax(0, 1fr); min-height: 560px; max-height: min(76vh, 760px); border: 1px solid var(--rule); border-radius: var(--r-3); overflow: hidden; background: var(--paper); }
    .openai-llm-chat-assistant { height: 100%; min-height: 0; max-height: none; border: 0; border-radius: 0; grid-template-columns: 1fr; }
    .openai-llm-chat-history { border-right: 1px solid var(--rule); background: var(--sand); padding: 10px; overflow: auto; }
    .openai-llm-chat-assistant .openai-llm-chat-history { border-right: 0; border-bottom: 1px solid var(--rule); max-height: 108px; }
    .openai-llm-chat-history-heading { color: var(--ink-4); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 10px; }
    .openai-llm-chat-history-list { display: grid; gap: 6px; }
    .openai-llm-chat-history-item { width: 100%; display: grid; gap: 2px; text-align: left; border: 1px solid transparent; border-radius: var(--r-2); background: transparent; color: var(--ink-1); padding: 7px 8px; cursor: pointer; font: inherit; }
    .openai-llm-chat-history-item:hover, .openai-llm-chat-history-item:focus-visible { background: var(--paper); border-color: var(--rule); outline: 2px solid var(--accent-ring); outline-offset: 1px; }
    .openai-llm-chat-history-item.is-active { background: var(--paper); border-color: color-mix(in srgb, var(--accent) 26%, transparent); box-shadow: inset 3px 0 0 var(--accent); }
    .openai-llm-chat-history-item strong { font-size: 13px; font-weight: 650; line-height: 1.3; }
    .openai-llm-chat-history-item span, .openai-llm-chat-history-empty { color: var(--ink-4); font-size: 12px; line-height: 1.3; }
    .openai-llm-chat-main { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto auto auto minmax(0, 1fr) auto auto auto; background: var(--paper); }
    .openai-llm-chat-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--rule); padding: 12px 14px 10px; background: var(--paper); }
    .openai-llm-chat-assistant .openai-llm-chat-toolbar { flex-direction: column; align-items: stretch; }
    .openai-llm-chat-title { display: grid; gap: 2px; min-width: 190px; }
    .openai-llm-chat-title strong { color: var(--ink-1); font-size: 15px; }
    .openai-llm-chat-title span { color: var(--ink-4); font-size: 12px; }
    .openai-llm-chat-controls { display: flex; justify-content: flex-end; gap: 6px; min-width: 0; flex-wrap: wrap; }
    .openai-llm-chat-assistant .openai-llm-chat-controls { justify-content: flex-start; }
    .openai-llm-chat-permissions-state { display: inline-flex; align-items: center; min-height: 30px; border: 1px solid color-mix(in srgb, var(--success) 18%, transparent); border-radius: 999px; background: var(--success-soft); color: var(--success); padding: 0 10px; font-size: 12px; font-weight: 650; white-space: nowrap; }
    .openai-llm-chat-provider, .openai-llm-chat-model, .openai-llm-chat-new, .openai-llm-chat-mode, .openai-llm-chat-context-select { min-height: 30px; border: 1px solid var(--rule); border-radius: var(--r-2); background: var(--paper); color: var(--ink-1); font: inherit; font-size: 13px; }
    .openai-llm-chat-provider { width: 134px; }
    .openai-llm-chat-mode { width: 154px; }
    .openai-llm-chat-context-select { width: 146px; }
    .openai-llm-chat-model { width: 190px; padding: 4px 8px; }
    .openai-llm-chat-new { padding: 4px 10px; cursor: pointer; }
    .openai-llm-chat-new:hover, .openai-llm-chat-new:focus-visible { background: var(--sand); border-color: var(--rule-strong); outline: 2px solid var(--accent-ring); outline-offset: 1px; }
    .openai-llm-chat-quick-actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 9px 14px; border-bottom: 1px solid var(--rule); background: var(--paper); }
    .openai-llm-chat-quick-action { border: 1px solid transparent; border-radius: var(--r-2); background: transparent; color: var(--ink-2); padding: 5px 8px; font: inherit; font-size: 12px; cursor: pointer; }
    .openai-llm-chat-quick-action:hover, .openai-llm-chat-quick-action:focus-visible { background: var(--sand); border-color: var(--rule); outline: 2px solid var(--accent-ring); outline-offset: 1px; }
    .openai-llm-chat-tool-events { display: flex; flex-wrap: wrap; gap: 6px; padding: 7px 14px; border-bottom: 1px solid var(--rule); background: var(--sand); }
    .openai-llm-chat-tool-event { display: inline-flex; align-items: center; gap: 5px; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--ink-3); padding: 2px 2px; font-size: 11px; line-height: 1.3; }
    .openai-llm-chat-tool-event strong { color: var(--ink-2); font-weight: 650; }
    .openai-llm-chat-tool-event span { color: var(--ink-3); }
    .openai-llm-chat-transcript { overflow: auto; display: grid; align-content: start; gap: 14px; padding: 18px 20px; background: var(--paper); }
    .openai-llm-chat-assistant .openai-llm-chat-transcript { padding: 14px; }
    .openai-llm-chat-empty { display: grid; place-items: center; align-content: center; gap: 6px; min-height: 220px; color: var(--ink-4); text-align: center; }
    .openai-llm-chat-empty strong { color: var(--ink-2); font-size: 15px; }
    .openai-llm-chat-empty span { font-size: 13px; }
    .openai-llm-chat-message { display: grid; gap: 5px; max-width: min(86%, 680px); }
    .openai-llm-chat-message.is-user { justify-self: end; }
    .openai-llm-chat-message.is-assistant { justify-self: start; }
    .openai-llm-chat-message-label { color: var(--ink-4); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    .openai-llm-chat-message-content { white-space: pre-wrap; border: 1px solid var(--rule); border-radius: var(--r-3); padding: 10px 12px; background: var(--paper); color: var(--ink-1); line-height: 1.5; font-size: 14px; box-shadow: var(--shadow-1); }
    .openai-llm-chat-message.is-user .openai-llm-chat-message-content { background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 24%, transparent); }
    .openai-llm-chat-citations { display: grid; gap: 6px; }
    .openai-llm-chat-citation { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 8px; row-gap: 2px; text-align: left; border: 1px solid var(--rule); border-radius: var(--r-3); background: var(--paper); color: var(--ink-2); padding: 8px 10px; font: inherit; cursor: pointer; }
    .openai-llm-chat-citation:hover, .openai-llm-chat-citation:focus-visible { background: var(--sand); border-color: var(--rule-strong); outline: 2px solid var(--accent-ring); outline-offset: 1px; }
    .openai-llm-chat-citation strong { align-self: start; color: var(--accent); font-size: 12px; line-height: 1.4; }
    .openai-llm-chat-citation span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 650; }
    .openai-llm-chat-citation small { grid-column: 2; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-4); font-size: 11px; line-height: 1.4; }
    .openai-llm-chat-write-preview { border-top: 1px solid var(--rule); background: var(--paper); padding: 10px 14px; display: grid; gap: 8px; max-height: 180px; overflow: auto; box-shadow: 0 -6px 18px color-mix(in srgb, var(--ink-1) 3%, transparent); }
    .openai-llm-chat-write-preview[hidden] { display: none; }
    .openai-llm-chat-write-preview-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--ink-3); }
    .openai-llm-chat-write-preview-heading strong { color: var(--ink-1); }
    .openai-llm-chat-write-preview pre { margin: 0; max-height: 92px; overflow: auto; border: 1px solid var(--rule); border-radius: var(--r-2); background: var(--sand); padding: 8px; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--ink-2); white-space: pre-wrap; }
    .openai-llm-chat-write-preview-actions { display: flex; justify-content: flex-end; gap: 6px; }
    .openai-llm-chat-write-preview-actions button { min-height: 28px; border: 1px solid var(--rule); border-radius: var(--r-2); background: var(--paper); color: var(--ink-1); font: inherit; font-size: 12px; padding: 4px 9px; cursor: pointer; }
    .openai-llm-chat-write-preview-actions button:hover, .openai-llm-chat-write-preview-actions button:focus-visible { background: var(--sand); border-color: var(--rule-strong); outline: none; }
    .openai-llm-chat-status { min-height: 20px; border-top: 1px solid var(--rule); color: var(--ink-3); font-size: 12px; padding: 6px 14px; background: var(--paper); }
    .openai-llm-chat-composer { display: grid; gap: 8px; padding: 12px 14px 14px; border-top: 1px solid var(--rule); background: var(--paper); }
    .openai-llm-chat-input { width: 100%; box-sizing: border-box; resize: vertical; min-height: 78px; border: 1px solid var(--rule-strong); border-radius: var(--r-3); padding: 10px 12px; background: var(--paper); color: var(--ink-1); font: inherit; font-size: 14px; box-shadow: var(--shadow-1); }
    .openai-llm-chat-input:focus, .openai-llm-chat-model:focus, .openai-llm-chat-provider:focus, .openai-llm-chat-mode:focus, .openai-llm-chat-context-select:focus { outline: 2px solid var(--accent-ring); outline-offset: 2px; }
    .openai-llm-chat-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .openai-llm-chat-actions button { min-height: 30px; border: 1px solid var(--rule); border-radius: var(--r-2); padding: 5px 12px; background: var(--paper); color: var(--ink-1); font: inherit; cursor: pointer; }
    .openai-llm-chat-actions button:hover:not(:disabled) { background: var(--sand); border-color: var(--rule-strong); }
    .openai-llm-chat-actions button:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 2px; }
    .openai-llm-chat-send { font-weight: 650; background: var(--accent) !important; border-color: var(--accent) !important; color: var(--paper) !important; }
    .openai-llm-chat-send:hover:not(:disabled) { background: var(--accent-hover) !important; border-color: var(--accent-hover) !important; }
    .openai-llm-chat-clear { color: var(--ink-3) !important; }
    .openai-llm-chat-actions button:disabled, .openai-llm-chat-provider:disabled, .openai-llm-chat-model:disabled, .openai-llm-chat-mode:disabled, .openai-llm-chat-context-select:disabled { cursor: default; opacity: 0.55; }
    @media (max-width: 760px) {
      .openai-llm-assistant-shell { inset: 31px 0 0 0; width: 100vw; }
      .openai-llm-chat { grid-template-columns: 1fr; min-height: 620px; }
      .openai-llm-chat-history { border-right: 0; border-bottom: 1px solid var(--rule); max-height: 140px; }
      .openai-llm-chat-toolbar { align-items: stretch; flex-direction: column; }
      .openai-llm-chat-controls { justify-content: flex-start; }
      .openai-llm-chat-provider, .openai-llm-chat-model, .openai-llm-chat-mode, .openai-llm-chat-context-select { width: min(100%, 220px); }
    }
  `;
  return style;
}
