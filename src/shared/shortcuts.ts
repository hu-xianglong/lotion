export type ShortcutScope = "global" | "editor" | "modal";

export interface ShortcutDefinition {
  id: string;
  label: string;
  category: string;
  defaultChord: string | null;
  scope: ShortcutScope;
  configurable: boolean;
  reserved?: boolean;
}

export type ShortcutOverrides = Record<string, string | null | undefined>;

export interface ResolvedShortcut extends ShortcutDefinition {
  chord: string | null;
  defaultDisplay: string;
  display: string;
  customized: boolean;
  disabled: boolean;
}

export interface ShortcutConflict {
  actionId: string;
  conflictingActionId?: string;
  chord: string;
  message: string;
}

export const SHORTCUT_STORAGE_KEY = "lotion.settings.shortcuts";

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: "lotion.open-search",
    label: "Open command palette",
    category: "Search",
    defaultChord: "Mod+Shift+F",
    scope: "global",
    configurable: true
  },
  {
    id: "lotion.open-sidebar-settings",
    label: "Open settings",
    category: "Settings",
    defaultChord: "Mod+,",
    scope: "global",
    configurable: true
  },
  {
    id: "lotion.history-back",
    label: "Back",
    category: "Navigation",
    defaultChord: "Mod+[",
    scope: "global",
    configurable: true
  },
  {
    id: "lotion.history-forward",
    label: "Forward",
    category: "Navigation",
    defaultChord: "Mod+]",
    scope: "global",
    configurable: true
  },
  {
    id: "lotion.new-window",
    label: "New window",
    category: "Window",
    defaultChord: "Mod+Shift+N",
    scope: "global",
    configurable: true
  },
  {
    id: "lotion.new-tab",
    label: "New tab",
    category: "Tabs",
    defaultChord: "Mod+T",
    scope: "global",
    configurable: true
  },
  {
    id: "lotion.close-tab",
    label: "Close tab",
    category: "Tabs",
    defaultChord: "Mod+W",
    scope: "global",
    configurable: true
  },
  ...Array.from({ length: 9 }, (_, index): ShortcutDefinition => ({
    id: `lotion.switch-tab-${index + 1}`,
    label: `Switch to tab ${index + 1}`,
    category: "Tabs",
    defaultChord: `Mod+${index + 1}`,
    scope: "global",
    configurable: true
  }))
];

const MODIFIER_ORDER = ["Mod", "Ctrl", "Alt", "Shift"] as const;
const RESERVED_CHORDS = new Set(["Mod+Q", "Mod+R", "Mod+Shift+R"]);
const DEFAULT_PLATFORM = "mac";

export function normalizeShortcutChord(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const parts = raw
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const modifiers = new Set<string>();
  let key = "";
  for (const part of parts) {
    const normalized = normalizeShortcutPart(part);
    if (normalized === "Mod" || normalized === "Ctrl" || normalized === "Alt" || normalized === "Shift") {
      modifiers.add(normalized);
    } else {
      key = normalized;
    }
  }
  if (!key) return null;
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].join("+");
}

