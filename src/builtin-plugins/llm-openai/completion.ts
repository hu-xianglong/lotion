import type { AICompleteRequest, PluginContext } from "../../shared/plugin-api.js";
import { completeWithOpenAICompatibleChat } from "./openai-chat-completions.js";
import { completeWithOpenAIResponses } from "./openai-responses.js";
import { createLotionToolExecutor, createLotionTools } from "./lotion-tools.js";
import {
  type LLMProviderId,
  type OpenAILLMEnvironmentDefaults,
  type OpenAILLMSettings,
  providerDefinition,
  readOpenAILLMSettings,
  readOpenAILLMSettingsForProvider
} from "./settings.js";

export interface OpenAILLMInstallOptions {
  getEnvironmentDefaults?: () => OpenAILLMEnvironmentDefaults | Promise<OpenAILLMEnvironmentDefaults>;
}

export type OpenAILLMCompletionOverrides = Partial<Pick<
  OpenAILLMSettings,
  "provider" | "protocol" | "model" | "baseUrl" | "enabledTools" | "maxToolIterations"
>>;

export async function completeOpenAILLMRequest(
  ctx: Pick<PluginContext, "settings" | "workspace">,
  options: OpenAILLMInstallOptions,
  request: AICompleteRequest,
  overrides: OpenAILLMCompletionOverrides = {}
): Promise<string> {
  const defaults = await readEnvironmentDefaults(options);
  const baseSettings = overrides.provider
    ? readOpenAILLMSettingsForProvider(ctx.settings, defaults, overrides.provider)
    : readOpenAILLMSettings(ctx.settings, defaults);
  const settings = mergeSettings(
    baseSettings,
    overrides
  );
  const tools = createLotionTools(ctx.workspace, { enabledToolNames: settings.enabledTools });
  const toolDefinitions = tools.map(({ execute: _execute, readOnly: _readOnly, ...definition }) => definition);
  const executor = createLotionToolExecutor(tools);
  if (settings.protocol === "chat_completions") {
    return completeWithOpenAICompatibleChat(settings, request, toolDefinitions, executor);
  }
  return completeWithOpenAIResponses(settings, request, toolDefinitions, executor);
}

export async function readEnvironmentDefaults(
  options: OpenAILLMInstallOptions
): Promise<OpenAILLMEnvironmentDefaults> {
  try {
    return (await options.getEnvironmentDefaults?.()) ?? {};
  } catch {
    return {};
  }
}

function mergeSettings(settings: OpenAILLMSettings, overrides: OpenAILLMCompletionOverrides): OpenAILLMSettings {
  const provider = (overrides.provider ?? settings.provider) as LLMProviderId;
  const definition = providerDefinition(provider);
  return {
    ...settings,
    ...overrides,
    provider,
    providerLabel: definition.label,
    protocol: overrides.protocol ?? settings.protocol,
    model: overrides.model?.trim() || settings.model,
    baseUrl: overrides.baseUrl?.trim() || settings.baseUrl,
    enabledTools: overrides.enabledTools ?? settings.enabledTools,
    maxToolIterations: overrides.maxToolIterations ?? settings.maxToolIterations
  };
}
