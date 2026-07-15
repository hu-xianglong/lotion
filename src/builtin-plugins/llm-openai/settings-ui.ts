import type { AICompleteRequest, Disposable, PluginContext } from "../../shared/plugin-api.js";
import type { OpenAILLMInstallOptions } from "./completion.js";
import {
  LLM_PROVIDER_DEFINITIONS,
  type LLMProviderId,
  type LLMProtocol,
  maskSecret,
  providerDefinition,
  providerKey,
  readOpenAILLMSettings,
  writeOpenAILLMSettings
} from "./settings.js";
import { LOTION_TOOL_CATALOG } from "./tool-catalog.js";

export function renderOpenAILLMSettings(
  el: HTMLElement,
  ctx: PluginContext,
  options: OpenAILLMInstallOptions = {}
): Disposable {
  let disposed = false;
  let renderVersion = 0;

  const render = async () => {
    const version = ++renderVersion;
    const defaults = await readEnvironmentDefaults(options);
    if (disposed || version !== renderVersion) return;
    const settings = readOpenAILLMSettings(ctx.settings, defaults);
    const initialProviderState = providerState(settings.provider, ctx, defaults);
    const modelListId = `openai-llm-model-options-${version}`;
    el.innerHTML = "";
    el.appendChild(styleTag());
    const root = document.createElement("div");
    root.className = "openai-llm-settings";
    root.innerHTML = `
      <div class="openai-llm-panel">
        <div class="openai-llm-header">
          <div>
            <h3>LLM Providers</h3>
            <p>Configure OpenAI or OpenAI-compatible providers and allow them to use Lotion workspace tools.</p>
          </div>
          <span class="openai-llm-status">${escapeHtml(initialProviderState.status)}</span>
        </div>
        <label>
          <span>Provider</span>
          <select class="openai-llm-provider">
            ${LLM_PROVIDER_DEFINITIONS.map((definition) => (
              `<option value="${definition.id}" ${definition.id === settings.provider ? "selected" : ""}>${escapeHtml(definition.label)}</option>`
            )).join("")}
          </select>
        </label>
        <label>
          <span>API token</span>
          <input class="openai-llm-token" type="password" autocomplete="off" placeholder="${escapeAttr(initialProviderState.tokenPlaceholder)}" value="" />
        </label>
        <label>
          <span>Base URL</span>
          <input class="openai-llm-base-url" type="text" value="${escapeAttr(settings.baseUrl)}" placeholder="${escapeAttr(initialProviderState.definition.defaultBaseUrl)}" />
        </label>
        <label>
          <span>Endpoint protocol</span>
          <select class="openai-llm-protocol">
            <option value="responses" ${settings.protocol === "responses" ? "selected" : ""}>Responses API</option>
            <option value="chat_completions" ${settings.protocol === "chat_completions" ? "selected" : ""}>Chat Completions</option>
          </select>
        </label>
        <label>
          <span>Model</span>
          <input class="openai-llm-model" type="text" list="${modelListId}" value="${escapeAttr(settings.model)}" placeholder="${escapeAttr(initialProviderState.definition.defaultModel || "model-name")}" />
          <datalist id="${modelListId}" class="openai-llm-model-options"></datalist>
        </label>
        <fieldset class="openai-llm-permissions">
          <legend>Lotion API permissions</legend>
          <p>Choose which external-facing Lotion APIs the model may call. New installs default to all tools enabled.</p>
          <div class="openai-llm-permission-grid">
            ${LOTION_TOOL_CATALOG.map((tool) => `
              <label class="openai-llm-check">
                <input class="openai-llm-tool-permission" type="checkbox" value="${escapeAttr(tool.name)}" ${settings.enabledTools.includes(tool.name) ? "checked" : ""} />
                <span>${escapeHtml(tool.label)}</span>
                <small>${tool.category === "write" ? "Can change workspace data" : "Read-only"}</small>
              </label>
            `).join("")}
          </div>
        </fieldset>
        <label>
          <span>Max tool iterations</span>
          <input class="openai-llm-iterations" type="number" min="1" max="10" value="${settings.maxToolIterations}" />
        </label>
        <div class="openai-llm-actions">
          <button class="openai-llm-save" type="button">Save</button>
          <button class="openai-llm-clear" type="button">Clear token</button>
        </div>
      </div>
      <div class="openai-llm-panel">
        <h3>Test prompt</h3>
        <textarea class="openai-llm-prompt" rows="4" placeholder="Ask Lotion to summarize, search, create, or update using the available tools."></textarea>
        <div class="openai-llm-actions">
          <button class="openai-llm-run" type="button">Run prompt</button>
        </div>
        <pre class="openai-llm-output"></pre>
      </div>
    `;
    el.appendChild(root);

    const providerSelect = root.querySelector<HTMLSelectElement>(".openai-llm-provider");
    const apiKey = root.querySelector<HTMLInputElement>(".openai-llm-token");
    const status = root.querySelector<HTMLElement>(".openai-llm-status");
    const baseUrl = root.querySelector<HTMLInputElement>(".openai-llm-base-url");
    const protocol = root.querySelector<HTMLSelectElement>(".openai-llm-protocol");
    const modelInput = root.querySelector<HTMLInputElement>(".openai-llm-model");
    const modelOptions = root.querySelector<HTMLDataListElement>(".openai-llm-model-options");
    const iterations = root.querySelector<HTMLInputElement>(".openai-llm-iterations");
    const output = root.querySelector<HTMLPreElement>(".openai-llm-output");

    applyProvider(settings.provider, settings.model);
    providerSelect?.addEventListener("change", () => {
      applyProvider(providerFromSelect(providerSelect), undefined);
    });

    root.querySelector<HTMLButtonElement>(".openai-llm-save")?.addEventListener("click", async () => {
      const provider = providerFromSelect(providerSelect);
      const currentProviderState = providerState(provider, ctx, defaults);
      await writeOpenAILLMSettings(ctx.settings, {
        provider,
        providerLabel: currentProviderState.definition.label,
        protocol: selectedProtocol(protocol, provider),
        apiKey: apiKey?.value.trim() || currentProviderState.savedApiKey,
        model: selectedModel(modelInput, provider),
        baseUrl: baseUrl?.value.trim() || currentProviderState.definition.defaultBaseUrl,
        enabledTools: selectedEnabledTools(root),
        maxToolIterations: Number(iterations?.value ?? settings.maxToolIterations)
      });
      void render();
    });

    root.querySelector<HTMLButtonElement>(".openai-llm-clear")?.addEventListener("click", async () => {
      await ctx.settings.delete(providerKey(providerFromSelect(providerSelect), "apiKey"));
      void render();
    });

    root.querySelector<HTMLButtonElement>(".openai-llm-run")?.addEventListener("click", async () => {
      const prompt = root.querySelector<HTMLTextAreaElement>(".openai-llm-prompt")?.value.trim();
      if (!prompt || !output) return;
      output.textContent = "Running...";
      try {
        const response = await ctx.ai.complete({
          prompt,
          system: "You are running inside the OpenAI LLM plugin settings test panel."
        } satisfies AICompleteRequest);
        output.textContent = response;
      } catch (error) {
        output.textContent = error instanceof Error ? error.message : String(error);
      }
    });

    function applyProvider(provider: LLMProviderId, selectedValue: string | undefined): void {
      const state = providerState(provider, ctx, defaults);
      if (status) status.textContent = state.status;
      if (apiKey) {
        apiKey.value = "";
        apiKey.placeholder = state.tokenPlaceholder;
      }
      if (baseUrl) {
        baseUrl.value = state.baseUrl;
        baseUrl.placeholder = state.definition.defaultBaseUrl;
      }
      if (protocol) {
        protocol.value = state.protocol;
        protocol.disabled = provider !== "custom";
      }
      if (modelInput) {
        const model = selectedValue ?? state.model;
        modelInput.value = model;
        modelInput.placeholder = state.definition.defaultModel || "model-name";
      }
      if (modelOptions) {
        modelOptions.innerHTML = modelChoices(state).map((option) => (
          `<option value="${escapeAttr(option)}"></option>`
        )).join("");
      }
    }
  };

  void render();
  return {
    dispose: () => {
      disposed = true;
      el.innerHTML = "";
    }
  };
}

