export type LotionApiSurface = "package" | "electron-ipc";

export interface LotionApiContractGroup {
  group: string;
  methods: readonly string[];
  internal?: boolean;
}

export interface LotionApiMetricEntry {
  id: number;
  surface: LotionApiSurface;
  methodId: string;
  channel?: string;
  startedAt: string;
  durationMs: number;
  ok: boolean;
  errorKind?: string;
}

export interface LotionApiMetricsSummary {
  surface: LotionApiSurface;
  methodId: string;
  channel?: string;
  count: number;
  successCount: number;
  errorCount: number;
  averageDurationMs: number;
  maxDurationMs: number;
  lastDurationMs: number;
  lastStartedAt: string;
  lastErrorKind?: string;
}

export interface LotionApiMetricsListOptions {
  limit?: number;
}

export interface LotionApiMetricsApi {
  list(options?: LotionApiMetricsListOptions): LotionApiMetricEntry[] | Promise<LotionApiMetricEntry[]>;
  summary(): LotionApiMetricsSummary[] | Promise<LotionApiMetricsSummary[]>;
  clear(): void | Promise<void>;
}

export const LOTION_RENDERER_API_CONTRACT = [
  { group: "workspace", methods: ["create", "open", "getManifest", "getPagesTree", "listRecent", "forget", "openPicker", "reorderPages", "reorderDatabases", "listRecents", "pushRecent"] },
  { group: "pages", methods: ["list", "create", "duplicate", "get", "update", "rename", "delete"] },
  { group: "databases", methods: ["list", "listStats", "refreshStats", "create", "get", "delete", "updateMeta", "addField", "updateField", "copyFieldToSystemTime", "deleteField", "updateCell", "addRow", "deleteRow", "saveTemplate", "deleteTemplate"] },
  { group: "views", methods: ["create", "duplicate", "update", "delete", "setDefault"] },
  { group: "rowPages", methods: ["open", "openByFilename", "update", "setFullWidth", "setSmallText"] },
  { group: "git", methods: ["status", "backupNow", "initRepository", "settings", "updateSettings", "configureRemote", "testRemoteAccess", "push", "fetchStatus", "pull", "pickSshKey", "listPageHistory", "previewPageVersion", "restorePageVersion", "squashPreflight"] },
  { group: "shell", methods: ["openLink"] },
  { group: "attachments", methods: ["list", "get", "add", "importDroppedFiles"] },
  { group: "search", methods: ["query"] },
  { group: "entities", methods: ["resolve", "backlinks"] },
  { group: "icons", methods: ["setForPage", "clearForPage", "setForDatabase", "clearForDatabase", "setForWorkspace", "clearForWorkspace"] },
  { group: "covers", methods: ["setForPage", "clearForPage", "setForDatabase", "clearForDatabase", "setOffsetForDatabase", "setForRow", "clearForRow", "setOffsetForRow"] },
  { group: "windows", methods: ["openNew"] },
  { group: "environment", methods: ["llmDefaults", "openaiDefaults"] },
  { group: "plugins", methods: ["appendJsonl", "readJsonl", "readJson", "writeJson", "deleteFile"] },
  { group: "favorites", methods: ["list", "toggle"] },
  { group: "debug", methods: ["openLog", "setShellOpenDryRun", "getShellOpenRequests", "clearShellOpenRequests"], internal: true },
  { group: "notion", methods: ["pickFolder", "pickTarget", "scan", "runImport", "audit", "onProgress"] },
  { group: "metrics", methods: ["list", "summary", "clear"] }
] as const satisfies readonly LotionApiContractGroup[];

