/**
 * Plugin host — barrel.
 *
 * - `Registry<T>` / `InProcessEventBus`: pure infrastructure atoms.
 * - `PluginHost`: process-local host. Owns one Registry per provider
 *   category + the event bus + keyed catalogs (commands / sidebar /
 *   page actions / settings tabs). One instance per process.
 * - `PluginContextImpl`: per-plugin wrapper around PluginHost.
 *   Constructed by the loader (TBD) when a plugin loads; disposes
 *   every registration atomically on unload.
 * - `InMemoryPluginSettings`: stub PluginSettings until the loader
 *   wires up `~/.lotion/plugins/<id>/settings.json`.
 *
 * Loader + cross-process bridging lands in the external-plugin-loader
 * task (#76). For now built-in plugins can already use this host by
 * calling `host.createPluginContext(...)`-equivalent (loader code) or
 * just instantiating `PluginContextImpl` directly.
 */

export { Registry } from "./registry.js";
export type { RegistryChange } from "./registry.js";
export { InProcessEventBus } from "./event-bus.js";
export { PluginHost } from "./host.js";
export type {
  PluginHostInspection,
  PluginHostKeyedKind,
  PluginHostPlatform,
  PluginKeyedInspection,
  PluginLifecycleStatus,
  PluginManifestInspection,
  PluginProviderInspection,
  PluginProviderKind
} from "./host.js";
export { PluginContextImpl } from "./context.js";
export { InMemoryPluginSettings } from "./settings.js";
