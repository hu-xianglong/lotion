export function perfLog(label: string, detail: Record<string, unknown>): void {
  if (!isPerfLoggingEnabled()) return;
  console.log(`[lotion perf] ${label}`, detail);
}

function isPerfLoggingEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const flaggedWindow = window as Window & { __LOTION_PERF__?: boolean };
  if (flaggedWindow.__LOTION_PERF__ !== undefined) return flaggedWindow.__LOTION_PERF__;
  return window.localStorage.getItem("lotion.perf") === "1";
}
