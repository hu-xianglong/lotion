import type { StartupCacheDiagnostics } from "../../../shared/types";

export type StartupPhaseKey = "workspace" | "index" | "navigation" | "paint";
export type StartupPhaseStatus = "pending" | "active" | "done" | "error";

export interface StartupPhaseEntry {
  key: StartupPhaseKey;
  label: string;
  status: StartupPhaseStatus;
  ms?: number;
}

export type StartupIndexOperationKey =
  | "workspaceIndex"
  | "pages"
  | "databases"
  | "tree"
  | "favorites"
  | "recents"
  | "workspacePath";

export type StartupCountKind = "pages" | "databases" | "entries" | "items";

export interface StartupIndexOperationEntry {
  key: StartupIndexOperationKey;
  ms: number;
  count?: number;
  countKind?: StartupCountKind;
  status: "done" | "error";
}

export interface StartupPerformanceReport {
  capturedAt: string;
  totalMs: number;
  measuredPhaseMs: number;
  overheadMs: number;
  phases: StartupPhaseEntry[];
  indexOperations: StartupIndexOperationEntry[];
  workspace: {
    name: string;
    path?: string;
    pages: number;
    databases: number;
  };
  cache?: StartupCacheDiagnostics;
}

export const STARTUP_PHASES: Array<{ key: StartupPhaseKey; label: string }> = [
  { key: "workspace", label: "Opening workspace" },
  { key: "index", label: "Reading workspace index" },
  { key: "navigation", label: "Restoring page" },
  { key: "paint", label: "Painting editor" }
];

export const STARTUP_INDEX_OPERATION_ORDER: StartupIndexOperationKey[] = [
  "workspaceIndex",
  "pages",
  "databases",
  "tree",
  "favorites",
  "recents",
  "workspacePath"
];

export function createStartupPerformanceReport(input: {
  capturedAt?: string;
  completedAt: number;
  indexOperations: Iterable<StartupIndexOperationEntry>;
  phases: StartupPhaseEntry[];
  startedAt: number;
  workspace: StartupPerformanceReport["workspace"];
  cache?: StartupCacheDiagnostics;
}): StartupPerformanceReport {
  const phases = input.phases.map((phase) => ({ ...phase }));
  const measuredPhaseMs = roundMs(phases.reduce((total, phase) => total + (phase.ms ?? 0), 0));
  const totalMs = roundMs(Math.max(0, input.completedAt - input.startedAt));
  const operationByKey = new Map(
    Array.from(input.indexOperations, (operation) => [operation.key, { ...operation }])
  );
  const indexOperations = STARTUP_INDEX_OPERATION_ORDER
    .map((key) => operationByKey.get(key))
    .filter((operation): operation is StartupIndexOperationEntry => Boolean(operation));
  return {
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    totalMs,
    measuredPhaseMs,
    overheadMs: roundMs(Math.max(0, totalMs - measuredPhaseMs)),
    phases,
    indexOperations,
    workspace: { ...input.workspace },
    cache: input.cache ? { ...input.cache } : undefined
  };
}

export function startupPerformanceGrade(totalMs: number): "fast" | "attention" | "slow" {
  if (totalMs < 1_000) return "fast";
  if (totalMs < 2_000) return "attention";
  return "slow";
}

function roundMs(value: number): number {
  return Number(value.toFixed(1));
}
