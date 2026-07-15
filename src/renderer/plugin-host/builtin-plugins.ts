import {
  InMemoryPluginSettings,
  PluginContextImpl
} from "../../shared/plugin-host/index.js";
import type { Disposable, PluginManifest, PluginSettings } from "../../shared/plugin-api.js";
import { installDefaultFieldTypes, manifest as defaultFieldTypesManifest } from "../../builtin-plugins/field-types-default/index.js";
import { installKanbanView, manifest as kanbanViewManifest } from "../../builtin-plugins/view-kanban/index.js";
import { installNotionImport, manifest as notionImportManifest } from "../../builtin-plugins/notion-import/index.js";
import { installOpenAILLM, manifest as openAILLMManifest } from "../../builtin-plugins/llm-openai/index.js";
import { installGitSync, manifest as gitSyncManifest } from "../../builtin-plugins/git-sync/index.js";
import { installAdvancedSearch, manifest as advancedSearchManifest } from "../../builtin-plugins/advanced-search/index.js";
import { installGitHubBackup, manifest as githubBackupManifest } from "../../builtin-plugins/github-backup/index.js";
import { BrowserPluginSettings } from "./browser-settings.js";
import { pluginHost } from "./index.js";

interface BuiltinPluginRegistration {
  manifest: PluginManifest;
  locked?: boolean;
  settings?: PluginSettings;
  install(ctx: PluginContextImpl): Disposable | void;
}

interface BuiltinPluginRuntime {
  context: PluginContextImpl;
  disposable?: Disposable;
}

export interface BuiltinPluginControl {
  id: string;
  enabled: boolean;
  locked: boolean;
}

const BUILTIN_ENABLED_PREFIX = "lotion.plugin.enabled.";
const runtimes = new Map<string, BuiltinPluginRuntime>();
let registrations: BuiltinPluginRegistration[] = [];

export function installBuiltinPlugins(): void {
  registrations = [
    {
      manifest: defaultFieldTypesManifest,
      locked: true,
      settings: new BrowserPluginSettings(defaultFieldTypesManifest.id),
      install: installDefaultFieldTypes
    },
    {
      manifest: kanbanViewManifest,
      settings: new BrowserPluginSettings(kanbanViewManifest.id),
      install: installKanbanView
    },
    {
      manifest: notionImportManifest,
      settings: new BrowserPluginSettings(notionImportManifest.id),
      install: installNotionImport
    },
    {
      manifest: openAILLMManifest,
      settings: new BrowserPluginSettings(openAILLMManifest.id),
      install: (ctx) =>
        installOpenAILLM(ctx, {
          getEnvironmentDefaults: () => window.lotion?.environment?.llmDefaults?.() ?? {}
        })
    },
    {
      manifest: gitSyncManifest,
      settings: new BrowserPluginSettings(gitSyncManifest.id),
      install: installGitSync
    },
    {
      manifest: advancedSearchManifest,
      settings: new BrowserPluginSettings(advancedSearchManifest.id),
      install: installAdvancedSearch
    },
    {
      manifest: githubBackupManifest,
      settings: new BrowserPluginSettings(githubBackupManifest.id),
      install: installGitHubBackup
    }
  ];

  for (const registration of registrations) {
    if (isBuiltinPluginEnabled(registration)) {
      installBuiltinPluginRegistration(registration);
    } else {
      pluginHost.registerDisabledPlugin(registration.manifest);
    }
  }
}

export function listBuiltinPluginControls(): BuiltinPluginControl[] {
  return registrations.map((registration) => ({
    id: registration.manifest.id,
    enabled: pluginHost.inspect().plugins.find((plugin) => plugin.id === registration.manifest.id)?.status !== "disabled",
    locked: registration.locked === true
  }));
}

export async function setBuiltinPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  const registration = registrations.find((candidate) => candidate.manifest.id === pluginId);
  if (!registration) throw new Error(`Built-in plugin not found: ${pluginId}`);
  if (registration.locked && !enabled) {
    throw new Error(`Built-in plugin is required and cannot be disabled: ${pluginId}`);
  }

  window.localStorage.setItem(enabledStorageKey(pluginId), enabled ? "true" : "false");
  if (enabled) {
    installBuiltinPluginRegistration(registration);
  } else {
    disableBuiltinPluginRegistration(registration);
  }
}

function installBuiltinPluginRegistration(registration: BuiltinPluginRegistration): void {
  if (runtimes.has(registration.manifest.id)) {
    pluginHost.setPluginStatus(registration.manifest.id, "active");
    return;
  }
  const context = makeBuiltinContext(registration.manifest, registration.settings);
  const disposable = registration.install(context) ?? undefined;
  runtimes.set(registration.manifest.id, { context, disposable });
  pluginHost.setPluginStatus(registration.manifest.id, "active");
}

function disableBuiltinPluginRegistration(registration: BuiltinPluginRegistration): void {
  const runtime = runtimes.get(registration.manifest.id);
  if (runtime) {
    try {
      runtime.disposable?.dispose();
    } finally {
      runtime.context.disposeAll();
      runtimes.delete(registration.manifest.id);
    }
  }
  pluginHost.registerDisabledPlugin(registration.manifest);
}

function isBuiltinPluginEnabled(registration: BuiltinPluginRegistration): boolean {
  if (registration.locked) return true;
  const raw = window.localStorage.getItem(enabledStorageKey(registration.manifest.id));
  return raw !== "false";
}

function enabledStorageKey(pluginId: string): string {
  return `${BUILTIN_ENABLED_PREFIX}${pluginId}`;
}

function makeBuiltinContext(manifest: PluginManifest, settings?: PluginSettings): PluginContextImpl {
  return new PluginContextImpl(pluginHost, manifest, settings ?? new InMemoryPluginSettings());
}
