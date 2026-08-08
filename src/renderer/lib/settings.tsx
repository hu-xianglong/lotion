import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_DATE_DISPLAY_FORMAT,
  DEFAULT_TIME_DISPLAY_FORMAT,
  type DateTimeDisplayDefaults
} from "../../shared/date-values";
import { SHORTCUT_STORAGE_KEY, readShortcutOverrides, type ShortcutOverrides } from "../../shared/shortcuts";
import type { DateDisplayFormat, TimeDisplayFormat } from "../../shared/types";

const VIM_KEY = "lotion.settings.vimMode";
const RAW_KEY = "lotion.settings.rawMarkdown";
const EMBED_SOURCE_KEY = "lotion.settings.showEmbedSource";
const ICON_THEME_KEY = "lotion.settings.iconTheme";
const SIDEBAR_TAGS_KEY = "lotion.settings.sidebarTags";
const DEFAULT_DATE_FORMAT_KEY = "lotion.settings.defaultDateFormat";
const DEFAULT_TIME_FORMAT_KEY = "lotion.settings.defaultTimeFormat";
export const DEFAULT_SIDEBAR_TAGS = ["page", "database"] as const;

/** Icon theme — minimal is the stroke-only line work; the rest are
 *  single-accent themes where every icon sits on a colored squircle.
 *  The accent color is fixed per theme so the same icon reads the
 *  same hue everywhere across the app. */
export type IconTheme =
  | "minimal"
  | "terracotta"
  | "navy"
  | "forest"
  | "saffron"
  | "plum";

const VALID_THEMES = new Set<IconTheme>([
  "minimal",
  "terracotta",
  "navy",
  "forest",
  "saffron",
  "plum"
]);
const VALID_DATE_FORMATS = new Set<DateDisplayFormat>([
  "full",
  "month_day_year",
  "day_month_year",
  "year_month_day",
  "iso"
]);
const VALID_TIME_FORMATS = new Set<TimeDisplayFormat>(["none", "h12", "h24"]);

