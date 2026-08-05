let installPromise: Promise<void> | undefined;
let scheduled = false;

export function ensureBuiltinPlugins(): Promise<void> {
  installPromise ??= import("./builtin-plugins").then(({ installBuiltinPlugins }) => {
    installBuiltinPlugins();
    window.dispatchEvent(new CustomEvent("lotion:builtin-plugins-ready"));
  });
  return installPromise;
}

export function scheduleBuiltinPlugins(): void {
  if (scheduled || installPromise) return;
  scheduled = true;
  const install = () => {
    scheduled = false;
    void ensureBuiltinPlugins().catch((error) => {
      console.error("[lotion] failed to install built-in plugins:", error);
    });
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(install, { timeout: 3_000 });
  } else {
    globalThis.setTimeout(install, 1_000);
  }
}