export function displayShortcutChord(chord: string | null | undefined, platform = platformName()): string {
  const normalized = normalizeShortcutChord(chord);
  if (!normalized) return "Disabled";
  return normalized
    .split("+")
    .map((part) => {
      if (part === "Mod") return platform === "mac" ? "⌘" : "Ctrl";
      if (part === "Ctrl") return platform === "mac" ? "⌃" : "Ctrl";
      if (part === "Alt") return platform === "mac" ? "⌥" : "Alt";
      if (part === "Shift") return platform === "mac" ? "⇧" : "Shift";
      if (part === "ArrowUp") return "↑";
      if (part === "ArrowDown") return "↓";
      if (part === "ArrowLeft") return "←";
      if (part === "ArrowRight") return "→";
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(platform === "mac" ? "" : "+");
}

export function resolveShortcuts(overrides: ShortcutOverrides = {}, platform = platformName()): ResolvedShortcut[] {
  return DEFAULT_SHORTCUTS.map((definition) => {
    const override = Object.prototype.hasOwnProperty.call(overrides, definition.id)
      ? overrides[definition.id]
      : undefined;
    const chord = override === undefined
      ? normalizeShortcutChord(definition.defaultChord)
      : override === null
        ? null
        : normalizeShortcutChord(override);
    const defaultChord = normalizeShortcutChord(definition.defaultChord);
    return {
      ...definition,
      chord,
      defaultDisplay: displayShortcutChord(defaultChord, platform),
      display: displayShortcutChord(chord, platform),
      customized: override !== undefined,
      disabled: chord === null
    };
  });
}

export function shortcutMap(overrides: ShortcutOverrides = {}, platform = platformName()): Map<string, ResolvedShortcut> {
  return new Map(resolveShortcuts(overrides, platform).map((shortcut) => [shortcut.id, shortcut]));
}

export function validateShortcutOverride(
  actionId: string,
  chord: string | null,
  overrides: ShortcutOverrides = {}
): ShortcutConflict | null {
  const definition = DEFAULT_SHORTCUTS.find((shortcut) => shortcut.id === actionId);
  if (!definition) {
    return { actionId, chord: chord ?? "", message: "Unknown shortcut action." };
  }
  if (!definition.configurable) {
    return { actionId, chord: chord ?? "", message: "This shortcut cannot be changed." };
  }
  const normalized = normalizeShortcutChord(chord);
  if (!normalized) return null;
  if (RESERVED_CHORDS.has(normalized)) {
    return { actionId, chord: normalized, message: `${normalized} is reserved by the app or OS.` };
  }
  if (definition.scope === "global" && isTextInputConflict(normalized)) {
    return {
      actionId,
      chord: normalized,
      message: "Global shortcuts must include Mod, Ctrl, or Alt so normal typing is not stolen."
    };
  }
  const nextOverrides = { ...overrides, [actionId]: normalized };
  const shortcuts = resolveShortcuts(nextOverrides);
  const target = shortcuts.find((shortcut) => shortcut.id === actionId);
  if (!target?.chord) return null;
  const conflict = shortcuts.find((shortcut) =>
    shortcut.id !== actionId &&
    shortcut.scope === target.scope &&
    shortcut.chord === target.chord
  );
  if (conflict) {
    return {
      actionId,
      conflictingActionId: conflict.id,
      chord: target.chord,
      message: `${displayShortcutChord(target.chord)} is already used by ${conflict.label}.`
    };
  }
  return null;
}

export function shortcutActionForEvent(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  overrides: ShortcutOverrides = {},
  platform = platformName()
): string | null {
  const eventChord = chordFromKeyboardEvent(event, platform);
  if (!eventChord) return null;
  const match = resolveShortcuts(overrides, platform).find((shortcut) =>
    shortcut.scope === "global" && shortcut.chord === eventChord
  );
  return match?.id ?? null;
}

export function chordFromKeyboardEvent(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  platform = platformName()
): string | null {
  const key = normalizeShortcutKey(event.key);
  if (!key || key === "Meta" || key === "Control" || key === "Alt" || key === "Shift") return null;
  const parts: string[] = [];
  // Lotion has historically accepted Ctrl+ shortcuts on macOS during
  // automated and keyboard-first workflows, so Mod means Cmd or Ctrl here.
  const modPressed = event.metaKey || event.ctrlKey;
  if (modPressed) parts.push("Mod");
  if (event.ctrlKey && event.metaKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(key);
  return normalizeShortcutChord(parts.join("+"));
}

export function readShortcutOverrides(raw: unknown): ShortcutOverrides {
  if (!raw) return {};
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: ShortcutOverrides = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!DEFAULT_SHORTCUTS.some((shortcut) => shortcut.id === id)) continue;
      if (value === null) {
        result[id] = null;
      } else if (typeof value === "string") {
        const chord = normalizeShortcutChord(value);
        if (chord) result[id] = chord;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function normalizeShortcutPart(part: string): string {
  const lower = part.toLowerCase();
  if (["cmd", "command", "meta", "mod", "⌘"].includes(lower)) return "Mod";
  if (["control", "ctrl", "⌃"].includes(lower)) return "Ctrl";
  if (["option", "opt", "alt", "⌥"].includes(lower)) return "Alt";
  if (["shift", "⇧"].includes(lower)) return "Shift";
  return normalizeShortcutKey(part);
}

function normalizeShortcutKey(key: string): string {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  const lower = key.toLowerCase();
  if (lower === "esc") return "Escape";
  if (lower === "up") return "ArrowUp";
  if (lower === "down") return "ArrowDown";
  if (lower === "left") return "ArrowLeft";
  if (lower === "right") return "ArrowRight";
  return key.length > 1 ? key[0].toUpperCase() + key.slice(1) : key;
}

function isTextInputConflict(chord: string): boolean {
  const parts = chord.split("+");
  return !parts.includes("Mod") && !parts.includes("Ctrl") && !parts.includes("Alt");
}

function platformName(): "mac" | "other" {
  if (typeof navigator === "undefined") return DEFAULT_PLATFORM;
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "mac" : "other";
}
