import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  DatabaseStats,
  DatabaseSummary,
  FavoriteItem,
  PageMeta,
  RecentItem
} from "../../../shared/types";
import type { PluginHostInspection, PluginProviderInspection } from "../../../shared/plugin-host";
import type { PluginManifestInspection, PluginKeyedInspection } from "../../../shared/plugin-host";
import type { SettingsTab } from "../../../shared/plugin-api";
import { EntityIcon } from "../../components/EntityIcon";
import { useI18n } from "../../lib/i18n";
import { useLotionActions } from "../../context/lotion-actions";
import { useDatabaseCache } from "../../context/database-cache";
import { rowPageDisplay } from "../../lib/row-page-display";
import { useSettings } from "../../lib/settings";
import { tagFromManageKind, type ManageKind } from "../../state/app-store";
import { pluginHost } from "../../plugin-host";
import { listBuiltinPluginControls, setBuiltinPluginEnabled } from "../../plugin-host/builtin-plugins";
import { DesignSystemLab } from "../../components/DesignSystemLab";
import { BackupButton } from "../../features/backup/BackupButton";
import { ShortcutSettings } from "../../components/ShortcutSettings";

interface ManagementViewProps {
  kind: ManageKind;
  pages: PageMeta[];
  databases: DatabaseSummary[];
  favorites?: FavoriteItem[];
  recents: RecentItem[];
  pluginOpenRequest?: PluginOpenRequest;
  settingsOpenRequest?: SettingsOpenRequest;
}

export interface PluginOpenRequest {
  pluginId: string;
  panel?: "overview" | "settings";
  requestId: number;
}

export interface SettingsOpenRequest {
  section?: string;
  requestId: number;
}

/**
 * Tabular landing page for the workspace's databases, pages or recent
 * navigations. Each kind is rendered as a Notion-style row list — icon
 * + name + last-modified + click-to-open. We deliberately don't load
 * the full database bundle here (a workspace can have thousands of
 * rows), so the row count and field count for databases are best-effort
 * via the lazy summary in state.databases.
 */
export function ManagementView({ kind, pages, databases, favorites = [], recents, pluginOpenRequest, settingsOpenRequest }: ManagementViewProps) {
  const { t } = useI18n();
  const actions = useLotionActions();
  const tag = tagFromManageKind(kind);

  let title = "";
  let count = 0;
  let body: React.ReactNode;
  if (tag !== null) {
    const taggedPages = pages.filter((page) => hasTag(page.tags, tag));
    const taggedDatabases = databases.filter((database) => hasTag(database.tags, tag));
    title = `${t("manage.tagPage")} ${tag}`;
    count = taggedPages.length + taggedDatabases.length;
    body = (
      <TagItemsTable
        tag={tag}
        pages={taggedPages}
        databases={taggedDatabases}
        onOpenPage={actions.selectPage}
        onOpenDatabase={actions.selectDatabase}
      />
    );
  } else if (kind === "databases") {
    title = t("sidebar.manageDatabases");
    count = databases.length;
    body = (
      <DatabasesTable databases={databases} recents={recents} onOpen={actions.selectDatabase} />
    );
  } else if (kind === "pages") {
    title = t("sidebar.allPages");
    count = pages.length;
    body = (
      <PagesTable pages={pages} onOpen={actions.selectPage} />
    );
  } else if (kind === "recent") {
    title = t("sidebar.recent");
    count = recents.length;
    body = (
      <RecentsTable
        recents={recents}
        pages={pages}
        databases={databases}
        onOpenPage={actions.selectPage}
        onOpenDatabase={actions.selectDatabase}
        onOpenRowPage={actions.openRowPage}
      />
    );
  } else if (kind === "favorites") {
    title = t("sidebar.favorites");
    count = favorites.length;
    body = (
      <FavoritesTable
        favorites={favorites}
        pages={pages}
        databases={databases}
        onOpenPage={actions.selectPage}
        onOpenRowPage={actions.openRowPage}
      />
    );
  } else if (kind === "design-system") {
    title = "Design system";
    count = 8;
    body = <DesignSystemLab />;
  } else if (kind === "settings") {
    title = "Settings";
    count = SETTINGS_SECTIONS.length;
    body = (
      <SettingsCenter
        pages={pages}
        databases={databases}
        recents={recents}
        settingsOpenRequest={settingsOpenRequest}
      />
    );
  } else {
    const inspection = pluginHost.inspect();
    title = t("sidebar.plugins");
    count = inspection.plugins.length;
    body = <PluginsInspector inspection={inspection} pluginOpenRequest={pluginOpenRequest} />;
  }

  return (
    <div className="management-view">
      <div className="management-header">
        <div>
          <h1>{title}</h1>
          <div className="management-subtitle">{count}</div>
        </div>
      </div>
      {body}
    </div>
  );
}

function hasTag(tags: string[] | undefined, target: string): boolean {
  return (tags ?? []).some((tag) => tag.trim() === target);
}

type SettingsSectionId =
  | "general"
  | "appearance"
  | "search-ai"
  | "shortcuts"
  | "plugins"
  | "git-sync"
  | "import"
  | "advanced";

interface SettingsSection {
  id: SettingsSectionId;
  title: string;
  eyebrow: string;
  description: string;
  terms: string[];
  pluginIds?: string[];
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "general",
    title: "General",
    eyebrow: "App",
    description: "Language and editor interaction defaults.",
    terms: ["language", "editor", "vim", "raw markdown", "embed source", "general"]
  },
  {
    id: "appearance",
    title: "Appearance",
    eyebrow: "Interface",
    description: "Theme-adjacent display controls and sidebar organization.",
    terms: ["appearance", "theme", "icon", "sidebar", "tags"]
  },
  {
    id: "search-ai",
    title: "Search & AI",
    eyebrow: "Knowledge",
    description: "Advanced search indexing and LLM provider configuration.",
    terms: ["search", "advanced search", "semantic", "vector", "llm", "openai", "model", "ai"],
    pluginIds: ["advanced-search", "llm-openai"]
  },
  {
    id: "shortcuts",
    title: "Shortcuts",
    eyebrow: "Keyboard",
    description: "Keyboard shortcuts and command palette bindings.",
    terms: ["shortcut", "keyboard", "command palette", "hotkey"]
  },
  {
    id: "plugins",
    title: "Plugins",
    eyebrow: "Extensions",
    description: "Installed plugins, permissions, and extension points.",
    terms: ["plugins", "extension", "permission", "provider"]
  },
  {
    id: "git-sync",
    title: "Git Sync / Backup",
    eyebrow: "Sync",
    description: "Repository sync, GitHub backup, and history settings.",
    terms: ["git", "github", "backup", "sync", "history", "remote", "ssh"],
    pluginIds: ["git-sync", "github-backup"]
  },
  {
    id: "import",
    title: "Import",
    eyebrow: "Data",
    description: "Notion import preferences, audit, and report settings.",
    terms: ["import", "notion", "audit", "report", "html", "csv"],
    pluginIds: ["notion-import"]
  },
  {
    id: "advanced",
    title: "Advanced / Developer",
    eyebrow: "Developer",
    description: "Diagnostics, design system, and maintenance actions.",
    terms: ["advanced", "developer", "diagnostics", "design system", "backup"]
  }
];