async function readEnvironmentDefaults(options: OpenAILLMInstallOptions) {
  try {
    const defaults = options.getEnvironmentDefaults?.();
    if (!defaults) return {};
    return (await withTimeout(Promise.resolve(defaults), 750)) ?? {};
  } catch {
    return {};
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => reject(new Error("LLM environment defaults timed out")), ms);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function selectedModel(
  input: HTMLInputElement | null,
  provider: LLMProviderId
): string {
  const fallback = providerDefinition(provider).defaultModel || "model-name";
  return input?.value.trim() || fallback;
}

function selectedProtocol(select: HTMLSelectElement | null, provider: LLMProviderId): LLMProtocol {
  if (provider !== "custom") return providerDefinition(provider).protocol;
  return select?.value === "responses" ? "responses" : "chat_completions";
}

function providerFromSelect(select: HTMLSelectElement | null): LLMProviderId {
  if (select?.value === "deepseek" || select?.value === "custom") return select.value;
  return "openai";
}

function selectedEnabledTools(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLInputElement>(".openai-llm-tool-permission"))
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function providerState(provider: LLMProviderId, ctx: PluginContext, defaults: Awaited<ReturnType<typeof readEnvironmentDefaults>>) {
  const definition = providerDefinition(provider);
  const providerDefaults = defaults[provider] ?? {};
  const savedApiKey = savedString(ctx, providerKey(provider, "apiKey"));
  const envApiKey = providerDefaults.apiKey ?? "";
  const model = savedString(ctx, providerKey(provider, "model")) || providerDefaults.model || definition.defaultModel;
  const baseUrl = savedString(ctx, providerKey(provider, "baseUrl")) || providerDefaults.baseUrl || definition.defaultBaseUrl;
  const protocol = savedString(ctx, `protocol.${provider}`) === "responses" ? "responses" : definition.protocol;
  const status = savedApiKey
    ? maskSecret(savedApiKey)
    : envApiKey
      ? `Set via ${definition.apiKeyEnv}`
      : "Not set";
  const tokenPlaceholder = savedApiKey
    ? "Saved; leave blank to keep"
    : envApiKey
      ? `Using ${definition.apiKeyEnv} from .env`
      : "sk-...";
  return { definition, savedApiKey, model, baseUrl, protocol, status, tokenPlaceholder };
}

function modelChoices(state: ReturnType<typeof providerState>): string[] {
  return Array.from(new Set([
    ...state.definition.models,
    state.definition.defaultModel,
    state.model
  ].map((value) => value.trim()).filter(Boolean)));
}

function savedString(ctx: PluginContext, key: string): string {
  const value = ctx.settings.get<unknown>(key);
  return typeof value === "string" ? value.trim() : "";
}

function styleTag(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
    .openai-llm-settings { display: grid; gap: 16px; }
    .openai-llm-panel { border: 1px solid var(--rule); border-radius: var(--r-3); padding: 16px; background: var(--paper); }
    .openai-llm-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
    .openai-llm-header h3, .openai-llm-panel h3 { margin: 0 0 4px; font-size: 16px; }
    .openai-llm-header p { margin: 0; color: var(--ink-3); }
    .openai-llm-status { color: var(--ink-3); font-size: 12px; white-space: nowrap; }
    .openai-llm-panel label { display: grid; gap: 6px; margin-top: 12px; color: var(--ink-3); font-size: 13px; }
    .openai-llm-panel input, .openai-llm-panel select, .openai-llm-panel textarea {
      width: 100%; box-sizing: border-box; border: 1px solid var(--rule); border-radius: var(--r-2);
      padding: 8px 10px; background: var(--paper); color: var(--ink-1); font: inherit;
    }
    .openai-llm-panel input:focus-visible, .openai-llm-panel select:focus-visible, .openai-llm-panel textarea:focus-visible { border-color: var(--accent); outline: 2px solid var(--accent-ring); outline-offset: 0; }
    .openai-llm-permissions { border: 1px solid var(--rule); border-radius: var(--r-3); padding: 12px; margin: 14px 0 0; }
    .openai-llm-permissions legend { padding: 0 6px; color: var(--ink-1); font-weight: 650; }
    .openai-llm-permissions p { margin: 0 0 10px; color: var(--ink-3); font-size: 13px; }
    .openai-llm-permission-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
    .openai-llm-check { grid-template-columns: 18px 1fr auto; align-items: center; gap: 8px; color: var(--ink-1); }
    .openai-llm-check input { width: 16px; height: 16px; }
    .openai-llm-check small { color: var(--ink-4); font-size: 11px; }
    .openai-llm-actions { display: flex; gap: 8px; margin-top: 14px; }
    .openai-llm-output { min-height: 64px; overflow: auto; white-space: pre-wrap; color: var(--ink-1); }
  `;
  return style;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
