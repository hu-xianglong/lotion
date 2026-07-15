import type { PluginSettings } from "../../shared/plugin-api.js";
import { ALL_LOTION_TOOL_NAMES, LOTION_TOOL_CATALOG } from "./tool-catalog.js";

export const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export type LLMProviderId = "openai" | "deepseek" | "custom";
export type LLMProtocol = "responses" | "chat_completions";
export type LLMToolMode = "read_only" | "ask_before_editing" | "direct_create";

export interface LLMProviderDefinition {
  id: LLMProviderId;
  label: string;
  apiKeyEnv: string;
  modelEnv: string;
  defaultModel: string;
  defaultBaseUrl: string;
  protocol: LLMProtocol;
  models: string[];
}

export const LLM_PROVIDER_DEFINITIONS: LLMProviderDefinition[] = [
  {
    id: "openai",
    label: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: DEFAULT_OPENAI_MODEL,
    defaultBaseUrl: DEFAULT_OPENAI_BASE_URL,
    protocol: "responses",
    models: ["gpt-5-mini", "gpt-5", "gpt-4.1", "gpt-4.1-mini", "o4-mini", "o3"]
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    defaultModel: DEFAULT_DEEPSEEK_MODEL,
    defaultBaseUrl: DEFAULT_DEEPSEEK_BASE_URL,
    protocol: "chat_completions",
    models: ["deepseek-chat", "deepseek-reasoner"]
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    apiKeyEnv: "LLM_API_KEY",
    modelEnv: "LLM_MODEL",
    defaultModel: "",
    defaultBaseUrl: "",
    protocol: "chat_completions",
    models: []
  }
];

export interface OpenAILLMSettings {
  provider: LLMProviderId;
  providerLabel: string;
  protocol: LLMProtocol;
  apiKey: string;
  model: string;
  baseUrl: string;
  enabledTools: string[];
  maxToolIterations: number;
}

export const LLM_TOOL_MODE_LABELS: Record<LLMToolMode, string> = {
  read_only: "Read-only",
  ask_before_editing: "Ask before editing",
  direct_create: "Direct create"
};

export const DIRECT_CREATE_TOOL_NAMES = new Set(["lotion_create_page", "lotion_create_database"]);

