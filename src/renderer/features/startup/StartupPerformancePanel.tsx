import type { CSSProperties } from "react";
import { PerformanceIcon } from "../../components/Icons";
import { useI18n, type TranslationKey } from "../../lib/i18n";
import { formatDateForField } from "../../../shared/date-values";
import { useDateTimeDisplayDefaults } from "../../lib/settings";
import {
  startupPerformanceGrade,
  type StartupCountKind,
  type StartupIndexOperationKey,
  type StartupPerformanceReport,
  type StartupPhaseKey
} from "./startup-performance";

const PHASE_TRANSLATIONS: Record<StartupPhaseKey, TranslationKey> = {
  workspace: "startup.phase.workspace",
  index: "startup.phase.index",
  navigation: "startup.phase.navigation",
  paint: "startup.phase.paint"
};

const OPERATION_TRANSLATIONS: Record<StartupIndexOperationKey, TranslationKey> = {
  workspaceIndex: "startup.operation.workspaceIndex",
  pages: "startup.operation.pages",
  databases: "startup.operation.databases",
  tree: "startup.operation.tree",
  favorites: "startup.operation.favorites",
  recents: "startup.operation.recents",
  workspacePath: "startup.operation.workspacePath"
};

const COUNT_TRANSLATIONS: Record<StartupCountKind, TranslationKey> = {
  pages: "startup.count.pages",
  databases: "startup.count.databases",
  entries: "startup.count.entries",
  items: "startup.count.items"
};

export function StartupPerformancePanel({ report }: { report: StartupPerformanceReport }) {
  const { locale, t } = useI18n();
  const dateTimeDefaults = useDateTimeDisplayDefaults();
  const grade = startupPerformanceGrade(report.totalMs);
  const phaseMax = Math.max(1, ...report.phases.map((phase) => phase.ms ?? 0));
  const operationMax = Math.max(1, ...report.indexOperations.map((operation) => operation.ms));
  const slowestOperationMs = Math.max(0, ...report.indexOperations.map((operation) => operation.ms));
  const capturedAt = formatDateForField(report.capturedAt, { type: "updated_time" }, dateTimeDefaults);

  return (
    <section className="startup-performance" data-testid="startup-performance" data-grade={grade}>
      <header className="startup-performance-header">
        <div className="startup-performance-heading">
          <span className="startup-performance-icon" aria-hidden="true"><PerformanceIcon /></span>
          <div>
            <p className="startup-performance-kicker">{t("startup.kicker")}</p>
            <h1>{t("startup.title")}</h1>
            <p className="startup-performance-workspace">
              <strong>{report.workspace.name}</strong>
              {report.workspace.path && <span title={report.workspace.path}>{report.workspace.path}</span>}
            </p>
          </div>
        </div>
        <div className={`startup-performance-total ${grade}`}>
          <span>{t(`startup.grade.${grade}`)}</span>
          <strong>{formatDuration(report.totalMs)}</strong>
          <small>{t("startup.total")}</small>
        </div>
      </header>

      <div className="startup-performance-summary" aria-label={t("startup.summary")}>
        <SummaryMetric label={t("startup.total")} value={formatDuration(report.totalMs)} />
        <SummaryMetric
          label={t("startup.phase.index")}
          value={formatDuration(report.phases.find((phase) => phase.key === "index")?.ms ?? 0)}
        />
        <SummaryMetric label={t("startup.workspaceSize")} value={formatWorkspaceSize(report.workspace.pages, report.workspace.databases, locale)} />
        <SummaryMetric label={t("startup.overhead")} value={formatDuration(report.overheadMs)} />
      </div>

      <section className="startup-performance-section" aria-labelledby="startup-phase-heading">
        <div className="startup-performance-section-heading">
          <div>
            <h2 id="startup-phase-heading">{t("startup.phases")}</h2>
            <p>{t("startup.phasesHint")}</p>
          </div>
          <span>{formatDuration(report.measuredPhaseMs)}</span>
        </div>
        <div className="startup-timing-list">
          {report.phases.map((phase) => (
            <div className="startup-timing-row" key={phase.key} data-phase={phase.key}>
              <span className="startup-timing-label">{t(PHASE_TRANSLATIONS[phase.key])}</span>
              <span className="startup-timing-track" aria-hidden="true">
                <span style={barStyle(phase.ms ?? 0, phaseMax)} />
              </span>
              <strong>{formatDuration(phase.ms ?? 0)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="startup-performance-section" aria-labelledby="startup-index-heading">
        <div className="startup-performance-section-heading">
          <div>
            <h2 id="startup-index-heading">{t("startup.indexDetails")}</h2>
            <p>{t("startup.indexHint")}</p>
          </div>
        </div>
        <div className="startup-operation-list" role="table" aria-label={t("startup.indexDetails")}>
          {report.indexOperations.map((operation) => {
            const slowest = operation.ms === slowestOperationMs && report.indexOperations.length > 1;
            return (
              <div className="startup-operation-row" role="row" key={operation.key} data-operation={operation.key}>
                <span className="startup-operation-label" role="cell">
                  <strong>{t(OPERATION_TRANSLATIONS[operation.key])}</strong>
                  {operation.count !== undefined && operation.countKind && (
                    <small>{formatCount(operation.count, t(COUNT_TRANSLATIONS[operation.countKind]), locale)}</small>
                  )}
                </span>
                <span className="startup-timing-track" role="cell" aria-hidden="true">
                  <span style={barStyle(operation.ms, operationMax)} />
                </span>
                <span className="startup-operation-time" role="cell">
                  {slowest && <em>{t("startup.slowest")}</em>}
                  <strong>{formatDuration(operation.ms)}</strong>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="startup-performance-footer">
        <span>{t("startup.captured")} {capturedAt}</span>
        {report.cache && (
          <span title={report.cache.reason}>
            {report.cache.status === "hit" ? t("startup.cache.hit") : t("startup.cache.rebuilt")}
            {" · "}{formatBytes(report.cache.bytes, locale)}
            {" · "}{t("startup.cache.validation")} {formatDuration(report.cache.validationMs)}
          </span>
        )}
        <span>{t("startup.sessionOnly")}</span>
      </footer>
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="startup-summary-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function barStyle(value: number, max: number): CSSProperties {
  const percentage = value <= 0 ? 0 : Math.max(3, Math.min(100, (value / max) * 100));
  return { width: `${percentage.toFixed(2)}%` };
}

function formatDuration(ms: number): string {
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(ms >= 10_000 ? 1 : 2)}s`;
  return `${Math.round(ms)}ms`;
}

function formatBytes(bytes: number, locale: "en" | "zh"): string {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en", {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 1
  }).format(bytes / (1024 * 1024));
}

function formatWorkspaceSize(pages: number, databases: number, locale: "en" | "zh"): string {
  const formatter = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en");
  if (locale === "zh") return `${formatter.format(pages)} 页 / ${formatter.format(databases)} 库`;
  return `${formatter.format(pages)} pages / ${formatter.format(databases)} DBs`;
}

function formatCount(count: number, unit: string, locale: "en" | "zh"): string {
  return `${new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en").format(count)} ${unit}`;
}