function SettingsCenter({
  databases,
  pages,
  recents,
  settingsOpenRequest
}: {
  databases: DatabaseSummary[];
  pages: PageMeta[];
  recents: RecentItem[];
  settingsOpenRequest?: SettingsOpenRequest;
}) {
  const { locale, setLocale } = useI18n();
  const actions = useLotionActions();
  const {
    vimMode,
    setVimMode,
    rawMarkdown,
    setRawMarkdown,
    showEmbedSource,
    setShowEmbedSource,
    iconTheme,
    setIconTheme,
    sidebarTags,
    setSidebarTags
  } = useSettings();
  const initialSection = normalizeSettingsSectionId(settingsOpenRequest?.section) ?? "general";
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection);
  const [query, setQuery] = useState("");
  const inspection = pluginHost.inspect();
  const pluginNameById = new Map(inspection.plugins.map((plugin) => [plugin.id, plugin.name]));
  const active = SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0];
  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = normalizedQuery
    ? SETTINGS_SECTIONS.filter((section) =>
        [section.title, section.eyebrow, section.description, ...section.terms]
          .some((value) => value.toLowerCase().includes(normalizedQuery))
      )
    : [];

  useEffect(() => {
    const section = normalizeSettingsSectionId(settingsOpenRequest?.section);
    if (section) setActiveSection(section);
  }, [settingsOpenRequest]);

  return (
    <div className="settings-center" data-testid="settings-center">
      <aside className="settings-center-nav" aria-label="Settings sections">
        <label className="settings-search">
          <span>Search settings</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search settings, plugins, Git, LLM..."
            aria-label="Search settings"
          />
        </label>
        {searchResults.length > 0 && (
          <div className="settings-search-results" data-testid="settings-search-results">
            {searchResults.map((section) => (
              <button
                key={section.id}
                type="button"
                className="settings-search-result"
                onClick={() => {
                  setActiveSection(section.id);
                  setQuery("");
                }}
              >
                <strong>{section.title}</strong>
                <span>{section.description}</span>
              </button>
            ))}
          </div>
        )}
        <div className="settings-section-list" role="tablist" aria-label="Settings categories">
          {SETTINGS_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={activeSection === section.id}
              className={activeSection === section.id ? "active" : ""}
              onClick={() => setActiveSection(section.id)}
            >
              <span>{section.title}</span>
              <small>{section.eyebrow}</small>
            </button>
          ))}
        </div>
      </aside>
      <section className="settings-center-pane" data-testid="settings-center-pane">
        <header className="settings-center-section-header">
          <span>{active.eyebrow}</span>
          <h2>{active.title}</h2>
          <p>{active.description}</p>
        </header>
        {activeSection === "general" && (
          <div className="settings-row-stack">
            <SettingsSegmentRow
              label="Language"
              description="Switch the application chrome language."
              value={locale}
              options={[
                { value: "en", label: "English" },
                { value: "zh", label: "中文" }
              ]}
              onChange={(value) => setLocale(value as "en" | "zh")}
            />
            <SettingsSegmentRow
              label="Vim mode"
              description="Use Vim keybindings inside the editor."
              value={vimMode ? "on" : "off"}
              options={[{ value: "off", label: "Off" }, { value: "on", label: "On" }]}
              onChange={(value) => setVimMode(value === "on")}
            />
            <SettingsSegmentRow
              label="Raw markdown"
              description="Show markdown source instead of live preview."
              value={rawMarkdown ? "on" : "off"}
              options={[{ value: "off", label: "Off" }, { value: "on", label: "On" }]}
              onChange={(value) => setRawMarkdown(value === "on")}
            />
            <SettingsSegmentRow
              label="Embedded source"
              description="Show or hide source links for imported embeds."
              value={showEmbedSource ? "show" : "hide"}
              options={[{ value: "hide", label: "Hide" }, { value: "show", label: "Show" }]}
              onChange={(value) => setShowEmbedSource(value === "show")}
            />
          </div>
        )}
        {activeSection === "appearance" && (
          <div className="settings-row-stack">
            <SettingsRow label="Icon theme" description="Choose the default generated icon color.">
              <div className="settings-swatch-row" role="group" aria-label="Icon theme">
                {[
                  ["minimal", "Minimal", ""],
                  ["terracotta", "Terracotta", "#c25434"],
                  ["navy", "Navy", "#2f557f"],
                  ["forest", "Forest", "#3f7a4a"],
                  ["saffron", "Saffron", "#c69846"],
                  ["plum", "Plum", "#7a3d6a"]
                ].map(([value, label, color]) => (
                  <button
                    key={value}
                    type="button"
                    className={iconTheme === value ? "settings-swatch active" : "settings-swatch"}
                    style={color ? { background: color } : undefined}
                    onClick={() => setIconTheme(value as typeof iconTheme)}
                    aria-label={label}
                    title={label}
                  />
                ))}
              </div>
            </SettingsRow>
            <SettingsRow label="Sidebar sections" description="Visible sidebar section order.">
              <div className="settings-token-row">
                {sidebarTags.map((tag) => (
                  <span key={tag} className="settings-token">{tag}</span>
                ))}
                <button
                  type="button"
                  className="settings-inline-button"
                  onClick={() => setSidebarTags(sidebarTags.length ? sidebarTags : ["database", "page"])}
                >
                  Refresh sections
                </button>
              </div>
            </SettingsRow>
          </div>
        )}
        {activeSection === "search-ai" && (
          <SettingsPluginSection
            section={active}
            inspection={inspection}
            pluginNameById={pluginNameById}
          />
        )}
        {activeSection === "shortcuts" && (
          <div className="settings-embedded-panel">
            <ShortcutSettings />
          </div>
        )}
        {activeSection === "plugins" && (
          <div className="settings-row-stack">
            <SettingsRow label="Installed plugins" description="Plugins, providers, and registered surfaces.">
              <div className="settings-stat-row">
                <span>{inspection.plugins.length} plugins</span>
                <span>{inspection.commands.length} commands</span>
                <span>{inspection.settingsTabs.length} settings tabs</span>
              </div>
              <button type="button" className="settings-inline-button" onClick={() => actions.openManage("plugins")}>
                Open plugin manager
              </button>
            </SettingsRow>
            <div className="settings-plugin-list">
              {inspection.plugins.map((plugin) => (
                <div key={plugin.id} className="settings-plugin-list-row">
                  <strong>{plugin.name}</strong>
                  <span>{plugin.id}</span>
                  <StatusPill status={plugin.status} />
                </div>
              ))}
            </div>
          </div>
        )}
        {activeSection === "git-sync" && (
          <SettingsPluginSection
            section={active}
            inspection={inspection}
            pluginNameById={pluginNameById}
          />
        )}
        {activeSection === "import" && (
          <SettingsPluginSection
            section={active}
            inspection={inspection}
            pluginNameById={pluginNameById}
          />
        )}
        {activeSection === "advanced" && (
          <div className="settings-row-stack">
            <SettingsRow label="Workspace scale" description="Quick counts for local diagnostics.">
              <div className="settings-stat-row">
                <span>{pages.length} pages</span>
                <span>{databases.length} databases</span>
                <span>{recents.length} recent items</span>
              </div>
            </SettingsRow>
            <SettingsRow label="Design system" description="Open the local component/style lab.">
              <button type="button" className="settings-inline-button" onClick={() => actions.openManage("design-system")}>
                Open design system
              </button>
            </SettingsRow>
            <SettingsRow label="Manual backup" description="Create a local backup from the unified settings surface.">
              <BackupButton />
            </SettingsRow>
          </div>
        )}
      </section>
    </div>
  );
}