export const LOTION_PACKAGE_API_CONTRACT = [
  { group: "workspace", methods: ["createAt", "open", "getManifest", "getPagesTree", "reorderPages", "reorderDatabases", "listFavorites", "toggleFavorite", "listRecents", "pushRecent"] },
  { group: "pages", methods: ["list", "create", "duplicate", "get", "update", "rename", "delete"] },
  { group: "databases", methods: ["list", "listStats", "refreshStats", "create", "get", "delete", "updateMeta", "addField", "updateField", "copyFieldToSystemTime", "deleteField", "updateCell", "addRow", "deleteRow", "saveTemplate", "deleteTemplate"] },
  { group: "views", methods: ["create", "duplicate", "update", "delete", "setDefault"] },
  { group: "rowPages", methods: ["open", "openByFilename", "update", "setFullWidth", "setSmallText"] },
  { group: "attachments", methods: ["list", "get", "add", "importFiles"] },
  { group: "search", methods: ["query"] },
  { group: "entities", methods: ["resolve", "backlinks"] },
  { group: "notion", methods: ["scan", "runImport", "audit"] },
  { group: "metrics", methods: ["list", "summary", "clear"] }
] as const satisfies readonly LotionApiContractGroup[];

export const LOTION_IPC_CHANNEL_METHOD_IDS: Record<string, string> = {
  "workspace:create": "workspace.create",
  "workspace:open": "workspace.open",
  "workspace:getManifest": "workspace.getManifest",
  "workspace:getPagesTree": "workspace.getPagesTree",
  "workspace:listRecent": "workspace.listRecent",
  "workspace:forget": "workspace.forget",
  "workspace:openPicker": "workspace.openPicker",
  "workspace:reorderPages": "workspace.reorderPages",
  "workspace:reorderDatabases": "workspace.reorderDatabases",
  "workspace:listRecents": "workspace.listRecents",
  "workspace:pushRecent": "workspace.pushRecent",
  "pages:list": "pages.list",
  "pages:create": "pages.create",
  "pages:duplicate": "pages.duplicate",
  "pages:get": "pages.get",
  "pages:update": "pages.update",
  "pages:rename": "pages.rename",
  "pages:delete": "pages.delete",
  "databases:list": "databases.list",
  "databases:listStats": "databases.listStats",
  "databases:refreshStats": "databases.refreshStats",
  "databases:create": "databases.create",
  "databases:get": "databases.get",
  "databases:delete": "databases.delete",
  "databases:updateMeta": "databases.updateMeta",
  "databases:addField": "databases.addField",
  "databases:updateField": "databases.updateField",
  "databases:copyFieldToSystemTime": "databases.copyFieldToSystemTime",
  "databases:deleteField": "databases.deleteField",
  "databases:updateCell": "databases.updateCell",
  "databases:addRow": "databases.addRow",
  "databases:deleteRow": "databases.deleteRow",
  "databases:saveTemplate": "databases.saveTemplate",
  "databases:deleteTemplate": "databases.deleteTemplate",
  "views:create": "views.create",
  "views:duplicate": "views.duplicate",
  "views:update": "views.update",
  "views:delete": "views.delete",
  "views:setDefault": "views.setDefault",
  "rowPages:open": "rowPages.open",
  "rowPages:openByFilename": "rowPages.openByFilename",
  "rowPages:update": "rowPages.update",
  "rowPages:setFullWidth": "rowPages.setFullWidth",
  "rowPages:setSmallText": "rowPages.setSmallText",
  "git:status": "git.status",
  "git:backupNow": "git.backupNow",
  "git:initRepository": "git.initRepository",
  "git:settings": "git.settings",
  "git:updateSettings": "git.updateSettings",
  "git:configureRemote": "git.configureRemote",
  "git:testRemoteAccess": "git.testRemoteAccess",
  "git:push": "git.push",
  "git:fetchStatus": "git.fetchStatus",
  "git:pull": "git.pull",
  "git:pickSshKey": "git.pickSshKey",
  "git:listPageHistory": "git.listPageHistory",
  "git:previewPageVersion": "git.previewPageVersion",
  "git:restorePageVersion": "git.restorePageVersion",
  "git:squashPreflight": "git.squashPreflight",
  "shell:openLink": "shell.openLink",
  "attachments:list": "attachments.list",
  "attachments:get": "attachments.get",
  "attachments:add": "attachments.add",
  "attachments:importFiles": "attachments.importDroppedFiles",
  "search:query": "search.query",
  "entities:resolve": "entities.resolve",
  "entities:backlinks": "entities.backlinks",
  "icons:setForPage": "icons.setForPage",
  "icons:clearForPage": "icons.clearForPage",
  "icons:setForDatabase": "icons.setForDatabase",
  "icons:clearForDatabase": "icons.clearForDatabase",
  "icons:setForWorkspace": "icons.setForWorkspace",
  "icons:clearForWorkspace": "icons.clearForWorkspace",
  "covers:setForPage": "covers.setForPage",
  "covers:clearForPage": "covers.clearForPage",
  "covers:setForDatabase": "covers.setForDatabase",
  "covers:clearForDatabase": "covers.clearForDatabase",
  "covers:setOffsetForDatabase": "covers.setOffsetForDatabase",
  "covers:setForRow": "covers.setForRow",
  "covers:clearForRow": "covers.clearForRow",
  "covers:setOffsetForRow": "covers.setOffsetForRow",
  "windows:openNew": "windows.openNew",
  "environment:llmDefaults": "environment.llmDefaults",
  "environment:openaiDefaults": "environment.openaiDefaults",
  "plugins:appendJsonl": "plugins.appendJsonl",
  "plugins:readJsonl": "plugins.readJsonl",
  "plugins:readJson": "plugins.readJson",
  "plugins:writeJson": "plugins.writeJson",
  "plugins:deleteFile": "plugins.deleteFile",
  "favorites:list": "favorites.list",
  "favorites:toggle": "favorites.toggle",
  "debug:setShellOpenDryRun": "debug.setShellOpenDryRun",
  "debug:getShellOpenRequests": "debug.getShellOpenRequests",
  "debug:clearShellOpenRequests": "debug.clearShellOpenRequests",
  "notion:pickFolder": "notion.pickFolder",
  "notion:pickTarget": "notion.pickTarget",
  "notion:scan": "notion.scan",
  "notion:import": "notion.runImport",
  "notion:audit": "notion.audit",
  "metrics:list": "metrics.list",
  "metrics:summary": "metrics.summary",
  "metrics:clear": "metrics.clear"
};

