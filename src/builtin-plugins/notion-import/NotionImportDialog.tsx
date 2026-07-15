import { useEffect, useState } from "react";
import type {
  NotionImportOptions,
  NotionImportProgress,
  NotionImportStats,
  NotionImportSummary,
  NotionScanSummary
} from "../../preload/lotion-api";

interface NotionImportDialogProps {
  onClose: () => void;
}

interface NotionImportPanelProps {
  onClose?: () => void;
  embedded?: boolean;
}

type Stage = "pick" | "scanning" | "preview" | "importing" | "done" | "error";

const PHASE_LABELS: Record<NotionImportProgress["phase"], string> = {
  scanning: "Scanning source files",
  indexing: "Indexing attachments",
  parsing: "Parsing row HTMLs",
  writing: "Writing workspace files",
  done: "Done"
};

const PHASE_RANGES: Record<NotionImportProgress["phase"], [number, number]> = {
  scanning: [0, 5],
  indexing: [5, 12],
  parsing: [12, 58],
  writing: [58, 99],
  done: [100, 100]
};

const TABS_STORAGE_KEY = "lotion.tabs";

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  const width = Math.max(1, Math.min(100, Math.round(pct)));
  return (
    <div className="notion-progress" aria-label={label}>
      <div className="notion-progress-fill" style={{ width: `${width}%` }} />
      <div className="notion-progress-label">{label}</div>
    </div>
  );
}

function ImportOverallProgressBar({ progress }: { progress: NotionImportProgress | null }) {
  if (!progress) {
    return (
      <div className="notion-progress-group">
        <div className="notion-progress-heading">
          <span>Overall progress</span>
          <span>Starting</span>
        </div>
        <div className="notion-progress indeterminate" aria-hidden="true" />
      </div>
    );
  }
  const pct = overallProgressPct(progress);
  return (
    <div className="notion-progress-group">
      <div className="notion-progress-heading">
        <span>Overall progress</span>
        <span>{pct}%</span>
      </div>
      <ProgressBar pct={pct} label={`${pct}% overall`} />
    </div>
  );
}

function ImportProgressBar({ progress }: { progress: NotionImportProgress | null }) {
  if (!progress) {
    return <div className="notion-progress indeterminate" aria-hidden="true" />;
  }
  // Determinate when both current and total are known. Pin to 1% min
  // so a fresh bar isn't invisible.
  if (typeof progress.current === "number" && typeof progress.total === "number" && progress.total > 0) {
    const pct = Math.max(1, Math.min(100, Math.round((progress.current / progress.total) * 100)));
    return (
      <ProgressBar
        pct={pct}
        label={`${progress.current.toLocaleString()} / ${progress.total.toLocaleString()} (${pct}%)`}
      />
    );
  }
  // Phase without a measurable total — show an indeterminate bar.
  return <div className="notion-progress indeterminate" aria-hidden="true" />;
}

function overallProgressPct(progress: NotionImportProgress): number {
  if (progress.phase === "done") return 100;
  const [start, end] = PHASE_RANGES[progress.phase];
  const phasePct =
    typeof progress.current === "number" && typeof progress.total === "number" && progress.total > 0
      ? Math.max(0, Math.min(1, progress.current / progress.total))
      : 0;
  return Math.max(1, Math.min(99, Math.round(start + (end - start) * phasePct)));
}