function normalizeSettingsSectionId(value: unknown): SettingsSectionId | null {
  if (typeof value !== "string") return null;
  return SETTINGS_SECTIONS.some((section) => section.id === value) ? value as SettingsSectionId : null;
}

function SettingsPluginSection({
  inspection,
  pluginNameById,
  section
}: {
  inspection: PluginHostInspection;
  pluginNameById: Map<string, string>;
  section: SettingsSection;
}) {
  const tabs = settingsTabsForPluginIds(inspection, section.pluginIds ?? []);
  return (
    <div className="settings-row-stack">
      <SettingsRow label={`${section.title} settings`} description={section.description}>
        <div className="settings-stat-row">
          {(section.pluginIds ?? []).map((pluginId) => (
            <span key={pluginId}>{pluginNameById.get(pluginId) ?? pluginId}</span>
          ))}
        </div>
      </SettingsRow>
      {tabs.length > 0 ? (
        <div className="settings-plugin-tabs">
          {tabs.map((tab) => (
            <section key={tab.id} className="settings-plugin-tab-section">
              <h3>{tab.title}</h3>
              <PluginSettingsTabHost tab={tab} />
            </section>
          ))}
        </div>
      ) : (
        <div className="settings-empty-note">No plugin settings are registered for this section.</div>
      )}
    </div>
  );
}

function settingsTabsForPluginIds(inspection: PluginHostInspection, pluginIds: string[]): SettingsTab[] {
  const pluginIdSet = new Set(pluginIds);
  const tabIds = new Set(
    inspection.settingsTabs
      .filter((tab) => typeof tab.sourcePluginId === "string" && pluginIdSet.has(tab.sourcePluginId))
      .map((tab) => tab.id)
  );
  return pluginHost.settingsTabs.list().filter((tab) => tabIds.has(tab.id));
}

