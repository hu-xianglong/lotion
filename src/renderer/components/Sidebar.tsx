import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactElement } from "react";
import { isTagManageKind, tagFromManageKind, tagManageKind, type AppState, type ManageKind } from "../state/app-store";
import { SearchBox } from "../features/search/SearchBox";
import { BackupButton } from "../features/backup/BackupButton";
import { NotionImportDialog } from "../../builtin-plugins/notion-import/NotionImportDialog";
import { WorkspaceSelector } from "./WorkspaceSelector";
import { ShortcutSettings } from "./ShortcutSettings";
import { useLotionActions } from "../context/lotion-actions";
import { useDatabaseCache } from "../context/database-cache";
import { pluginHost } from "../plugin-host";
import { useI18n, type I18nContextValue } from "../lib/i18n";
import { rowPageDisplay } from "../lib/row-page-display";
import { DEFAULT_SIDEBAR_TAGS, useSettings } from "../lib/settings";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FolderClosedIcon,
  FolderOpenIcon,
  GenericFileIcon,
  NewPageIcon,
  PageFileIcon,
  SettingsIcon
} from "./Icons";
import { EntityIcon } from "./EntityIcon";
import type { CreatePageInput, DatabaseSummary, PageMeta, PagesTree } from "../../shared/types";
import { databaseFolderName, pageMarkdownFileName } from "../../shared/workspace-paths";

// ── Files section helpers ─────────────────────────────────────────────

interface FileTreeRowProps {
  path: string;
  depth: number;
  icon: ReactElement;
  label: string;
  onClick?: () => void;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}

interface SidebarPageTreeNode {
  page: PageMeta;
  children: SidebarPageTreeNode[];
}

function FileTreeRow({
  depth,
  icon,
  label,
  onClick,
  expandable,
  expanded,
  onToggle
}: FileTreeRowProps) {
  return (
    <div
      className={onClick ? "file-tree-row clickable" : "file-tree-row"}
      style={{ paddingLeft: 6 + depth * 14 }}
    >
      <span className="file-tree-chevron">
        {expandable ? (
          <button
            type="button"
            className="file-tree-chevron-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.();
            }}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
        ) : null}
      </span>
      <button
        type="button"
        className="file-tree-name"
        onClick={onClick}
        disabled={!onClick}
        title={label}
      >
        <span className="file-tree-icon">{icon}</span>
        <span className="file-tree-label">{label}</span>
      </button>
    </div>
  );
}

interface FilesSectionProps {
  tree: PagesTree | undefined;
  databases: DatabaseSummary[];
  systemDatabases: string[];
  expandedTreePaths: Set<string>;
  onTogglePath: (path: string) => void;
  onSelectPage: (id: string) => void;
  onSelectDatabase: (id: string) => void;
  onOpenRowPageByFile: (databaseId: string, fileName: string) => void;
  filesLabel: string;
}