export function flattenApiContract(contract: readonly LotionApiContractGroup[]): string[] {
  return contract.flatMap((group) => group.methods.map((method) => `${group.group}.${method}`)).sort();
}

export function publicFunctionShape(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const shape: string[] = [];
  for (const [groupName, groupValue] of Object.entries(value as Record<string, unknown>)) {
    if (!groupValue || typeof groupValue !== "object") continue;
    for (const [methodName, methodValue] of Object.entries(groupValue as Record<string, unknown>)) {
      if (typeof methodValue === "function") shape.push(`${groupName}.${methodName}`);
    }
  }
  return shape.sort();
}

export class LotionApiMetricsRecorder {
  private entries: LotionApiMetricEntry[] = [];
  private nextId = 1;
  private readonly maxEntries: number;

  constructor(options: { maxEntries?: number } = {}) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 500));
  }

  async measure<T>(
    metadata: { surface: LotionApiSurface; methodId: string; channel?: string },
    operation: () => T | Promise<T>
  ): Promise<T> {
    const startedAt = new Date();
    const start = nowMs();
    try {
      const result = await operation();
      this.record({
        surface: metadata.surface,
        methodId: metadata.methodId,
        channel: metadata.channel,
        startedAt,
        durationMs: nowMs() - start,
        ok: true
      });
      return result;
    } catch (error) {
      this.record({
        surface: metadata.surface,
        methodId: metadata.methodId,
        channel: metadata.channel,
        startedAt,
        durationMs: nowMs() - start,
        ok: false,
        errorKind: classifyApiError(error)
      });
      throw error;
    }
  }

  record(input: {
    surface: LotionApiSurface;
    methodId: string;
    channel?: string;
    startedAt?: Date;
    durationMs: number;
    ok: boolean;
    errorKind?: string;
  }): LotionApiMetricEntry {
    const entry: LotionApiMetricEntry = {
      id: this.nextId++,
      surface: input.surface,
      methodId: input.methodId,
      ...(input.channel ? { channel: input.channel } : {}),
      startedAt: (input.startedAt ?? new Date()).toISOString(),
      durationMs: roundDuration(input.durationMs),
      ok: input.ok,
      ...(input.errorKind ? { errorKind: input.errorKind } : {})
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
    return entry;
  }

  list(options: LotionApiMetricsListOptions = {}): LotionApiMetricEntry[] {
    const limit = normalizeLimit(options.limit, this.entries.length);
    return this.entries.slice(-limit).map((entry) => ({ ...entry }));
  }

  summary(): LotionApiMetricsSummary[] {
    const byMethod = new Map<string, LotionApiMetricsSummary & { totalDurationMs: number }>();
    for (const entry of this.entries) {
      const key = `${entry.surface}\u0000${entry.methodId}\u0000${entry.channel ?? ""}`;
      const existing = byMethod.get(key) ?? {
        surface: entry.surface,
        methodId: entry.methodId,
        ...(entry.channel ? { channel: entry.channel } : {}),
        count: 0,
        successCount: 0,
        errorCount: 0,
        averageDurationMs: 0,
        maxDurationMs: 0,
        lastDurationMs: 0,
        lastStartedAt: entry.startedAt,
        totalDurationMs: 0
      };
      existing.count += 1;
      existing.successCount += entry.ok ? 1 : 0;
      existing.errorCount += entry.ok ? 0 : 1;
      existing.totalDurationMs += entry.durationMs;
      existing.averageDurationMs = roundDuration(existing.totalDurationMs / existing.count);
      existing.maxDurationMs = Math.max(existing.maxDurationMs, entry.durationMs);
      existing.lastDurationMs = entry.durationMs;
      existing.lastStartedAt = entry.startedAt;
      if (entry.errorKind) existing.lastErrorKind = entry.errorKind;
      byMethod.set(key, existing);
    }
    return [...byMethod.values()]
      .map(({ totalDurationMs: _totalDurationMs, ...summary }) => ({ ...summary }))
      .sort((a, b) => a.methodId.localeCompare(b.methodId) || a.surface.localeCompare(b.surface));
  }

  clear(): void {
    this.entries = [];
  }
}

