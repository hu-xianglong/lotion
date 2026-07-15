import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import type { DatabaseBundle, FieldSchema, TableView } from "../../../shared/types";
import type { DatabaseViewProvider } from "../../../shared/plugin-api";
import { EntityIcon } from "../../components/EntityIcon";
import { FieldTypeIcon, ViewTypeIcon } from "../../components/FieldTypeIcon";
import { SettingsIcon } from "../../components/Icons";
import { useI18n } from "../../lib/i18n";
import { CoverArea } from "../pages/CoverArea";

export function DatabaseProperties({
  tags,
  onChangeTags
}: {
  tags: string[];
  onChangeTags: (tags: string[]) => void;
}) {
  const { t } = useI18n();
  const [tagsText, setTagsText] = useState(tags.join(", "));

  useEffect(() => {
    setTagsText(tags.join(", "));
  }, [tags]);

  function commitTags() {
    const next = tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.join(",") === next.join(",")) return;
    onChangeTags(next);
  }

  return (
    <div className="row-properties page-properties database-properties">
      <div className="row-property">
        <div className="row-property-label">
          <span className="row-property-icon"><FieldTypeIcon type="multi_select" /></span>
          <span className="row-property-name">{t("page.props.tags")}</span>
        </div>
        <div className="row-property-value">
          <input
            className="page-property-input"
            value={tagsText}
            placeholder={t("cell.empty")}
            onChange={(event) => setTagsText(event.target.value)}
            onBlur={commitTags}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function StandaloneDatabaseHeader({
  bundle,
  onPickIcon,
  onPickCover,
  onClearCover,
  onCommitCoverOffset,
  onOpenInNewWindow
}: {
  bundle: DatabaseBundle;
  onPickIcon?: () => void;
  onPickCover?: () => void;
  onClearCover?: () => void;
  onCommitCoverOffset?: (offset: number) => void;
  onOpenInNewWindow?: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <>
      {bundle.schema.cover && (
        <CoverArea
          src={bundle.schema.cover}
          offset={bundle.schema.coverOffset}
          onChangeImage={onPickCover}
          onClear={onClearCover}
          onCommitOffset={onCommitCoverOffset}
        />
      )}
      <div className="page-header">
        <div className="page-icon-row">
          <button
            type="button"
            className="page-icon-button page-icon-button-large"
            onClick={onPickIcon}
            disabled={!onPickIcon}
            title="Set database icon"
            aria-label="Set database icon"
          >
            <EntityIcon kind="database" icon={bundle.schema.icon} size={56} />
          </button>
          {onPickCover && !bundle.schema.cover && (
            <button type="button" className="page-add-cover" onClick={onPickCover}>
              添加封面
            </button>
          )}
        </div>
        <div className="database-toolbar">
          <div className="database-title-wrap">
            <h1>{bundle.schema.name}</h1>
            <div className="database-subtitle">{formatDbSubtitle(locale, bundle)}</div>
          </div>
          {onOpenInNewWindow && (
            <button
              type="button"
              className="database-open-window"
              onClick={onOpenInNewWindow}
              title={t("page.openInNewWindow")}
              aria-label={t("page.openInNewWindow")}
            >
              <ArrowUpRight size={16} strokeWidth={1.9} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export function EmbeddedDatabaseHeader({
  bundle,
  title,
  subtitle,
  activeView,
  activeViewTypeLabel,
  activePluginView,
  viewActions,
  refreshing,
  onOpen,
  onRefresh,
  onOpenSettings
}: {
  bundle: DatabaseBundle;
  title?: string;
  subtitle?: string;
  activeView: TableView;
  activeViewTypeLabel: string;
  activePluginView?: DatabaseViewProvider;
  viewActions: ReactNode;
  refreshing: boolean;
  onOpen?: () => void;
  onRefresh?: () => void | Promise<void>;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  const resolvedTitle = title || bundle.schema.name;
  const resolvedSubtitle = subtitle || `${activeView.name} · ${activeViewTypeLabel}`;

  return (
    <div className="embedded-view-header">
      <div className="embedded-view-titlebar">
        <div className="embedded-view-title-stack">
          <strong title={resolvedTitle}>{resolvedTitle}</strong>
          <span className="embedded-view-subtitle" title={resolvedSubtitle}>
            <ViewTypeIcon type={activeView.type} providerIcon={activePluginView?.icon} />
            <span>{activeView.name}</span>
            <span aria-hidden="true">·</span>
            <span>{activeViewTypeLabel}</span>
          </span>
        </div>
        <div className="embedded-view-header-actions">
          {onOpen && (
            <button type="button" onClick={onOpen}>
              {t("rowPage.open")}
            </button>
          )}
          {onRefresh && (
            <button
              type="button"
              className="toolbar-icon"
              onClick={() => void onRefresh()}
              disabled={refreshing}
              title={refreshing ? t("toolbar.refreshing") : t("toolbar.refresh")}
              aria-label={refreshing ? t("toolbar.refreshing") : t("toolbar.refresh")}
            >
              <RefreshCw size={16} strokeWidth={1.8} />
            </button>
          )}
          <button
            type="button"
            className="toolbar-icon"
            onClick={onOpenSettings}
            title={t("toolbar.viewSettings")}
            aria-label={t("toolbar.viewSettings")}
          >
            <SettingsIcon />
          </button>
        </div>
      </div>
      {viewActions}
    </div>
  );
}

export function DatabaseViewTabsBar({
  views,
  activeView,
  embedded,
  viewActions,
  getProvider,
  onSelectView,
  onCreateView
}: {
  views: TableView[];
  activeView: TableView;
  embedded: boolean;
  viewActions?: ReactNode;
  getProvider: (type: string) => DatabaseViewProvider | undefined;
  onSelectView: (view: TableView) => void;
  onCreateView: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="view-tabs-bar">
      <div className="view-tabs" role="tablist">
        {views.map((item) => {
          const active = item.id === activeView.id;
          const provider = getProvider(item.type);
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={active}
              className={active ? "view-tab active" : "view-tab"}
              onClick={() => onSelectView(item)}
            >
              <ViewTypeIcon type={item.type} providerIcon={provider?.icon} />
              <span className="view-tab-label">{item.name}</span>
            </button>
          );
        })}
        <button className="view-tab-add" title={t("toolbar.newViewTitle")} aria-label={t("toolbar.newViewTitle")} onClick={onCreateView}>+</button>
      </div>
      {!embedded && viewActions}
    </div>
  );
}

function formatDbSubtitle(locale: string, bundle: DatabaseBundle): string {
  const fields = bundle.schema.fields.filter(
    (field) => !field.hidden && field.id !== "id"
  ).length;
  const rows = bundle.records.length;
  const stats = locale === "zh"
    ? `${fields} 个字段 · ${rows} 行`
    : `${fields} field${fields === 1 ? "" : "s"} · ${rows} row${rows === 1 ? "" : "s"}`;
  const path = databasePathLabel(bundle.schema.path, bundle.schema.name);
  return path ? `${path} · ${stats}` : stats;
}

function databasePathLabel(path: string[] | undefined, name: string): string {
  const segments = (path ?? []).map((segment) => segment.trim()).filter(Boolean);
  if (segments.length <= 1) return "";
  if (segments.length === 1 && segments[0] === name) return "";
  return segments.join(" / ");
}