export interface LLMProviderEnvironmentDefaults {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface OpenAILLMEnvironmentDefaults {
  openai?: LLMProviderEnvironmentDefaults;
  deepseek?: LLMProviderEnvironmentDefaults;
  custom?: LLMProviderEnvironmentDefaults;
}

export function readOpenAILLMSettings(
  settings: PluginSettings,
  defaults: OpenAILLMEnvironmentDefaults = {}
): OpenAILLMSettings {
  const provider = providerSetting(settings, "provider", defaultProvider(defaults));
  return readOpenAILLMSettingsForProvider(settings, defaults, provider);
}

export function readOpenAILLMSettingsForProvider(
  settings: PluginSettings,
  defaults: OpenAILLMEnvironmentDefaults = {},
  provider: LLMProviderId
): OpenAILLMSettings {
  const definition = providerDefinition(provider);
  const providerDefaults = defaults[provider] ?? {};
  return {
    provider,
    providerLabel: definition.label,
    protocol: protocolSetting(settings, `protocol.${provider}`, definition.protocol),
    apiKey: stringSetting(settings, providerKey(provider, "apiKey"), providerDefaults.apiKey ?? legacyApiKey(settings, provider)),
    model: stringSetting(settings, providerKey(provider, "model"), providerDefaults.model ?? definition.defaultModel),
    baseUrl: stringSetting(settings, providerKey(provider, "baseUrl"), providerDefaults.baseUrl ?? definition.defaultBaseUrl),
    enabledTools: stringArraySetting(settings, "enabledTools", ALL_LOTION_TOOL_NAMES),
    maxToolIterations: numberSetting(settings, "maxToolIterations", 4)
  };
}

export async function writeOpenAILLMSettings(
  settings: PluginSettings,
  next: OpenAILLMSettings
): Promise<void> {
  const provider = providerDefinition(next.provider).id;
  await settings.set("provider", provider);
  await settings.set(providerKey(provider, "apiKey"), next.apiKey.trim());
  await settings.set(providerKey(provider, "model"), next.model.trim() || providerDefinition(provider).defaultModel);
  await settings.set(providerKey(provider, "baseUrl"), next.baseUrl.trim() || providerDefinition(provider).defaultBaseUrl);
  await settings.set(`protocol.${provider}`, normalizeProtocol(next.protocol, providerDefinition(provider).protocol));
  await settings.set("enabledTools", normalizeToolNames(next.enabledTools));
  await settings.set("maxToolIterations", clampToolIterations(next.maxToolIterations));
}

export function maskSecret(secret: string): string {
  const trimmed = secret.trim();
  if (!trimmed) return "Not set";
  if (trimmed.length <= 8) return "Set";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export function readSavedOpenAIAPIKey(settings: PluginSettings): string {
  const provider = providerSetting(settings, "provider", "openai");
  const value = settings.get<unknown>(providerKey(provider, "apiKey"));
  return typeof value === "string" ? value.trim() : "";
}

export function readLLMToolMode(settings: PluginSettings): LLMToolMode {
  const value = settings.get<unknown>("toolMode");
  if (value === "read_only" || value === "ask_before_editing" || value === "direct_create") return value;
  return "ask_before_editing";
}

export function enabledToolsForMode(enabledTools: string[], mode: LLMToolMode): string[] {
  const enabled = new Set(enabledTools);
  return LOTION_TOOL_CATALOG
    .filter((tool) => enabled.has(tool.name))
    .filter((tool) => {
      if (mode === "read_only") return tool.category === "read";
      if (mode === "direct_create") return tool.category === "read" || DIRECT_CREATE_TOOL_NAMES.has(tool.name);
      return tool.category === "read";
    })
    .map((tool) => tool.name);
}

export function providerDefinition(provider: LLMProviderId): LLMProviderDefinition {
  return LLM_PROVIDER_DEFINITIONS.find((definition) => definition.id === provider) ?? LLM_PROVIDER_DEFINITIONS[0];
}

export function providerKey(provider: LLMProviderId, key: "apiKey" | "model" | "baseUrl"): string {
  return `${key}.${provider}`;
}

function defaultProvider(defaults: OpenAILLMEnvironmentDefaults): LLMProviderId {
  if (!defaults.openai?.apiKey && defaults.deepseek?.apiKey) return "deepseek";
  return "openai";
}

function legacyApiKey(settings: PluginSettings, provider: LLMProviderId): string {
  if (provider !== "openai") return "";
  const value = settings.get<unknown>("apiKey");
  return typeof value === "string" ? value.trim() : "";
}

function stringSetting(settings: PluginSettings, key: string, fallback: string): string {
  const value = settings.get<unknown>(key);
  if (typeof value !== "string") return fallback;
  return value.trim() || fallback;
}

function providerSetting(settings: PluginSettings, key: string, fallback: LLMProviderId): LLMProviderId {
  const value = settings.get<unknown>(key);
  if (value === "openai" || value === "deepseek" || value === "custom") return value;
  return fallback;
}

function protocolSetting(settings: PluginSettings, key: string, fallback: LLMProtocol): LLMProtocol {
  return normalizeProtocol(settings.get<unknown>(key), fallback);
}

function normalizeProtocol(value: unknown, fallback: LLMProtocol): LLMProtocol {
  if (value === "responses" || value === "chat_completions") return value;
  return fallback;
}

function numberSetting(settings: PluginSettings, key: string, fallback: number): number {
  const value = settings.get<unknown>(key);
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clampToolIterations(parsed);
}

function stringArraySetting(settings: PluginSettings, key: string, fallback: string[]): string[] {
  const value = settings.get<unknown>(key);
  if (!Array.isArray(value)) return [...fallback];
  return normalizeToolNames(value);
}

function normalizeToolNames(value: unknown[]): string[] {
  const known = new Set(ALL_LOTION_TOOL_NAMES);
  const next: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !known.has(item) || next.includes(item)) continue;
    next.push(item);
  }
  return next;
}

function clampToolIterations(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}