export function instrumentApiSurface<T extends Record<string, unknown>>(
  api: T,
  options: {
    contract: readonly LotionApiContractGroup[];
    recorder: LotionApiMetricsRecorder;
    surface: LotionApiSurface;
  }
): T {
  const next: Record<string, unknown> = { ...api };
  for (const group of options.contract) {
    if (group.group === "metrics") continue;
    const groupValue = (api as Record<string, unknown>)[group.group];
    if (!groupValue || typeof groupValue !== "object") continue;
    const wrappedGroup: Record<string, unknown> = { ...(groupValue as Record<string, unknown>) };
    for (const method of group.methods) {
      const fn = wrappedGroup[method];
      if (typeof fn !== "function") continue;
      const methodId = `${group.group}.${method}`;
      wrappedGroup[method] = (...args: unknown[]) =>
        options.recorder.measure({ surface: options.surface, methodId }, () =>
          (fn as (...args: unknown[]) => unknown).apply(groupValue, args)
        );
    }
    next[group.group] = wrappedGroup;
  }
  return next as T;
}

export function ipcMethodIdFromChannel(channel: string): string {
  return LOTION_IPC_CHANNEL_METHOD_IDS[channel] ?? channel.replace(":", ".");
}

function classifyApiError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code.trim()) return code.trim().slice(0, 80);
  if (error instanceof Error && error.name) return error.name.slice(0, 80);
  return typeof error;
}

function normalizeLimit(limit: unknown, fallback: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return fallback;
  return Math.max(0, Math.min(fallback, Math.floor(limit)));
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundDuration(value: number): number {
  return Number(Math.max(0, value).toFixed(3));
}