function formatDuration(ms: number | undefined): string {
  if (typeof ms !== "number") return "";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

function ImportProgressMeta({ progress }: { progress: NotionImportProgress | null }) {
  if (!progress) return null;
  const elapsed = formatDuration(progress.elapsedMs);
  const phaseElapsed = formatDuration(progress.phaseElapsedMs);
  return (
    <div className="notion-progress-meta">
      {progress.message && <span>{progress.message}</span>}
      {elapsed && <span>Total {elapsed}</span>}
      {phaseElapsed && <span>Phase {phaseElapsed}</span>}
    </div>
  );
}

function ImportStatsPanel({ stats }: { stats: NotionImportStats | null }) {
  if (!stats) return null;
  return (
    <details className="notion-db-preview notion-import-stats" open>
      <summary>Indexed source stats</summary>
      <table className="notion-summary">
        <tbody>
          <tr><th>Source parts</th><td>{stats.sources.toLocaleString()}</td></tr>
          <tr><th>Databases</th><td>{stats.databasesKept.toLocaleString()}<span className="hint"> &nbsp;/ {stats.databasesRaw.toLocaleString()} raw</span></td></tr>
          <tr><th>Total rows</th><td>{stats.totalRows.toLocaleString()}</td></tr>
          <tr><th>Pages</th><td>{stats.pages.toLocaleString()}<span className="hint"> &nbsp;{stats.rowPages.toLocaleString()} row pages, {stats.freePages.toLocaleString()} page files</span></td></tr>
          <tr><th>Attachments</th><td>{stats.attachments.toLocaleString()}<span className="hint"> &nbsp;/ {stats.attachmentSourceFiles.toLocaleString()} source files</span></td></tr>
        </tbody>
      </table>
      {stats.topDatabases.length > 0 && (
        <table>
          <thead>
            <tr><th>Database</th><th>Rows</th><th>Fields</th></tr>
          </thead>
          <tbody>
            {stats.topDatabases.slice(0, 8).map((db, index) => (
              <tr key={`${db.title}-${index}`}>
                <td>{db.title}</td>
                <td>{db.rows.toLocaleString()}</td>
                <td>{db.userFields}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}

function ImportSummary({ summary }: { summary: NotionImportSummary }) {
  const totalRows = summary.scan.databases.reduce((acc, db) => acc + db.rows, 0);
  const topByRows = summary.scan.databases.slice(0, 5);
  return (
    <>
      <table className="notion-summary">
        <tbody>
          <tr><th>Databases imported</th><td>{summary.scan.databasesKept.toLocaleString()}</td></tr>
          <tr><th>Total rows</th><td>{totalRows.toLocaleString()}</td></tr>
          <tr><th>Pages</th><td>{summary.scan.topLevelPages.toLocaleString()}</td></tr>
          <tr><th>Attachments</th><td>{summary.scan.attachments.toLocaleString()}</td></tr>
        </tbody>
      </table>
      {topByRows.length > 0 && (
        <details className="notion-db-preview" open>
          <summary>Largest databases</summary>
          <table>
            <thead>
              <tr><th>Title</th><th>Rows</th><th>Fields</th></tr>
            </thead>
            <tbody>
              {topByRows.map((db, i) => (
                <tr key={`${db.title}-${i}`}>
                  <td>{db.title}</td>
                  <td>{db.rows.toLocaleString()}</td>
                  <td>{db.userFields}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}

const DEFAULT_IMPORT_OPTIONS: Required<NotionImportOptions> = {
  skipEmptyRowsAndPages: true,
  dedupeMarkdownFiles: true,
  includeOriginalHtml: true
};

function ImportOptionsFieldset({
  options,
  disabled,
  onChange
}: {
  options: Required<NotionImportOptions>;
  disabled?: boolean;
  onChange: <K extends keyof NotionImportOptions>(key: K, value: Required<NotionImportOptions>[K]) => void;
}) {
  return (
    <fieldset className="notion-import-options" disabled={disabled}>
      <legend>Import settings</legend>
      <label>
        <input
          type="checkbox"
          checked={options.skipEmptyRowsAndPages}
          onChange={(event) => onChange("skipEmptyRowsAndPages", event.currentTarget.checked)}
        />
        <span>
          Do not import blank rows and pages
          <small>Blank items are omitted from the imported workspace instead of being kept as empty records.</small>
        </span>
      </label>
      <div className="notion-import-option-note">
        <strong>Blank definition.</strong> A standalone or nested page is blank when, after removing Notion's exported
        title/property wrapper, its Markdown body is empty. A database row is blank when its cleaned row-page body is empty
        or missing, and all meaningful user fields are empty; system fields, row id, row icon, page file, generated
        timestamps, and Original Notion HTML/CSV links do not count as content.
      </div>
      <label>
        <input
          type="checkbox"
          checked={options.dedupeMarkdownFiles}
          onChange={(event) => onChange("dedupeMarkdownFiles", event.currentTarget.checked)}
        />
        <span>
          Auto-dedupe duplicate Notion pages
          <small>Skip repeated standalone/nested page bodies and rewrite links to the first copy.</small>
        </span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={options.includeOriginalHtml}
          onChange={(event) => onChange("includeOriginalHtml", event.currentTarget.checked)}
        />
        <span>
          Preserve original Notion export for audit
          <small>Copy the source export tree into attachments/original and link Original Notion HTML/CSV fields to it.</small>
        </span>
      </label>
    </fieldset>
  );
}

/**
 * Modal that walks the user through choosing a Notion export folder,
 * previewing what would be imported, picking a target directory for
 * the new workspace, and committing. The current workspace is left
 * untouched; the new one becomes active after the renderer reloads.
 */
export function NotionImportPanel({ onClose, embedded = false }: NotionImportPanelProps) {
  const [stage, setStage] = useState<Stage>("pick");
  const [folder, setFolder] = useState<string>("");
  const [scan, setScan] = useState<NotionScanSummary | null>(null);
  const [error, setError] = useState<string>("");
  const [writtenTo, setWrittenTo] = useState<string>("");
  const [progress, setProgress] = useState<NotionImportProgress | null>(null);
  const [importStats, setImportStats] = useState<NotionImportStats | null>(null);
  const [doneSummary, setDoneSummary] = useState<NotionImportSummary | null>(null);
  const [options, setOptions] = useState<Required<NotionImportOptions>>(DEFAULT_IMPORT_OPTIONS);

  useEffect(() => {
    if (stage !== "importing") return;
    const unsubscribe = window.lotion.notion.onProgress((event) => {
      setProgress(event);
      if (event.stats) setImportStats(event.stats);
    });
    return () => unsubscribe();
  }, [stage]);

  async function pickAndScan() {
    setError("");
    const chosen = await window.lotion.notion.pickFolder();
    if (!chosen) return;
    setFolder(chosen);
    setStage("scanning");
    try {
      const result = await window.lotion.notion.scan(chosen);
      setScan(result);
      setStage("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }

  async function commit() {
    if (!folder) return;
    const target = await window.lotion.notion.pickTarget();
    if (!target) return;
    setStage("importing");
    setProgress(null);
    setImportStats(null);
    try {
      const result = await window.lotion.notion.runImport({
        sourcePath: folder,
        targetPath: target,
        options
      });
      setWrittenTo(result.workspaceRoot);
      setDoneSummary(result);
      try {
        await openImportedReport(result);
      } catch (openError) {
        console.error("[lotion] failed to auto-open imported report:", openError);
        setStage("done");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }

  function reloadApp() {
    window.location.reload();
  }

  function setImportOption<K extends keyof NotionImportOptions>(
    key: K,
    value: Required<NotionImportOptions>[K]
  ) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  async function openImportedReport(result: NotionImportSummary) {
    persistReportTab(result.reportPageId);
    await window.lotion.workspace.open(result.workspaceRoot);
    window.location.reload();
  }

  return (
    <div className={embedded ? "notion-import-panel embedded" : "notion-import-panel"}>
        {embedded && <h2>Import from Notion</h2>}
        {(stage === "pick" || stage === "preview" || stage === "error") && (
          <ImportOptionsFieldset options={options} onChange={setImportOption} />
        )}

        {stage === "pick" && (
          <>
            <p>
              Pick the folder containing your Notion export. If the export was split
              into multiple <code>Export-…</code> parts, choose their shared parent.
            </p>
            <div className="notion-dialog-actions">
              {onClose && <button onClick={onClose}>Cancel</button>}
              <button className="primary" onClick={pickAndScan}>Choose folder…</button>
            </div>
          </>
        )}

        {stage === "scanning" && (
          <>
            <p>Scanning <code>{folder}</code>…</p>
            <p className="hint">Big exports take a few seconds.</p>
          </>
        )}

        {stage === "preview" && scan && (
          <>
            <p>
              Source: <code>{folder}</code> ({scan.sources.length} part{scan.sources.length === 1 ? "" : "s"})
            </p>
            <table className="notion-summary">
              <tbody>
                <tr><th>Pages</th><td>{scan.topLevelPages.toLocaleString()}</td></tr>
                <tr><th>Databases (after dedup)</th><td>{scan.databasesKept.toLocaleString()}<span className="hint"> &nbsp;/ {scan.databasesRaw.toLocaleString()} raw</span></td></tr>
                <tr><th>Attachments</th><td>{scan.attachments.toLocaleString()}</td></tr>
              </tbody>
            </table>

            {scan.databases.length > 0 && (
              <details className="notion-db-preview">
                <summary>Databases ({scan.databases.length} shown, sorted by row count)</summary>
                <table>
                  <thead>
                    <tr><th>Title</th><th>Rows</th><th>Fields</th></tr>
                  </thead>
                  <tbody>
                    {scan.databases.map((db, i) => (
                      <tr key={`${db.title}-${i}`}>
                        <td>{db.title}</td>
                        <td>{db.rows.toLocaleString()}</td>
                        <td>{db.userFields}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}

            <p className="hint">
              You'll be asked to pick an empty folder for the new workspace.
              Your current workspace is not touched.
            </p>
            <div className="notion-dialog-actions">
              {onClose && <button onClick={onClose}>Cancel</button>}
              <button onClick={pickAndScan}>Pick a different folder</button>
              <button className="primary" onClick={commit}>Choose target & import…</button>
            </div>
          </>
        )}

        {stage === "importing" && (
          <>
            <p>{progress ? PHASE_LABELS[progress.phase] : "Starting import…"}</p>
            <ImportOverallProgressBar progress={progress} />
            <div className="notion-progress-heading secondary">
              <span>Current step</span>
              <span>{progress ? PHASE_LABELS[progress.phase] : "Starting import"}</span>
            </div>
            <ImportProgressBar progress={progress} />
            <ImportProgressMeta progress={progress} />
            <ImportStatsPanel stats={importStats} />
            <p className="hint">Large imports spend most of their time parsing row HTML and writing row pages.</p>
          </>
        )}

        {stage === "done" && doneSummary && (
          <>
            <p className="notion-done-headline">Import complete ✓</p>
            <ImportSummary summary={doneSummary} />
            <p className="hint">
              New workspace at <code>{writtenTo}</code>. Reload to switch to it.
            </p>
            <div className="notion-dialog-actions">
              <button className="primary" onClick={reloadApp}>Reload</button>
            </div>
          </>
        )}

        {stage === "error" && (
          <>
            <p className="warn">Something went wrong:</p>
            <pre className="notion-error">{error}</pre>
            <div className="notion-dialog-actions">
              {onClose ? (
                <button onClick={onClose}>Close</button>
              ) : (
                <button onClick={() => setStage(folder ? "preview" : "pick")}>Back</button>
              )}
            </div>
          </>
        )}
    </div>
  );
}

function persistReportTab(reportPageId: string): void {
  try {
    window.localStorage.setItem(
      TABS_STORAGE_KEY,
      JSON.stringify({
        tabs: [{ id: `tab_${Date.now()}`, item: { type: "page", id: reportPageId } }],
        activeTabIndex: 0
      })
    );
  } catch {
    /* If localStorage fails, the imported workspace still has activePageId in lotion.json. */
  }
}

/**
 * Modal wrapper retained for the workspace selector shortcut. The plugin
 * management page embeds the same panel directly.
 */
export function NotionImportDialog({ onClose }: NotionImportDialogProps) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog notion-dialog" onClick={(e) => e.stopPropagation()}>
        <NotionImportPanel onClose={onClose} />
      </div>
    </div>
  );
}