function FilesSection({
  tree,
  databases,
  systemDatabases,
  expandedTreePaths,
  onTogglePath,
  onSelectPage,
  onSelectDatabase,
  onOpenRowPageByFile,
  filesLabel
}: FilesSectionProps) {
  const rootOpen = expandedTreePaths.has("files");
  const dbsOpen = expandedTreePaths.has("files/databases");
  const userDbsOpen = expandedTreePaths.has("files/databases/user");
  const systemDbsOpen = expandedTreePaths.has("files/databases/system");

  return (
    <section className="nav-section files-tree">
      <div className="section-heading">
        <button
          type="button"
          className="section-heading-toggle"
          onClick={() => onTogglePath("files")}
          aria-expanded={rootOpen}
        >
          <span className="file-tree-chevron-inline">
            {rootOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </span>
          <span>{filesLabel}</span>
        </button>
      </div>
      {rootOpen && (
        <>
          <FileTreeRow
            path="files/lotion.json"
            depth={0}
            icon={<GenericFileIcon />}
            label="lotion.json"
          />

          <FileTreeRow
            path="files/databases"
            depth={0}
            icon={dbsOpen ? <FolderOpenIcon /> : <FolderClosedIcon />}
            label="databases/"
            expandable
            expanded={dbsOpen}
            onToggle={() => onTogglePath("files/databases")}
          />
          {dbsOpen && (
            <>
              <FileTreeRow
                path="files/databases/user"
                depth={1}
                icon={userDbsOpen ? <FolderOpenIcon /> : <FolderClosedIcon />}
                label="user/"
                expandable
                expanded={userDbsOpen}
                onToggle={() => onTogglePath("files/databases/user")}
              />
              {userDbsOpen && databases.map((database) => (
                <DatabaseFileTree
                  key={database.id}
                  databaseId={database.id}
                  name={database.name}
                  depth={2}
                  basePath="files/databases/user"
                  rowFiles={tree?.databases.find((f) => f.databaseId === database.id)?.fileNames ?? []}
                  expandedTreePaths={expandedTreePaths}
                  onTogglePath={onTogglePath}
                  onSelectDatabase={onSelectDatabase}
                  onOpenRowPageByFile={onOpenRowPageByFile}
                />
              ))}
              <FileTreeRow
                path="files/databases/system"
                depth={1}
                icon={systemDbsOpen ? <FolderOpenIcon /> : <FolderClosedIcon />}
                label="system/"
                expandable
                expanded={systemDbsOpen}
                onToggle={() => onTogglePath("files/databases/system")}
              />
              {systemDbsOpen && systemDatabases.map((databaseId) => (
                <DatabaseFileTree
                  key={databaseId}
                  databaseId={databaseId}
                  name={systemDatabaseName(databaseId)}
                  depth={2}
                  basePath="files/databases/system"
                  rowFiles={databaseId === "pages" ? tree?.topLevelPages.map((page) => pageMarkdownFileName(page.id, page.title)) ?? [] : []}
                  expandedTreePaths={expandedTreePaths}
                  onTogglePath={onTogglePath}
                  onSelectDatabase={onSelectDatabase}
                  onOpenRowPageByFile={databaseId === "pages"
                    ? (_databaseId, fileName) => {
                        const page = tree?.topLevelPages.find((item) => pageMarkdownFileName(item.id, item.title) === fileName);
                        if (page) onSelectPage(page.id);
                      }
                    : onOpenRowPageByFile}
                />
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}

interface DatabaseFileTreeProps {
  databaseId: string;
  name: string;
  depth: number;
  basePath: string;
  rowFiles: string[];
  expandedTreePaths: Set<string>;
  onTogglePath: (path: string) => void;
  onSelectDatabase: (id: string) => void;
  onOpenRowPageByFile: (databaseId: string, fileName: string) => void;
}

function DatabaseFileTree({
  databaseId,
  name,
  depth,
  basePath,
  rowFiles,
  expandedTreePaths,
  onTogglePath,
  onSelectDatabase,
  onOpenRowPageByFile
}: DatabaseFileTreeProps) {
  const folderName = databaseFolderName(databaseId, name);
  const folderPath = `${basePath}/${folderName}`;
  const open = expandedTreePaths.has(folderPath);
  const pagesPath = `${folderPath}/pages`;
  const pagesOpen = expandedTreePaths.has(pagesPath);
  return (
    <div key={folderPath}>
      <FileTreeRow
        path={folderPath}
        depth={depth}
        icon={open ? <FolderOpenIcon /> : <FolderClosedIcon />}
        label={`${folderName}/`}
        expandable
        expanded={open}
        onToggle={() => onTogglePath(folderPath)}
      />
      {open && (
        <>
          <FileTreeRow path={`${folderPath}/schema.json`} depth={depth + 1} icon={<GenericFileIcon />} label="schema.json" />
          <FileTreeRow
            path={`${folderPath}/data.csv`}
            depth={depth + 1}
            icon={<GenericFileIcon />}
            label="data.csv"
            onClick={() => onSelectDatabase(databaseId)}
          />
          <FileTreeRow path={`${folderPath}/views`} depth={depth + 1} icon={<FolderClosedIcon />} label="views/" />
          <FileTreeRow
            path={pagesPath}
            depth={depth + 1}
            icon={pagesOpen ? <FolderOpenIcon /> : <FolderClosedIcon />}
            label="pages/"
            expandable
            expanded={pagesOpen}
            onToggle={() => onTogglePath(pagesPath)}
          />
          {pagesOpen && rowFiles.map((fileName) => (
            <FileTreeRow
              key={`${pagesPath}/${fileName}`}
              path={`${pagesPath}/${fileName}`}
              depth={depth + 2}
              icon={<PageFileIcon />}
              label={fileName}
              onClick={() => onOpenRowPageByFile(databaseId, fileName)}
            />
          ))}
        </>
      )}
    </div>
  );
}

function systemDatabaseName(id: string): string {
  if (id === "pages") return "pages";
  if (id === "workspaces") return "workspaces";
  if (id === "database_stats") return "database_stats";
  return id;
}

interface SidebarProps {
  state: AppState;
  onOpenSearch: () => void;
  onOpenSearchAi: () => void;
  /** Called after a successful sidebar reorder — host should refresh
   *  the pages / databases lists to pick up the new manifest order. */
  onReordered?: () => void;
  settingsOpenRequest?: number;
}

const SEARCH_AI_SIDEBAR_PLUGIN_IDS = new Set(["advanced-search.open", "llm-openai.chat"]);

interface SidebarPageContextMenu {
  page: PageMeta;
  left: number;
  top: number;
}

export function SidebarPageContextMenuView({
  page,
  left,
  top,
  onOpen,
  onCreateChild,
  onDelete
}: {
  page: PageMeta;
  left: number;
  top: number;
  onOpen: () => void;
  onCreateChild: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="sidebar-context-menu"
      role="menu"
      aria-label={page.title}
      style={{ left, top }}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" role="menuitem" onClick={onOpen}>
        <span className="sidebar-context-menu-icon"><PageFileIcon /></span>
        <span>{t("sidebar.contextOpen")}</span>
      </button>
      <button type="button" role="menuitem" onClick={onCreateChild}>
        <span className="sidebar-context-menu-icon"><NewPageIcon /></span>
        <span>{t("sidebar.contextNewChild")}</span>
      </button>
      <button type="button" role="menuitem" className="danger" onClick={onDelete}>
        <span className="sidebar-context-menu-icon">×</span>
        <span>{t("sidebar.contextDelete")}</span>
      </button>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const { t, locale, setLocale } = useI18n();
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
  const actions = useLotionActions();
  // Files-tree expansion is independent of Databases-section expansion,
  // and uses path-based keys so each nested folder remembers its own
  // state regardless of where it appears.
  const [expandedTreePaths, setExpandedTreePaths] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pageContextMenu, setPageContextMenu] = useState<SidebarPageContextMenu | null>(null);
  const quickCreateRef = useRef<HTMLDivElement>(null);
  const settingsSummaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!quickCreateOpen) return;
    const closeIfOutside = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && quickCreateRef.current?.contains(target)) return;
      setQuickCreateOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQuickCreateOpen(false);
    };
    document.addEventListener("mousedown", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [quickCreateOpen]);

  useEffect(() => {
    if (!pageContextMenu) return;
    const close = () => setPageContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("contextmenu", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("contextmenu", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [pageContextMenu]);

  useEffect(() => {
    if (!props.settingsOpenRequest) return;
    setSettingsOpen(true);
    window.requestAnimationFrame(() => settingsSummaryRef.current?.focus());
  }, [props.settingsOpenRequest]);

  function toggleTreePath(path: string) {
    setExpandedTreePaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }
  const pages = props.state.pages;
  const databases = props.state.databases;
  const tree = props.state.pagesTree;
  const active = props.state.activeItem;
  const sidebarTagOptions = collectSidebarTagOptions(pages, databases);
  const sidebarSections = buildSidebarSections(sidebarTags, pages, databases);
  const pluginSidebarItems = pluginHost.sidebar
    .list()
    .filter((item) => !SEARCH_AI_SIDEBAR_PLUGIN_IDS.has(item.id))
    .slice()
    .sort((left, right) => (left.order ?? 1000) - (right.order ?? 1000) || left.title.localeCompare(right.title));

  const backTitle = actions.backLabel ? `Back to ${actions.backLabel}` : "Back";
  const forwardTitle = actions.forwardLabel ? `Forward to ${actions.forwardLabel}` : "Forward";

  function openPageContextMenu(page: PageMeta, event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 192;
    const menuHeight = 132;
    setPageContextMenu({
      page,
      left: Math.min(Math.max(event.clientX, 8), window.innerWidth - menuWidth - 8),
      top: Math.min(Math.max(event.clientY, 8), window.innerHeight - menuHeight - 8)
    });
  }

  async function deleteContextPage(page: PageMeta) {
    setPageContextMenu(null);
    if (!window.confirm(t("sidebar.confirmDeletePage"))) return;
    await actions.deletePage(page.id);
  }

  function createContextChildPage(page: PageMeta) {
    const childTitle = t("common.untitled");
    const parentPath = page.path && page.path.length > 0 ? page.path : [page.title];
    setPageContextMenu(null);
    actions.createPage({
      title: childTitle,
      parentId: page.id,
      parentKind: "page",
      path: [...parentPath, childTitle]
    });
  }

  return (
    <aside className="sidebar">
      <div className="space-title">
        <div className="nav-history">
          <button
            type="button"
            className="nav-history-btn"
            onClick={actions.goBack}
            disabled={!actions.canBack}
            title={backTitle}
            aria-label={backTitle}
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className="nav-history-btn"
            onClick={actions.goForward}
            disabled={!actions.canForward}
            title={forwardTitle}
            aria-label={forwardTitle}
          >
            <ChevronRightIcon />
          </button>
        </div>
        <WorkspaceSelector
          currentName={props.state.manifest?.name || "Lotion"}
          currentIcon={props.state.manifest?.icon}
          onImportNotion={() => setImportOpen(true)}
          onWorkspaceIconChanged={props.onReordered}
        />
      </div>
      <SearchBox onOpen={props.onOpenSearch} />

      <div className="sidebar-scroll">
        <FavoritesSection
          state={props.state}
          onOpenPage={actions.selectPage}
          onOpenRowPage={(databaseId, rowId) => actions.openRowPage(databaseId, rowId)}
        />
        <RecentsSection
          state={props.state}
          onOpenPage={actions.selectPage}
          onOpenDatabase={actions.selectDatabase}
          onOpenRowPage={(databaseId, rowId) => actions.openRowPage(databaseId, rowId)}
        />
        {sidebarSections.map((section) => (
          <SidebarTagSection
            key={section.key}
            section={section}
            active={active}
            onOpenPage={actions.selectPage}
            onOpenDatabase={actions.selectDatabase}
            onOpenManage={actions.openManage}
            onCreatePage={actions.createPage}
            onCreateDatabase={actions.createDatabase}
            onPageContextMenu={openPageContextMenu}
          />
        ))}
        <FilesSection
          tree={tree}
          databases={databases}
          systemDatabases={props.state.manifest?.systemDatabases ?? []}
          expandedTreePaths={expandedTreePaths}
          onTogglePath={toggleTreePath}
          onSelectPage={actions.selectPage}
          onSelectDatabase={actions.selectDatabase}
          onOpenRowPageByFile={actions.openRowPageByFile}
          filesLabel={t("sidebar.files")}
        />
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-quick-create" ref={quickCreateRef} aria-label={t("sidebar.quickCreate")}>
          <button
            type="button"
            className={quickCreateOpen ? "sidebar-quick-create-button active" : "sidebar-quick-create-button"}
            onClick={() => setQuickCreateOpen((open) => !open)}
            title={t("sidebar.quickCreate")}
            aria-label={t("sidebar.quickCreate")}
            aria-haspopup="menu"
            aria-expanded={quickCreateOpen}
          >
            <NewPageIcon />
          </button>
          {quickCreateOpen && (
            <div className="sidebar-quick-create-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setQuickCreateOpen(false);
                  actions.createPage();
                }}
              >
                <span className="sidebar-quick-create-menu-icon"><NewPageIcon /></span>
                <span>{t("sidebar.newPage")}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setQuickCreateOpen(false);
                  actions.createDatabase();
                }}
              >
                <span className="sidebar-quick-create-menu-icon"><DatabaseIcon /></span>
                <span>{t("sidebar.newDatabase")}</span>
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className="sidebar-footer-link"
          onClick={props.onOpenSearchAi}
          title="Search & AI"
        >
          <span className="nav-item-icon">⌕</span>
          <span className="nav-item-label">Search &amp; AI</span>
        </button>
        {pluginSidebarItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className="sidebar-footer-link"
            onClick={() => item.onClick()}
            title={item.title}
          >
            <span className="nav-item-icon">{item.icon ?? "◇"}</span>
            <span className="nav-item-label">{item.title}</span>
          </button>
        ))}
        <button
          type="button"
          className="sidebar-footer-link"
          onClick={() => actions.openManage("plugins")}
        >
          <span className="nav-item-icon">◇</span>
          <span className="nav-item-label">{t("sidebar.plugins")}</span>
        </button>
        <button
          type="button"
          className="sidebar-footer-link"
          onClick={() => actions.openManage("settings")}
        >
          <span className="nav-item-icon"><SettingsIcon /></span>
          <span className="nav-item-label">{t("sidebar.settings")}</span>
        </button>
        <details
          className="sidebar-settings"
          open={settingsOpen}
          onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
        >
          <summary className="sidebar-settings-summary" ref={settingsSummaryRef}>
            <span className="nav-item-icon"><SettingsIcon /></span>
            <span className="nav-item-label">{locale === "zh" ? "快速设置" : "Quick settings"}</span>
          </summary>
          <div className="sidebar-settings-panel">
        <div className="language-toggle" role="group" aria-label={t("sidebar.languageLabel")}>
          <button
            className={locale === "en" ? "active" : ""}
            onClick={() => setLocale("en")}
          >
            {t("sidebar.languageEN")}
          </button>
          <button
            className={locale === "zh" ? "active" : ""}
            onClick={() => setLocale("zh")}
          >
            {t("sidebar.languageZH")}
          </button>
        </div>
        <div className="vim-toggle" role="group" aria-label={t("sidebar.vimLabel")}>
          <span className="vim-toggle-label">{t("sidebar.vimLabel")}</span>
          <button
            className={!vimMode ? "active" : ""}
            onClick={() => setVimMode(false)}
          >
            {t("sidebar.vimOff")}
          </button>
          <button
            className={vimMode ? "active" : ""}
            onClick={() => setVimMode(true)}
          >
            {t("sidebar.vimOn")}
          </button>
        </div>
        <div className="vim-toggle" role="group" aria-label={t("sidebar.rawLabel")}>
          <span className="vim-toggle-label">{t("sidebar.rawLabel")}</span>
          <button
            className={!rawMarkdown ? "active" : ""}
            onClick={() => setRawMarkdown(false)}
          >
            {t("sidebar.rawOff")}
          </button>
          <button
            className={rawMarkdown ? "active" : ""}
            onClick={() => setRawMarkdown(true)}
          >
            {t("sidebar.rawOn")}
          </button>
        </div>
        <div className="vim-toggle" role="group" aria-label={t("sidebar.embedSourceLabel")}>
          <span className="vim-toggle-label">{t("sidebar.embedSourceLabel")}</span>
          <button
            className={!showEmbedSource ? "active" : ""}
            onClick={() => setShowEmbedSource(false)}
          >
            {t("sidebar.embedSourceHide")}
          </button>
          <button
            className={showEmbedSource ? "active" : ""}
            onClick={() => setShowEmbedSource(true)}
          >
            {t("sidebar.embedSourceShow")}
          </button>
        </div>
        <div className="vim-toggle icon-theme-row" role="group" aria-label={t("sidebar.iconThemeLabel")}>
          <span className="vim-toggle-label">{t("sidebar.iconThemeLabel")}</span>
          <div className="icon-theme-toggle">
            <button
              type="button"
              className={`icon-theme-swatch minimal${iconTheme === "minimal" ? " active" : ""}`}
              onClick={() => setIconTheme("minimal")}
              title={t("sidebar.iconThemeMinimal")}
              aria-label={t("sidebar.iconThemeMinimal")}
            />
            <button
              type="button"
              className={`icon-theme-swatch${iconTheme === "terracotta" ? " active" : ""}`}
              style={{ background: "#c25434" }}
              onClick={() => setIconTheme("terracotta")}
              title="Terracotta"
              aria-label="Terracotta"
            />
            <button
              type="button"
              className={`icon-theme-swatch${iconTheme === "navy" ? " active" : ""}`}
              style={{ background: "#2f557f" }}
              onClick={() => setIconTheme("navy")}
              title="Navy"
              aria-label="Navy"
            />
            <button
              type="button"
              className={`icon-theme-swatch${iconTheme === "forest" ? " active" : ""}`}
              style={{ background: "#3f7a4a" }}
              onClick={() => setIconTheme("forest")}
              title="Forest"
              aria-label="Forest"
            />
            <button
              type="button"
              className={`icon-theme-swatch${iconTheme === "saffron" ? " active" : ""}`}
              style={{ background: "#c69846" }}
              onClick={() => setIconTheme("saffron")}
              title="Saffron"
              aria-label="Saffron"
            />
            <button
              type="button"
              className={`icon-theme-swatch${iconTheme === "plum" ? " active" : ""}`}
              style={{ background: "#7a3d6a" }}
              onClick={() => setIconTheme("plum")}
              title="Plum"
              aria-label="Plum"
            />
          </div>
        </div>
        <SidebarTagSettings
          options={sidebarTagOptions}
          selectedTags={sidebarTags}
          onChange={setSidebarTags}
        />
        <ShortcutSettings />
        <BackupButton />
          </div>
        </details>
      </div>
      {pageContextMenu && (
        <SidebarPageContextMenuView
          page={pageContextMenu.page}
          left={pageContextMenu.left}
          top={pageContextMenu.top}
          onOpen={() => {
            const { page } = pageContextMenu;
            setPageContextMenu(null);
            actions.selectPage(page.id);
          }}
          onCreateChild={() => createContextChildPage(pageContextMenu.page)}
          onDelete={() => void deleteContextPage(pageContextMenu.page)}
        />
      )}
      {importOpen && <NotionImportDialog onClose={() => setImportOpen(false)} />}
    </aside>
  );
}

interface SidebarTagOption {
  key: string;
  label: string;
  count: number;
  builtIn: boolean;
}

interface SidebarTagSectionModel extends SidebarTagOption {
  pages: PageMeta[];
  databases: DatabaseSummary[];
}

function collectSidebarTagOptions(pages: PageMeta[], databases: DatabaseSummary[]): SidebarTagOption[] {
  const counts = new Map<string, number>([
    ["page", pages.length],
    ["database", databases.length]
  ]);
  for (const page of pages) {
    for (const tag of page.tags ?? []) {
      const key = normalizeSidebarTag(tag);
      if (!key || isBuiltInSidebarTag(key)) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (const database of databases) {
    for (const tag of database.tags ?? []) {
      const key = normalizeSidebarTag(tag);
      if (!key || isBuiltInSidebarTag(key)) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key, count, builtIn: isBuiltInSidebarTag(key) }))
    .sort((a, b) => {
      const builtInA = DEFAULT_SIDEBAR_TAGS.indexOf(a.key as (typeof DEFAULT_SIDEBAR_TAGS)[number]);
      const builtInB = DEFAULT_SIDEBAR_TAGS.indexOf(b.key as (typeof DEFAULT_SIDEBAR_TAGS)[number]);
      if (builtInA >= 0 || builtInB >= 0) return (builtInA >= 0 ? builtInA : 999) - (builtInB >= 0 ? builtInB : 999);
      return a.label.localeCompare(b.label);
    });
}

function buildSidebarSections(
  selectedTags: string[],
  pages: PageMeta[],
  databases: DatabaseSummary[]
): SidebarTagSectionModel[] {
  const options = new Map(collectSidebarTagOptions(pages, databases).map((option) => [option.key, option]));
  const uniqueTags = uniqueSidebarTags(selectedTags);
  const sections: SidebarTagSectionModel[] = [];
  for (const tag of uniqueTags) {
    const option = options.get(tag);
    if (!option) continue;
    if (tag === "page") {
      sections.push({ ...option, pages, databases: [] });
    } else if (tag === "database") {
      sections.push({ ...option, pages: [], databases });
    } else {
      sections.push({
        ...option,
        pages: pages.filter((page) => hasSidebarTag(page.tags, tag)),
        databases: databases.filter((database) => hasSidebarTag(database.tags, tag))
      });
    }
  }
  return sections;
}

function SidebarTagSection({
  section,
  active,
  onOpenPage,
  onOpenDatabase,
  onOpenManage,
  onCreatePage,
  onCreateDatabase,
  onPageContextMenu
}: {
  section: SidebarTagSectionModel;
  active: SidebarProps["state"]["activeItem"];
  onOpenPage: (id: string) => void;
  onOpenDatabase: (id: string) => void;
  onOpenManage: (kind: ManageKind) => void;
  onCreatePage: (input?: Partial<CreatePageInput>) => void;
  onCreateDatabase: () => void;
  onPageContextMenu: (page: PageMeta, event: ReactMouseEvent) => void;
}) {
  const { t } = useI18n();
  const [collapsed, toggleCollapsed] = useSectionCollapsed(`tag.${section.key}`);
  const title = section.key === "page"
    ? t("sidebar.pages")
    : section.key === "database"
      ? t("sidebar.databases")
      : section.label;
  const activeDatabaseId =
    active?.type === "database" ? active.id : active?.type === "row_page" ? active.databaseId : undefined;
  const tagKind = !isBuiltInSidebarTag(section.key) ? tagManageKind(section.key) : null;
  const activeTag = active?.type === "manage" && isTagManageKind(active.kind)
    ? tagFromManageKind(active.kind)
    : null;
  const pageTree = useMemo(
    () => section.key === "page" ? buildSidebarPageTree(section.pages) : [],
    [section.key, section.pages]
  );
  const [collapsedPageIds, togglePageNode] = useCollapsedPageTreeNodes(section.key);

  return (
    <section className="nav-section">
      <div className="section-heading">
        <button
          type="button"
          className="section-heading-toggle"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
        >
          <span className={collapsed ? "section-chev collapsed" : "section-chev"}>▾</span>
          <span>{title}</span>
        </button>
        <div className="section-heading-actions">
          {tagKind && (
            <button
              type="button"
              className="section-heading-open-tag"
              onClick={() => onOpenManage(tagKind)}
              aria-label={`${t("sidebar.openTagPage")} ${title}`}
              title={`${t("sidebar.openTagPage")} ${title}`}
            >
              #
            </button>
          )}
          {section.key === "page" && <button onClick={() => onCreatePage()}>+</button>}
          {section.key === "database" && <button onClick={onCreateDatabase}>+</button>}
        </div>
      </div>
      {!collapsed && section.key === "page" && (
        <button
          className={active?.type === "manage" && active.kind === "pages" ? "nav-item active" : "nav-item"}
          onClick={() => onOpenManage("pages")}
        >
          <span className="nav-item-icon"><PageFileIcon /></span>
          <span className="nav-item-label">{t("sidebar.allPages")}</span>
          <span className="nav-item-count">{section.pages.length}</span>
        </button>
      )}
      {!collapsed && section.key === "database" && (
        <button
          className={active?.type === "manage" && active.kind === "databases" ? "nav-item active" : "nav-item"}
          onClick={() => onOpenManage("databases")}
        >
          <span className="nav-item-icon"><EntityIcon kind="database" /></span>
          <span className="nav-item-label">{t("sidebar.allDatabases")}</span>
          <span className="nav-item-count">{section.databases.length}</span>
        </button>
      )}
      {!collapsed && tagKind && (
        <button
          className={activeTag === section.key ? "nav-item active" : "nav-item"}
          onClick={() => onOpenManage(tagKind)}
        >
          <span className="nav-item-icon">#</span>
          <span className="nav-item-label">{title}</span>
          <span className="nav-item-count">{section.pages.length + section.databases.length}</span>
        </button>
      )}
      {!collapsed && section.key === "page" && pageTree.map((node) => (
        <SidebarPageTreeItem
          key={`page-tree-${node.page.id}`}
          node={node}
          depth={0}
          active={active}
          collapsedPageIds={collapsedPageIds}
          onToggle={togglePageNode}
          onOpenPage={onOpenPage}
          onPageContextMenu={onPageContextMenu}
        />
      ))}
      {!collapsed && section.key !== "page" && section.pages.map((page) => (
        <button
          key={`page-${section.key}-${page.id}`}
          className={active?.type === "page" && active.id === page.id ? "nav-item active" : "nav-item"}
          onClick={() => onOpenPage(page.id)}
          onContextMenu={(event) => onPageContextMenu(page, event)}
          title={pagePathLabel(page) || page.title}
        >
          <span className="nav-item-icon"><EntityIcon kind="page" icon={page.icon} /></span>
          <span className="nav-item-label">{page.title}</span>
        </button>
      ))}
      {!collapsed && section.databases.map((database) => (
        <button
          key={`database-${section.key}-${database.id}`}
          className={activeDatabaseId === database.id ? "nav-item active" : "nav-item"}
          onClick={() => onOpenDatabase(database.id)}
          title={databasePathLabel(database) || database.name}
        >
          <span className="nav-item-icon"><EntityIcon kind="database" icon={database.icon} /></span>
          <span className="nav-item-label">{database.name}</span>
        </button>
      ))}
    </section>
  );
}

function SidebarPageTreeItem({
  node,
  depth,
  active,
  collapsedPageIds,
  onToggle,
  onOpenPage,
  onPageContextMenu
}: {
  node: SidebarPageTreeNode;
  depth: number;
  active: SidebarProps["state"]["activeItem"];
  collapsedPageIds: Set<string>;
  onToggle: (pageId: string) => void;
  onOpenPage: (id: string) => void;
  onPageContextMenu: (page: PageMeta, event: ReactMouseEvent) => void;
}) {
  const page = node.page;
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && !collapsedPageIds.has(page.id);
  const activePage = active?.type === "page" && active.id === page.id;

  function handleMainKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && hasChildren) {
      event.preventDefault();
      if (event.key === "ArrowRight" && !expanded) onToggle(page.id);
      if (event.key === "ArrowLeft" && expanded) onToggle(page.id);
    }
  }

  return (
    <>
      <div className="nav-page-tree-row" style={{ paddingLeft: depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            className="nav-page-tree-toggle"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(page.id);
            }}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${page.title}`}
            title={`${expanded ? "Collapse" : "Expand"} ${page.title}`}
          >
            {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
        ) : (
          <span className="nav-page-tree-spacer" />
        )}
        <button
          type="button"
          className={activePage ? "nav-item nav-page-tree-main active" : "nav-item nav-page-tree-main"}
          onClick={() => onOpenPage(page.id)}
          onContextMenu={(event) => onPageContextMenu(page, event)}
          onKeyDown={handleMainKeyDown}
          title={pagePathLabel(page) || page.title}
        >
          <span className="nav-item-icon"><EntityIcon kind="page" icon={page.icon} /></span>
          <span className="nav-item-label">{page.title}</span>
        </button>
      </div>
      {expanded && node.children.map((child) => (
        <SidebarPageTreeItem
          key={`page-tree-${child.page.id}`}
          node={child}
          depth={depth + 1}
          active={active}
          collapsedPageIds={collapsedPageIds}
          onToggle={onToggle}
          onOpenPage={onOpenPage}
          onPageContextMenu={onPageContextMenu}
        />
      ))}
    </>
  );
}

function buildSidebarPageTree(pages: PageMeta[]): SidebarPageTreeNode[] {
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const nodes = new Map(pages.map((page) => [page.id, { page, children: [] as SidebarPageTreeNode[] }]));
  const roots: SidebarPageTreeNode[] = [];
  for (const page of pages) {
    const node = nodes.get(page.id)!;
    const parent =
      page.parentKind === "page" && page.parentId && page.parentId !== page.id
        ? nodes.get(page.parentId)
        : undefined;
    if (parent && !wouldCreateSidebarCycle(page, parent.page, pagesById)) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function wouldCreateSidebarCycle(page: PageMeta, parent: PageMeta, pagesById: Map<string, PageMeta>): boolean {
  let current: PageMeta | undefined = parent;
  const seen = new Set<string>();
  while (current) {
    if (current.id === page.id) return true;
    if (seen.has(current.id) || current.parentKind !== "page" || !current.parentId) return false;
    seen.add(current.id);
    current = pagesById.get(current.parentId);
  }
  return false;
}

function SidebarTagSettings({
  options,
  selectedTags,
  onChange
}: {
  options: SidebarTagOption[];
  selectedTags: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useI18n();
  const selected = uniqueSidebarTags(selectedTags);
  const selectedSet = new Set(selected);
  const selectedOptions = selected
    .map((tag) => options.find((option) => option.key === tag) ?? {
      key: tag,
      label: tag,
      count: 0,
      builtIn: isBuiltInSidebarTag(tag)
    })
    .filter((option) => option.builtIn || option.count > 0);

  function toggle(tag: string) {
    if (selectedSet.has(tag)) {
      if (isBuiltInSidebarTag(tag)) return;
      onChange(selected.filter((item) => item !== tag));
    } else {
      onChange([...selected, tag]);
    }
  }

  function move(tag: string, direction: -1 | 1) {
    const index = selected.indexOf(tag);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= selected.length) return;
    const next = selected.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  }

  return (
    <div className="sidebar-tag-settings">
      <div className="sidebar-settings-subhead">
        <span>{t("sidebar.layoutLabel")}</span>
        <button type="button" onClick={() => onChange([...DEFAULT_SIDEBAR_TAGS])}>
          {t("sidebar.reset")}
        </button>
      </div>
      <div className="sidebar-tag-picker" aria-label={t("sidebar.layoutAvailable")}>
        {options.map((option) => {
          const active = selectedSet.has(option.key);
          return (
            <button
              key={option.key}
              type="button"
              className={active ? "sidebar-tag-option active" : "sidebar-tag-option"}
              onClick={() => toggle(option.key)}
              aria-pressed={active}
              disabled={option.builtIn && active}
            >
              <span>{sidebarTagLabel(option.key, option.label, t)}</span>
              <span className="page-tag-count">{option.count}</span>
            </button>
          );
        })}
      </div>
      <div className="sidebar-tag-order" aria-label={t("sidebar.layoutOrder")}>
        {selectedOptions.map((option, index) => (
          <div key={option.key} className="sidebar-tag-order-row">
            <span className="sidebar-tag-order-label">{sidebarTagLabel(option.key, option.label, t)}</span>
            <button type="button" onClick={() => move(option.key, -1)} disabled={index === 0}>↑</button>
            <button type="button" onClick={() => move(option.key, 1)} disabled={index === selectedOptions.length - 1}>↓</button>
            <button
              type="button"
              onClick={() => toggle(option.key)}
              disabled={option.builtIn}
              title={option.builtIn ? t("sidebar.defaultTag") : t("sidebar.removeTag")}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function databasePathLabel(database: DatabaseSummary): string {
  const segments = (database.path ?? []).map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 1 ? segments.join(" / ") : "";
}

function pagePathLabel(page: PageMeta): string {
  const segments = (page.path ?? []).map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 1 ? segments.join(" / ") : "";
}

function normalizeSidebarTag(tag: string | undefined): string {
  return String(tag ?? "").trim();
}

function isBuiltInSidebarTag(tag: string): boolean {
  return DEFAULT_SIDEBAR_TAGS.includes(tag as (typeof DEFAULT_SIDEBAR_TAGS)[number]);
}

function hasSidebarTag(tags: string[] | undefined, target: string): boolean {
  return (tags ?? []).some((tag) => normalizeSidebarTag(tag) === target);
}

function uniqueSidebarTags(tags: string[]): string[] {
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeSidebarTag(tag);
    if (!normalized || result.includes(normalized)) continue;
    result.push(normalized);
  }
  for (const tag of DEFAULT_SIDEBAR_TAGS) {
    if (!result.includes(tag)) result.push(tag);
  }
  return result;
}

function sidebarTagLabel(key: string, fallback: string, t: I18nContextValue["t"]): string {
  if (key === "page") return t("sidebar.pages");
  if (key === "database") return t("sidebar.databases");
  return fallback;
}

/**
 * Persist a sidebar section's collapsed state in localStorage so it
 * survives reloads. `key` is the section identifier (recent, favorites,
 * pages, databases). Returns `[collapsed, toggle]`.
 */
function useSectionCollapsed(key: string): [boolean, () => void] {
  const storageKey = `lotion.sidebar.collapsed.${key}`;
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(storageKey) === "1";
  });
  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* localStorage may be unavailable — ignore. */
      }
      return next;
    });
  }
  return [collapsed, toggle];
}

function useCollapsedPageTreeNodes(key: string): [Set<string>, (pageId: string) => void] {
  const storageKey = `lotion.sidebar.pageTree.collapsed.${key}`;
  const [collapsedPageIds, setCollapsedPageIds] = useState<Set<string>>(() => readCollapsedPageTreeNodes(storageKey));

  function togglePageNode(pageId: string) {
    setCollapsedPageIds((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      writeCollapsedPageTreeNodes(storageKey, next);
      return next;
    });
  }

  return [collapsedPageIds, togglePageNode];
}

function readCollapsedPageTreeNodes(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string" && value.length > 0));
  } catch {
    return new Set();
  }
}

function writeCollapsedPageTreeNodes(storageKey: string, collapsedPageIds: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    if (collapsedPageIds.size === 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify([...collapsedPageIds]));
  } catch {
    /* localStorage may be unavailable — ignore. */
  }
}

/**
 * Recent items — most-recent first, up to 6 entries shown in the
 * sidebar. The manifest tracks up to 24, which the (eventual) recents
 * management page can paginate through. Pages / databases / row-pages
 * all share the same UI shape — only the entity icon and label source
 * differ.
 */
function RecentsSection({
  state,
  onOpenPage,
  onOpenDatabase,
  onOpenRowPage
}: {
  state: SidebarProps["state"];
  onOpenPage: (id: string) => void;
  onOpenDatabase: (id: string) => void;
  onOpenRowPage: (databaseId: string, rowId: string) => void;
}) {
  const { t } = useI18n();
  const cache = useDatabaseCache();
  const recents = state.recents.slice(0, 6);
  useEffect(() => {
    const databaseIds = new Set(
      recents.filter((item) => item.type === "row_page").map((item) => item.databaseId)
    );
    for (const databaseId of databaseIds) {
      if (!cache.getBundle(databaseId)) void cache.loadBundle(databaseId).catch(console.error);
    }
  }, [cache, recents]);
  if (recents.length === 0) return null;
  const active = state.activeItem;
  return (
    <section className="nav-section">
      <div className="section-heading">
        <span>{t("sidebar.recent")}</span>
      </div>
      {recents.map((r) => {
        if (r.type === "page") {
          const page = state.pages.find((p) => p.id === r.id);
          const isActive = active?.type === "page" && active.id === r.id;
          return (
            <button
              key={`r-p-${r.id}`}
              className={isActive ? "nav-item active" : "nav-item"}
              onClick={() => onOpenPage(r.id)}
              title={page?.title}
            >
              <span className="nav-item-icon"><EntityIcon kind="page" icon={page?.icon} /></span>
              <span className="nav-item-label">{page?.title ?? r.id}</span>
            </button>
          );
        }
        if (r.type === "database") {
          const db = state.databases.find((d) => d.id === r.id);
          const isActive = active?.type === "database" && active.id === r.id;
          return (
            <button
              key={`r-d-${r.id}`}
              className={isActive ? "nav-item active" : "nav-item"}
              onClick={() => onOpenDatabase(r.id)}
              title={db?.name}
            >
              <span className="nav-item-icon"><EntityIcon kind="database" icon={db?.icon} /></span>
              <span className="nav-item-label">{db?.name ?? r.id}</span>
            </button>
          );
        }
        const isActive =
          active?.type === "row_page" && active.databaseId === r.databaseId && active.rowId === r.rowId;
        const storedTitle = r.title ?? (isActive && active.type === "row_page" ? active.title : undefined);
        const display = rowPageDisplay(
          cache.getBundle(r.databaseId),
          r.rowId,
          storedTitle,
          r.icon,
          t("rowPage.noTitle")
        );
        return (
          <button
            key={`r-r-${r.databaseId}-${r.rowId}`}
            className={isActive ? "nav-item active" : "nav-item"}
            onClick={() => onOpenRowPage(r.databaseId, r.rowId)}
            title={display.title}
          >
            <span className="nav-item-icon"><EntityIcon kind="row_page" icon={display.icon} /></span>
            <span className="nav-item-label">{display.title}</span>
          </button>
        );
      })}
    </section>
  );
}

/**
 * Favorites section — pinned at the top of the sidebar when the
 * workspace has any starred items. Pages resolve their title via
 * state.pages; row-pages resolve their title via the pagesTree (which
 * already knows page_file → title for every row that has a body).
 */
function FavoritesSection({
  state,
  onOpenPage,
  onOpenRowPage
}: {
  state: SidebarProps["state"];
  onOpenPage: (id: string) => void;
  onOpenRowPage: (databaseId: string, rowId: string) => void;
}) {
  const { t } = useI18n();
  const cache = useDatabaseCache();
  const favorites = state.favorites;
  useEffect(() => {
    const databaseIds = new Set(
      (favorites ?? []).filter((item) => item.type === "row_page").map((item) => item.databaseId)
    );
    for (const databaseId of databaseIds) {
      if (!cache.getBundle(databaseId)) void cache.loadBundle(databaseId).catch(console.error);
    }
  }, [cache, favorites]);
  if (!favorites || favorites.length === 0) return null;
  const active = state.activeItem;
  return (
    <section className="nav-section">
      <div className="section-heading">
        <span>{t("sidebar.favorites")}</span>
      </div>
      {favorites.map((f) => {
        if (f.type === "page") {
          const page = state.pages.find((p) => p.id === f.id);
          const title = page?.title ?? f.id;
          const isActive = active?.type === "page" && active.id === f.id;
          return (
            <button
              key={`p-${f.id}`}
              className={isActive ? "nav-item active" : "nav-item"}
              onClick={() => onOpenPage(f.id)}
              title={title}
            >
              <span className="nav-item-icon"><EntityIcon kind="page" icon={page?.icon} /></span>
              <span className="nav-item-label">{title}</span>
            </button>
          );
        }
        // row_page
        const isActive =
          active?.type === "row_page" && active.databaseId === f.databaseId && active.rowId === f.rowId;
        const storedTitle = isActive && active.type === "row_page" ? active.title : undefined;
        const display = rowPageDisplay(
          cache.getBundle(f.databaseId),
          f.rowId,
          storedTitle,
          undefined,
          t("rowPage.noTitle")
        );
        return (
          <button
            key={`r-${f.databaseId}-${f.rowId}`}
            className={isActive ? "nav-item active" : "nav-item"}
            onClick={() => onOpenRowPage(f.databaseId, f.rowId)}
            title={display.title}
          >
            <span className="nav-item-icon"><EntityIcon kind="row_page" icon={display.icon} /></span>
            <span className="nav-item-label">{display.title}</span>
          </button>
        );
      })}
    </section>
  );
}