interface SettingsContextValue {
  vimMode: boolean;
  setVimMode: (next: boolean) => void;
  rawMarkdown: boolean;
  setRawMarkdown: (next: boolean) => void;
  showEmbedSource: boolean;
  setShowEmbedSource: (next: boolean) => void;
  iconTheme: IconTheme;
  setIconTheme: (next: IconTheme) => void;
  sidebarTags: string[];
  setSidebarTags: (next: string[]) => void;
  defaultDateFormat: DateDisplayFormat;
  setDefaultDateFormat: (next: DateDisplayFormat) => void;
  defaultTimeFormat: TimeDisplayFormat;
  setDefaultTimeFormat: (next: TimeDisplayFormat) => void;
  shortcutOverrides: ShortcutOverrides;
  setShortcutOverrides: (next: ShortcutOverrides | ((current: ShortcutOverrides) => ShortcutOverrides)) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  vimMode: false,
  setVimMode: () => {},
  rawMarkdown: false,
  setRawMarkdown: () => {},
  showEmbedSource: false,
  setShowEmbedSource: () => {},
  iconTheme: "minimal",
  setIconTheme: () => {},
  sidebarTags: [...DEFAULT_SIDEBAR_TAGS],
  setSidebarTags: () => {},
  defaultDateFormat: DEFAULT_DATE_DISPLAY_FORMAT,
  setDefaultDateFormat: () => {},
  defaultTimeFormat: DEFAULT_TIME_DISPLAY_FORMAT,
  setDefaultTimeFormat: () => {},
  shortcutOverrides: {},
  setShortcutOverrides: () => {}
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [vimMode, setVimModeState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(VIM_KEY) === "1";
  });
  const [rawMarkdown, setRawMarkdownState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(RAW_KEY) === "1";
  });
  const [showEmbedSource, setShowEmbedSourceState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(EMBED_SOURCE_KEY) === "1";
  });
  const [iconTheme, setIconThemeState] = useState<IconTheme>(() => {
    if (typeof window === "undefined") return "minimal";
    const stored = window.localStorage.getItem(ICON_THEME_KEY);
    if (stored && VALID_THEMES.has(stored as IconTheme)) return stored as IconTheme;
    // Migrate the old "dopamine" value (multi-color palette) to a
    // single accent color so existing users get something coherent.
    if (stored === "dopamine") return "terracotta";
    return "minimal";
  });
  const [sidebarTags, setSidebarTagsState] = useState<string[]>(() => {
    if (typeof window === "undefined") return [...DEFAULT_SIDEBAR_TAGS];
    return normalizeSidebarTags(window.localStorage.getItem(SIDEBAR_TAGS_KEY));
  });
  const [defaultDateFormat, setDefaultDateFormatState] = useState<DateDisplayFormat>(() => {
    return readStoredDateTimeDisplayDefaults().dateFormat;
  });
  const [defaultTimeFormat, setDefaultTimeFormatState] = useState<TimeDisplayFormat>(() => {
    return readStoredDateTimeDisplayDefaults().timeFormat;
  });
  const [shortcutOverrides, setShortcutOverridesState] = useState<ShortcutOverrides>(() => {
    if (typeof window === "undefined") return {};
    return readShortcutOverrides(window.localStorage.getItem(SHORTCUT_STORAGE_KEY));
  });

  // Push the resolved accent color into a CSS variable so every icon
  // (and any future themed UI) can read it via `var(--icon-accent)`.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const colors: Record<IconTheme, string> = {
      minimal:    "transparent",
      terracotta: "#c25434",
      navy:       "#2f557f",
      forest:     "#3f7a4a",
      saffron:    "#c69846",
      plum:       "#7a3d6a"
    };
    const iconAccent = colors[iconTheme];
    document.documentElement.style.setProperty("--icon-accent", iconAccent);
    document.documentElement.style.setProperty("--theme-accent", iconAccent === "transparent" ? "#2f557f" : iconAccent);
    document.documentElement.dataset.iconTheme = iconTheme;
  }, [iconTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VIM_KEY, vimMode ? "1" : "0");
  }, [vimMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RAW_KEY, rawMarkdown ? "1" : "0");
  }, [rawMarkdown]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(EMBED_SOURCE_KEY, showEmbedSource ? "1" : "0");
  }, [showEmbedSource]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ICON_THEME_KEY, iconTheme);
  }, [iconTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_TAGS_KEY, JSON.stringify(sidebarTags));
  }, [sidebarTags]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DEFAULT_DATE_FORMAT_KEY, defaultDateFormat);
  }, [defaultDateFormat]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DEFAULT_TIME_FORMAT_KEY, defaultTimeFormat);
  }, [defaultTimeFormat]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(shortcutOverrides));
  }, [shortcutOverrides]);

  return (
    <SettingsContext.Provider
      value={{
        vimMode,
        setVimMode: setVimModeState,
        rawMarkdown,
        setRawMarkdown: setRawMarkdownState,
        showEmbedSource,
        setShowEmbedSource: setShowEmbedSourceState,
        iconTheme,
        setIconTheme: setIconThemeState,
        sidebarTags,
        setSidebarTags: (next) => setSidebarTagsState(normalizeSidebarTags(next)),
        defaultDateFormat,
        setDefaultDateFormat: (next) => setDefaultDateFormatState(normalizeDateFormat(next)),
        defaultTimeFormat,
        setDefaultTimeFormat: (next) => setDefaultTimeFormatState(normalizeTimeFormat(next)),
        shortcutOverrides,
        setShortcutOverrides: (next) => {
          setShortcutOverridesState((current) => {
            const resolved = typeof next === "function" ? next(current) : next;
            return readShortcutOverrides(resolved);
          });
        }
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}

export function useDateTimeDisplayDefaults(): DateTimeDisplayDefaults {
  const { defaultDateFormat, defaultTimeFormat } = useSettings();
  return useMemo(
    () => ({ dateFormat: defaultDateFormat, timeFormat: defaultTimeFormat }),
    [defaultDateFormat, defaultTimeFormat]
  );
}

export function readStoredDateTimeDisplayDefaults(
  storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : window.localStorage
): DateTimeDisplayDefaults {
  return {
    dateFormat: normalizeDateFormat(storage?.getItem(DEFAULT_DATE_FORMAT_KEY)),
    timeFormat: normalizeTimeFormat(storage?.getItem(DEFAULT_TIME_FORMAT_KEY))
  };
}

export function normalizeDateFormat(value: unknown): DateDisplayFormat {
  return typeof value === "string" && VALID_DATE_FORMATS.has(value as DateDisplayFormat)
    ? value as DateDisplayFormat
    : DEFAULT_DATE_DISPLAY_FORMAT;
}

export function normalizeTimeFormat(value: unknown): TimeDisplayFormat {
  return typeof value === "string" && VALID_TIME_FORMATS.has(value as TimeDisplayFormat)
    ? value as TimeDisplayFormat
    : DEFAULT_TIME_DISPLAY_FORMAT;
}

function normalizeSidebarTags(value: unknown): string[] {
  let raw: unknown[] = [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      raw = Array.isArray(parsed) ? parsed : [];
    } catch {
      raw = value.split(",");
    }
  } else if (Array.isArray(value)) {
    raw = value;
  }
  const normalized: string[] = [];
  for (const item of raw) {
    const tag = String(item ?? "").trim();
    if (!tag || normalized.includes(tag)) continue;
    normalized.push(tag);
  }
  for (const tag of DEFAULT_SIDEBAR_TAGS) {
    if (!normalized.includes(tag)) normalized.push(tag);
  }
  return normalized.length > 0 ? normalized : [...DEFAULT_SIDEBAR_TAGS];
}