function SettingsRow({
  children,
  description,
  label
}: {
  children: ReactNode;
  description: string;
  label: string;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function SettingsSegmentRow({
  description,
  label,
  onChange,
  options,
  value
}: {
  description: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  value: string;
}) {
  return (
    <SettingsRow label={label} description={description}>
      <div className="settings-segmented-control" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? "active" : ""}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </SettingsRow>
  );
}

function PluginsInspector({ inspection: initialInspection, pluginOpenRequest }: { inspection: PluginHostInspection; pluginOpenRequest?: PluginOpenRequest }) {
  const [selectedPlugin, setSelectedPlugin] = useState<{ id: string; panel: "overview" | "settings"; requestId: number } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!pluginOpenRequest) return;
    setSelectedPlugin({
      id: pluginOpenRequest.pluginId,
      panel: pluginOpenRequest.panel === "settings" ? "settings" : "overview",
      requestId: pluginOpenRequest.requestId
    });
  }, [pluginOpenRequest]);
  const inspection = useMemo(() => pluginHost.inspect(), [initialInspection, revision]);
  const controlsByPluginId = useMemo(
    () => new Map(listBuiltinPluginControls().map((control) => [control.id, control])),
    [inspection, revision]
  );
  const togglePlugin = async (pluginId: string, enabled: boolean) => {
    await setBuiltinPluginEnabled(pluginId, enabled);
    setRevision((value) => value + 1);
  };
  const activePlugin = selectedPlugin
    ? inspection.plugins.find((plugin) => plugin.id === selectedPlugin.id)
    : undefined;
  const pluginNameById = new Map(inspection.plugins.map((plugin) => [plugin.id, plugin.name]));
  const fieldProviders = inspection.providers.filter((provider) => provider.kind === "field-type");
  const viewProviders = inspection.providers.filter((provider) => provider.kind === "database-view");
  const otherProviders = inspection.providers.filter(
    (provider) => provider.kind !== "field-type" && provider.kind !== "database-view"
  );

  if (activePlugin) {
    return (
      <PluginDetail
        key={`${activePlugin.id}:${selectedPlugin?.panel ?? "overview"}:${selectedPlugin?.requestId ?? 0}`}
        plugin={activePlugin}
        inspection={inspection}
        lifecycleControl={controlsByPluginId.get(activePlugin.id)}
        initialPanel={selectedPlugin?.panel ?? "overview"}
        onTogglePlugin={togglePlugin}
        onBack={() => setSelectedPlugin(null)}
      />
    );
  }

  return (
    <div className="plugin-manager">
      <div className="plugin-summary-grid">
        <SummaryTile label="Plugins" value={inspection.plugins.length} />
        <SummaryTile label="Field providers" value={fieldProviders.length} />
        <SummaryTile label="View providers" value={viewProviders.length} />
        <SummaryTile
          label="Extension points"
          value={
            inspection.commands.length +
            inspection.sidebarItems.length +
            inspection.pageActions.length +
            inspection.settingsTabs.length
          }
        />
      </div>

      <section className="management-section">
        <h2>Loaded plugins</h2>
        <table className="manage-table plugin-table">
          <thead>
            <tr>
              <th>Plugin</th>
              <th>ID</th>
              <th>Version</th>
              <th>Permissions</th>
              <th>Status</th>
              <th>Lifecycle</th>
            </tr>
          </thead>
          <tbody>
            {inspection.plugins.map((plugin) => (
              <tr
                key={plugin.id}
                className="plugin-row"
                tabIndex={0}
                onClick={() => setSelectedPlugin({ id: plugin.id, panel: "overview", requestId: Date.now() })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedPlugin({ id: plugin.id, panel: "overview", requestId: Date.now() });
                  }
                }}
              >
                <td className="manage-table-name">
                  <span className="plugin-dot" />
                  <span>{plugin.name}</span>
                </td>
                <td className="manage-table-id">{plugin.id}</td>
                <td className="manage-table-id">{plugin.version}</td>
                <td><PermissionList permissions={plugin.permissions} /></td>
                <td><StatusPill status={plugin.status} /></td>
                <td>
                  <PluginLifecycleButton
                    control={controlsByPluginId.get(plugin.id)}
                    pluginName={plugin.name}
                    onToggle={(enabled) => togglePlugin(plugin.id, enabled)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <ProviderSection
        title="Field providers"
        providers={fieldProviders}
        pluginNameById={pluginNameById}
        onOpenPlugin={(pluginId) => setSelectedPlugin({ id: pluginId, panel: "overview", requestId: Date.now() })}
      />
      <ProviderSection
        title="View providers"
        providers={viewProviders}
        pluginNameById={pluginNameById}
        onOpenPlugin={(pluginId) => setSelectedPlugin({ id: pluginId, panel: "overview", requestId: Date.now() })}
      />
      {otherProviders.length > 0 && (
        <ProviderSection
          title="Other providers"
          providers={otherProviders}
          pluginNameById={pluginNameById}
          onOpenPlugin={(pluginId) => setSelectedPlugin({ id: pluginId, panel: "overview", requestId: Date.now() })}
        />
      )}

      <section className="management-section">
        <h2>Registered extension points</h2>
        <table className="manage-table plugin-table">
          <thead>
            <tr>
              <th>Kind</th>
              <th>ID</th>
              <th>Title</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {[
              ...inspection.commands.map((item) => ({ kind: "Command", item })),
              ...inspection.sidebarItems.map((item) => ({ kind: "Sidebar", item })),
              ...inspection.pageActions.map((item) => ({ kind: "Page action", item })),
              ...inspection.settingsTabs.map((item) => ({ kind: "Settings tab", item }))
            ].map(({ kind, item }) => (
              <tr key={`${kind}-${item.id}`}>
                <td>{kind}</td>
                <td className="manage-table-id">{item.id}</td>
                <td>{item.title}</td>
                <td>
                  <PluginSourceButton
                    pluginId={item.sourcePluginId}
                    pluginNameById={pluginNameById}
                    onOpenPlugin={(pluginId) => setSelectedPlugin({ id: pluginId, panel: "overview", requestId: Date.now() })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {inspection.commands.length + inspection.sidebarItems.length + inspection.pageActions.length + inspection.settingsTabs.length === 0 && (
          <div className="plugin-empty-note">No command, sidebar, page action, or settings tab registrations yet.</div>
        )}
      </section>
    </div>
  );
}

export function PluginDetail({
  plugin,
  inspection,
  lifecycleControl,
  onBack,
  onTogglePlugin,
  initialPanel = "overview"
}: {
  plugin: PluginManifestInspection;
  inspection: PluginHostInspection;
  lifecycleControl?: ReturnType<typeof listBuiltinPluginControls>[number];
  onBack: () => void;
  onTogglePlugin?: (pluginId: string, enabled: boolean) => Promise<void>;
  initialPanel?: "overview" | "settings";
}) {
  const [activePanel, setActivePanel] = useState<"overview" | "settings">(initialPanel);
  const providers = inspection.providers.filter((provider) => provider.sourcePluginId === plugin.id);
  const keyed = collectPluginKeyedItems(inspection, plugin.id);
  const commands = keyed.filter(({ kind }) => kind === "Command");
  const sidebarItems = keyed.filter(({ kind }) => kind === "Sidebar");
  const pageActions = keyed.filter(({ kind }) => kind === "Page action");
  const settingsTabIds = new Set(
    keyed
      .filter(({ kind }) => kind === "Settings tab")
      .map(({ item }) => item.id)
  );
  const settingsTabs = pluginHost.settingsTabs.list().filter((tab) => settingsTabIds.has(tab.id));
  const hasSettings = settingsTabs.length > 0;
  return (
    <div className="plugin-detail-page">
      <button type="button" className="plugin-detail-back" onClick={onBack}>← Plugins</button>
      <section className="plugin-detail-hero">
        <div>
          <div className="plugin-detail-kicker">{plugin.id}</div>
          <h2>{plugin.name}</h2>
          {plugin.description && <p>{plugin.description}</p>}
        </div>
        <div className="plugin-detail-status-stack">
          <StatusPill status={plugin.status} />
          <PluginLifecycleButton
            control={lifecycleControl}
            pluginName={plugin.name}
            onToggle={(enabled) => onTogglePlugin?.(plugin.id, enabled)}
          />
        </div>
      </section>

      <div className="plugin-detail-switcher" role="tablist" aria-label={`${plugin.name} plugin surface`}>
        <button
          type="button"
          role="tab"
          aria-selected={activePanel === "overview"}
          className={activePanel === "overview" ? "active" : ""}
          onClick={() => setActivePanel("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activePanel === "settings"}
          aria-disabled={!hasSettings}
          className={activePanel === "settings" ? "active" : ""}
          disabled={!hasSettings}
          onClick={() => setActivePanel("settings")}
        >
          Settings
        </button>
      </div>

      <div className="plugin-detail-grid">
        <PluginMetaCard label="Version" value={plugin.version} />
        <PluginMetaCard label="Author" value={plugin.author || "Unknown"} />
        <PluginMetaCard label="Permissions" value={plugin.permissions.length ? plugin.permissions.join(", ") : "None"} />
        <PluginMetaCard label="Registrations" value={String(providers.length + keyed.length)} />
      </div>

      {activePanel === "overview" ? (
        <>
          <section className="management-section plugin-workflow-section" data-testid="plugin-workflow-overview">
            <div className="plugin-workflow-header">
              <div>
                <h2>Workflow</h2>
                <p>
                  Primary actions and read-only status stay here. Durable configuration opens in Settings.
                </p>
              </div>
              <button
                type="button"
                className="plugin-settings-jump"
                disabled={!hasSettings}
                onClick={() => setActivePanel("settings")}
              >
                Settings
              </button>
            </div>
            <div className="plugin-workflow-grid" aria-label={`${plugin.name} workflow summary`}>
              <PluginWorkflowStat label="Commands" value={commands.length} />
              <PluginWorkflowStat label="Sidebar entries" value={sidebarItems.length} />
              <PluginWorkflowStat label="Page actions" value={pageActions.length} />
              <PluginWorkflowStat label="Settings tabs" value={settingsTabs.length} />
            </div>
            {commands.length + sidebarItems.length + pageActions.length === 0 && (
              <div className="plugin-empty-note">No daily-use actions are registered for this plugin.</div>
            )}
          </section>

          <ProviderSection title="Providers" providers={providers} pluginNameById={new Map([[plugin.id, plugin.name]])} />
          <section className="management-section">
            <h2>Extension points</h2>
            {keyed.length > 0 ? (
              <table className="manage-table plugin-table">
                <thead>
                  <tr>
                    <th>Kind</th>
                    <th>ID</th>
                    <th>Title</th>
                  </tr>
                </thead>
                <tbody>
                  {keyed.map(({ kind, item }) => (
                    <tr key={`${kind}-${item.id}`}>
                      <td>{kind}</td>
                      <td className="manage-table-id">{item.id}</td>
                      <td>{item.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="plugin-empty-note">No command, sidebar, page action, or settings tab registrations.</div>
            )}
          </section>
        </>
      ) : (
        <section className="management-section plugin-detail-settings-panel" aria-label={`${plugin.name} settings`}>
          <div className="plugin-settings-header">
            <div>
              <h2>Settings</h2>
              <p>Configuration is separated from the plugin workflow so daily-use pages stay quiet.</p>
            </div>
            <button type="button" className="plugin-settings-jump" onClick={() => setActivePanel("overview")}>
              Overview
            </button>
          </div>
          <div className="plugin-settings-stack">
            {settingsTabs.map((tab) => (
              <PluginSettingsTabHost key={tab.id} tab={tab} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PluginSettingsTabHost({ tab }: { tab: SettingsTab }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return undefined;
    ref.current.innerHTML = "";
    const disposable = tab.render(ref.current);
    return () => {
      window.setTimeout(() => disposable?.dispose(), 0);
    };
  }, [tab]);

  return (
    <div className="plugin-settings-tab-host">
      <div ref={ref} />
    </div>
  );
}

function PluginMetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="plugin-meta-card">
      <div className="plugin-meta-label">{label}</div>
      <div className="plugin-meta-value">{value}</div>
    </div>
  );
}

function PluginWorkflowStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="plugin-workflow-stat">
      <div className="plugin-workflow-value">{value}</div>
      <div className="plugin-workflow-label">{label}</div>
    </div>
  );
}

function collectPluginKeyedItems(
  inspection: PluginHostInspection,
  pluginId: string
): Array<{ kind: string; item: PluginKeyedInspection }> {
  return [
    ...inspection.commands.filter((item) => item.sourcePluginId === pluginId).map((item) => ({ kind: "Command", item })),
    ...inspection.sidebarItems.filter((item) => item.sourcePluginId === pluginId).map((item) => ({ kind: "Sidebar", item })),
    ...inspection.pageActions.filter((item) => item.sourcePluginId === pluginId).map((item) => ({ kind: "Page action", item })),
    ...inspection.settingsTabs.filter((item) => item.sourcePluginId === pluginId).map((item) => ({ kind: "Settings tab", item }))
  ];
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="plugin-summary-tile">
      <div className="plugin-summary-value">{value}</div>
      <div className="plugin-summary-label">{label}</div>
    </div>
  );
}

function ProviderSection({
  title,
  providers,
  pluginNameById,
  onOpenPlugin
}: {
  title: string;
  providers: PluginProviderInspection[];
  pluginNameById: Map<string, string>;
  onOpenPlugin?: (pluginId: string) => void;
}) {
  return (
    <section className="management-section">
      <h2>{title}</h2>
      <table className="manage-table plugin-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Type</th>
            <th>Kind</th>
            <th>Source</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((provider) => (
            <tr key={`${provider.kind}-${provider.type}`}>
              <td className="manage-table-name">
                <span className="plugin-provider-icon">{provider.icon ?? "·"}</span>
                <span>{provider.label}</span>
              </td>
              <td className="manage-table-id">{provider.type}</td>
              <td className="manage-table-id">{provider.kind}</td>
              <td>
                <PluginSourceButton
                  pluginId={provider.sourcePluginId}
                  pluginNameById={pluginNameById}
                  onOpenPlugin={onOpenPlugin}
                />
              </td>
              <td><StatusPill status={provider.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className={status === "disabled" ? "plugin-status-pill disabled" : "plugin-status-pill"}>{status}</span>;
}

function PluginLifecycleButton({
  control,
  pluginName,
  onToggle
}: {
  control: ReturnType<typeof listBuiltinPluginControls>[number] | undefined;
  pluginName: string;
  onToggle: (enabled: boolean) => Promise<void> | void;
}) {
  if (!control) {
    return <span className="plugin-lifecycle-note">Host managed</span>;
  }
  if (control.locked) {
    return <span className="plugin-lifecycle-note">Required</span>;
  }
  const nextEnabled = !control.enabled;
  return (
    <button
      type="button"
      className={control.enabled ? "plugin-lifecycle-button" : "plugin-lifecycle-button disabled"}
      aria-label={`${control.enabled ? "Disable" : "Enable"} ${pluginName}`}
      onClick={(event) => {
        event.stopPropagation();
        void onToggle(nextEnabled);
      }}
    >
      {control.enabled ? "Disable" : "Enable"}
    </button>
  );
}

function PermissionList({ permissions }: { permissions: string[] }) {
  if (permissions.length === 0) {
    return <span className="plugin-permission-empty">None</span>;
  }
  return (
    <span className="plugin-permission-list">
      {permissions.map((permission) => (
        <span key={permission} className="plugin-permission-pill">{permission}</span>
      ))}
    </span>
  );
}

function sourceLabel(pluginId: string | undefined, pluginNameById: Map<string, string>): string {
  if (!pluginId) return "Host";
  const name = pluginNameById.get(pluginId);
  return name ? `${name} (${pluginId})` : pluginId;
}

function PluginSourceButton({
  pluginId,
  pluginNameById,
  onOpenPlugin
}: {
  pluginId: string | undefined;
  pluginNameById: Map<string, string>;
  onOpenPlugin?: (pluginId: string) => void;
}) {
  const label = sourceLabel(pluginId, pluginNameById);
  if (!pluginId || !pluginNameById.has(pluginId) || !onOpenPlugin) {
    return <span>{label}</span>;
  }
  return (
    <button
      type="button"
      className="plugin-source-button"
      onClick={() => onOpenPlugin(pluginId)}
    >
      {label}
    </button>
  );
}

type DatabaseSortKey = "name" | "pageCount" | "nonEmptyPageCount" | "fieldCount" | "lastOpenedAt" | "openCount";
type SortDirection = "asc" | "desc";

interface DatabaseActivity {
  lastOpenedAt?: string;
  openCount: number;
}

function DatabasesTable({
  databases,
  recents,
  onOpen
}: {
  databases: DatabaseSummary[];
  recents: RecentItem[];
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const [statsById, setStatsById] = useState<Record<string, DatabaseStats>>({});
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [sort, setSort] = useState<{ key: DatabaseSortKey; direction: SortDirection }>({
    key: "pageCount",
    direction: "desc"
  });

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    window.lotion.databases
      .listStats()
      .then((stats) => {
        if (cancelled) return;
        setStatsById(Object.fromEntries(stats.map((item) => [item.id, item])));
      })
      .catch((error) => {
        console.error("[lotion] database stats failed:", error);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshStats() {
    setStatsRefreshing(true);
    try {
      const stats = await window.lotion.databases.refreshStats();
      setStatsById(Object.fromEntries(stats.map((item) => [item.id, item])));
    } catch (error) {
      console.error("[lotion] database stats refresh failed:", error);
    } finally {
      setStatsRefreshing(false);
      setStatsLoading(false);
    }
  }

  const activityById = useMemo(() => collectDatabaseActivity(recents), [recents]);
  const rows = useMemo(() => {
    return databases
      .map((db) => ({
        db,
        stats: statsById[db.id],
        activity: activityById.get(db.id) ?? { openCount: 0 }
      }))
      .sort((a, b) => compareDatabaseRows(a, b, sort.key, sort.direction));
  }, [activityById, databases, sort.direction, sort.key, statsById]);

  const summary = useMemo(() => {
    let pageCount = 0;
    let nonEmptyPageCount = 0;
    let openCount = 0;
    for (const row of rows) {
      pageCount += row.stats?.pageCount ?? 0;
      nonEmptyPageCount += row.stats?.nonEmptyPageCount ?? 0;
      openCount += row.activity.openCount;
    }
    return { pageCount, nonEmptyPageCount, openCount };
  }, [rows]);

  function updateSort(key: DatabaseSortKey) {
    setSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: key === "name" ? "asc" : "desc" };
    });
  }

  return (
    <>
      <div className="management-toolbar">
        <div className="management-hint">{t("manage.cachedStatsHint")}</div>
        <button
          type="button"
          className="secondary"
          onClick={refreshStats}
          disabled={statsRefreshing}
        >
          {statsRefreshing ? t("manage.refreshingStats") : t("manage.refreshStats")}
        </button>
      </div>
      <div className="management-summary-grid" aria-label={t("manage.databaseStats")}>
        <SummaryMetric label={t("manage.databaseCount")} value={databases.length} />
        <SummaryMetric label={t("manage.pageCount")} value={statsLoading || statsRefreshing ? null : summary.pageCount} />
        <SummaryMetric label={t("manage.nonEmptyPageCount")} value={statsLoading || statsRefreshing ? null : summary.nonEmptyPageCount} />
        <SummaryMetric label={t("manage.openCount")} value={summary.openCount} />
      </div>
      <table className="manage-table database-manage-table">
        <thead>
          <tr>
            <SortableHeader label={t("field.name")} column="name" sort={sort} onSort={updateSort} />
            <SortableHeader label={t("manage.pageCount")} column="pageCount" sort={sort} onSort={updateSort} align="number" />
            <SortableHeader label={t("manage.nonEmptyPageCount")} column="nonEmptyPageCount" sort={sort} onSort={updateSort} align="number" />
            <SortableHeader label={t("manage.fieldCount")} column="fieldCount" sort={sort} onSort={updateSort} align="number" />
            <SortableHeader label={t("manage.lastOpened")} column="lastOpenedAt" sort={sort} onSort={updateSort} />
            <SortableHeader label={t("manage.openCount")} column="openCount" sort={sort} onSort={updateSort} align="number" />
            <th className="manage-table-id">ID</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ db, stats, activity }) => (
            <tr key={db.id} onClick={() => onOpen(db.id)}>
              <td className="manage-table-name">
                <EntityIcon kind="database" icon={db.icon} size={18} />
                <span className="manage-table-title-stack">
                  <span>{db.name}</span>
                  {databasePathLabel(db) && <small>{databasePathLabel(db)}</small>}
                </span>
              </td>
              <td className="manage-table-number">{formatStat(stats?.pageCount, statsLoading || statsRefreshing)}</td>
              <td className="manage-table-number">{formatStat(stats?.nonEmptyPageCount, statsLoading || statsRefreshing)}</td>
              <td className="manage-table-number">{formatStat(stats?.fieldCount, statsLoading || statsRefreshing)}</td>
              <td className="manage-table-updated">{activity.lastOpenedAt ? formatDate(activity.lastOpenedAt) : t("manage.neverOpened")}</td>
              <td className="manage-table-number">{activity.openCount}</td>
              <td className="manage-table-id">{db.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function databasePathLabel(db: DatabaseSummary): string {
  const segments = (db.path ?? []).map((segment) => segment.trim()).filter(Boolean);
  if (segments.length <= 1) return "";
  return segments.join(" / ");
}

function pagePathLabel(page: PageMeta): string {
  const segments = (page.path ?? []).map((segment) => segment.trim()).filter(Boolean);
  if (segments.length <= 1) return "";
  return segments.join(" / ");
}

function SummaryMetric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="management-summary-item">
      <div className="management-summary-number">{value === null ? "..." : value.toLocaleString()}</div>
      <div className="management-summary-label">{label}</div>
    </div>
  );
}

function SortableHeader({
  label,
  column,
  sort,
  onSort,
  align
}: {
  label: string;
  column: DatabaseSortKey;
  sort: { key: DatabaseSortKey; direction: SortDirection };
  onSort: (column: DatabaseSortKey) => void;
  align?: "number";
}) {
  const active = sort.key === column;
  return (
    <th className={align === "number" ? "manage-table-number" : undefined}>
      <button className={active ? "manage-sort-button active" : "manage-sort-button"} onClick={() => onSort(column)}>
        <span>{label}</span>
        <span className="manage-sort-indicator">{active ? (sort.direction === "asc" ? "↑" : "↓") : ""}</span>
      </button>
    </th>
  );
}

function collectDatabaseActivity(recents: RecentItem[]): Map<string, DatabaseActivity> {
  const result = new Map<string, DatabaseActivity>();
  for (const item of recents) {
    const databaseId = item.type === "database"
      ? item.id
      : item.type === "row_page"
        ? item.databaseId
        : null;
    if (!databaseId) continue;
    const current = result.get(databaseId) ?? { openCount: 0 };
    if (!current.lastOpenedAt || dateValue(item.at) > dateValue(current.lastOpenedAt)) {
      current.lastOpenedAt = item.at;
    }
    current.openCount += item.count ?? 1;
    result.set(databaseId, current);
  }
  return result;
}

function compareDatabaseRows(
  a: { db: DatabaseSummary; stats?: DatabaseStats; activity: DatabaseActivity },
  b: { db: DatabaseSummary; stats?: DatabaseStats; activity: DatabaseActivity },
  key: DatabaseSortKey,
  direction: SortDirection
): number {
  const multiplier = direction === "asc" ? 1 : -1;
  let result = 0;
  if (key === "name") {
    result = a.db.name.localeCompare(b.db.name);
  } else if (key === "lastOpenedAt") {
    result = dateValue(a.activity.lastOpenedAt) - dateValue(b.activity.lastOpenedAt);
  } else if (key === "openCount") {
    result = a.activity.openCount - b.activity.openCount;
  } else {
    result = (a.stats?.[key] ?? -1) - (b.stats?.[key] ?? -1);
  }
  if (result === 0) return a.db.name.localeCompare(b.db.name);
  return result * multiplier;
}

function dateValue(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatStat(value: number | undefined, loading: boolean): string {
  if (value === undefined) return loading ? "..." : "—";
  return value.toLocaleString();
}


function PagesTable({
  pages,
  onOpen
}: {
  pages: PageMeta[];
  onOpen: (id: string) => void;
}) {
  return (
    <table className="manage-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {pages.map((page) => (
          <tr key={page.id} onClick={() => onOpen(page.id)}>
            <td className="manage-table-name">
              <EntityIcon kind="page" icon={page.icon} size={18} />
              <span>{page.title}</span>
            </td>
            <td className="manage-table-updated">{formatDate(page.updated_time)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TagItemsTable({
  tag,
  pages,
  databases,
  onOpenPage,
  onOpenDatabase
}: {
  tag: string;
  pages: PageMeta[];
  databases: DatabaseSummary[];
  onOpenPage: (id: string) => void;
  onOpenDatabase: (id: string) => void;
}) {
  const { t } = useI18n();
  const rows = [
    ...pages.map((page) => ({
      key: `page-${page.id}`,
      kind: "page" as const,
      title: page.title,
      icon: page.icon,
      path: pagePathLabel(page),
      updated: page.updated_time,
      onOpen: () => onOpenPage(page.id)
    })),
    ...databases.map((database) => ({
      key: `database-${database.id}`,
      kind: "database" as const,
      title: database.name,
      icon: database.icon,
      path: databasePathLabel(database),
      updated: "",
      onOpen: () => onOpenDatabase(database.id)
    }))
  ].sort((a, b) => {
    const updated = dateValue(b.updated) - dateValue(a.updated);
    if (updated !== 0) return updated;
    return a.title.localeCompare(b.title);
  });

  return (
    <div className="tag-management-view" data-testid="tag-management-view">
      <div className="management-summary-grid tag-management-summary" aria-label={t("manage.tagSummary")}>
        <SummaryMetric label={t("sidebar.pages")} value={pages.length} />
        <SummaryMetric label={t("sidebar.databases")} value={databases.length} />
        <SummaryMetric label={t("manage.tagItems")} value={rows.length} />
        <div className="management-summary-item tag-management-token">
          <div className="management-summary-number">#{tag}</div>
          <div className="management-summary-label">{t("manage.tag")}</div>
        </div>
      </div>
      <table className="manage-table tag-manage-table">
        <thead>
          <tr>
            <th>{t("field.name")}</th>
            <th>{t("field.type")}</th>
            <th>{t("manage.path")}</th>
            <th>{t("manage.updated")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              tabIndex={0}
              onClick={row.onOpen}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  row.onOpen();
                }
              }}
            >
              <td className="manage-table-name">
                <EntityIcon kind={row.kind} icon={row.icon} size={18} />
                <span>{row.title}</span>
              </td>
              <td className="manage-table-kind">{row.kind === "database" ? t("page.backlinkSourceDatabase") : t("page.backlinkSourcePage")}</td>
              <td className="manage-table-path">{row.path || "—"}</td>
              <td className="manage-table-updated">{formatDate(row.updated)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="plugin-empty-note">{t("manage.noTaggedItems")}</div>
      )}
    </div>
  );
}

function RecentsTable({
  recents,
  pages,
  databases,
  onOpenPage,
  onOpenDatabase,
  onOpenRowPage
}: {
  recents: RecentItem[];
  pages: PageMeta[];
  databases: DatabaseSummary[];
  onOpenPage: (id: string) => void;
  onOpenDatabase: (id: string) => void;
  onOpenRowPage: (databaseId: string, rowId: string) => void;
}) {
  const { t } = useI18n();
  const cache = useDatabaseCache();
  useEffect(() => {
    const databaseIds = new Set(
      recents.filter((item) => item.type === "row_page").map((item) => item.databaseId)
    );
    for (const databaseId of databaseIds) {
      if (!cache.getBundle(databaseId)) void cache.loadBundle(databaseId).catch(console.error);
    }
  }, [cache, recents]);
  return (
    <table className="manage-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Kind</th>
          <th>Visited</th>
        </tr>
      </thead>
      <tbody>
        {recents.map((r, i) => {
          if (r.type === "page") {
            const page = pages.find((p) => p.id === r.id);
            return (
              <tr key={`p-${r.id}-${i}`} onClick={() => onOpenPage(r.id)}>
                <td className="manage-table-name">
                  <EntityIcon kind="page" icon={page?.icon} size={18} />
                  <span>{page?.title ?? r.id}</span>
                </td>
                <td>页面</td>
                <td className="manage-table-updated">{formatDate(r.at)}</td>
              </tr>
            );
          }
          if (r.type === "database") {
            const db = databases.find((d) => d.id === r.id);
            return (
              <tr key={`d-${r.id}-${i}`} onClick={() => onOpenDatabase(r.id)}>
                <td className="manage-table-name">
                  <EntityIcon kind="database" icon={db?.icon} size={18} />
                  <span>{db?.name ?? r.id}</span>
                </td>
                <td>数据库</td>
                <td className="manage-table-updated">{formatDate(r.at)}</td>
              </tr>
            );
          }
          const display = rowPageDisplay(cache.getBundle(r.databaseId), r.rowId, r.title, r.icon, t("rowPage.noTitle"));
          return (
            <tr
              key={`rp-${r.databaseId}-${r.rowId}-${i}`}
              onClick={() => onOpenRowPage(r.databaseId, r.rowId)}
            >
              <td className="manage-table-name">
                <EntityIcon kind="row_page" icon={display.icon} size={18} />
                <span>{display.title}</span>
              </td>
              <td>行的页面</td>
              <td className="manage-table-updated">{formatDate(r.at)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FavoritesTable({
  favorites,
  pages,
  databases,
  onOpenPage,
  onOpenRowPage
}: {
  favorites: FavoriteItem[];
  pages: PageMeta[];
  databases: DatabaseSummary[];
  onOpenPage: (id: string) => void;
  onOpenRowPage: (databaseId: string, rowId: string) => void;
}) {
  const { t } = useI18n();
  const cache = useDatabaseCache();
  useEffect(() => {
    const databaseIds = new Set(
      favorites.filter((item) => item.type === "row_page").map((item) => item.databaseId)
    );
    for (const databaseId of databaseIds) {
      if (!cache.getBundle(databaseId)) void cache.loadBundle(databaseId).catch(console.error);
    }
  }, [cache, favorites]);

  if (favorites.length === 0) {
    return <div className="plugin-empty-note">{t("manage.noFavorites")}</div>;
  }

  return (
    <table className="manage-table" data-testid="favorites-management-view">
      <thead>
        <tr>
          <th>Item</th>
          <th>Kind</th>
          <th>Context</th>
        </tr>
      </thead>
      <tbody>
        {favorites.map((favorite, index) => {
          if (favorite.type === "page") {
            const page = pages.find((item) => item.id === favorite.id);
            const title = page?.title ?? favorite.id;
            const context = page ? pagePathLabel(page) || "Page" : "Page";
            return (
              <tr key={`favorite-page-${favorite.id}-${index}`} onClick={() => onOpenPage(favorite.id)}>
                <td className="manage-table-name">
                  <EntityIcon kind="page" icon={page?.icon} size={18} />
                  <span>{title}</span>
                </td>
                <td>{t("page.backlinkSourcePage")}</td>
                <td>{context}</td>
              </tr>
            );
          }

          const database = databases.find((item) => item.id === favorite.databaseId);
          const display = rowPageDisplay(
            cache.getBundle(favorite.databaseId),
            favorite.rowId,
            undefined,
            undefined,
            t("rowPage.noTitle")
          );
          const context = database
            ? databasePathLabel(database) || database.name
            : favorite.databaseId;
          return (
            <tr
              key={`favorite-row-${favorite.databaseId}-${favorite.rowId}-${index}`}
              onClick={() => onOpenRowPage(favorite.databaseId, favorite.rowId)}
            >
              <td className="manage-table-name">
                <EntityIcon kind="row_page" icon={display.icon} size={18} />
                <span>{display.title}</span>
              </td>
              <td>{t("page.backlinkSourceRow")}</td>
              <td>{context}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Locale-free YYYY/MM/DD HH:mm so the column stays narrow.
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yy}/${mm}/${dd} ${hh}:${mi}`;
}
