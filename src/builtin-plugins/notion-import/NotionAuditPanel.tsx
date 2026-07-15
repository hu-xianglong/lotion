import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { NotionAuditItem, NotionAuditResult } from "../../shared/types";

type AuditStage = "idle" | "running" | "done" | "error";

export function NotionAuditPanel() {
  const [stage, setStage] = useState<AuditStage>("idle");
  const [sourcePath, setSourcePath] = useState("");
  const [csvFilters, setCsvFilters] = useState("");
  const [htmlFilters, setHtmlFilters] = useState("");
  const [auditAllHtml, setAuditAllHtml] = useState(false);
  const [keepEmptyRows, setKeepEmptyRows] = useState(false);
  const [result, setResult] = useState<NotionAuditResult | null>(null);
  const [error, setError] = useState("");
  const resultRef = useRef<HTMLDivElement | null>(null);

  const canRun = sourcePath.trim().length > 0 && stage !== "running";
  const csvFilterList = useMemo(() => splitFilters(csvFilters), [csvFilters]);
  const htmlFilterList = useMemo(() => splitFilters(htmlFilters), [htmlFilters]);

  useEffect(() => {
    if (stage !== "done" || !result) return undefined;
    const frame = requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ block: "start", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [result, stage]);

  async function pickSource() {
    const chosen = await window.lotion.notion.pickFolder();
    if (!chosen) return;
    setSourcePath(chosen);
  }

  async function runAudit() {
    if (!canRun) return;
    setStage("running");
    setError("");
    setResult(null);
    try {
      const audit = await window.lotion.notion.audit({
        sourcePaths: [sourcePath],
        csvFilters: csvFilterList,
        htmlFilters: htmlFilterList,
        auditAllHtml,
        keepEmptyRows
      });
      setResult(audit);
      setStage("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStage("error");
    }
  }

  return (
    <div className="notion-audit-panel">
      <div className="notion-audit-heading">
        <div>
          <h2>Audit imported workspace</h2>
          <p>Compare the current Lotion workspace against a source Notion export.</p>
        </div>
        <button type="button" className="primary" disabled={!canRun} onClick={runAudit}>
          {stage === "running" ? "Auditing…" : "Run audit"}
        </button>
      </div>

      <div className="notion-audit-source-row">
        <button type="button" className="secondary" onClick={pickSource} disabled={stage === "running"}>
          Choose source…
        </button>
        <input
          type="text"
          value={sourcePath}
          onChange={(event) => setSourcePath(event.currentTarget.value)}
          placeholder="Paste a Notion export folder path, or choose one"
          disabled={stage === "running"}
        />
      </div>

      <div className="notion-audit-filter-grid">
        <label>
          <span>CSV filters</span>
          <textarea
            value={csvFilters}
            onChange={(event) => setCsvFilters(event.currentTarget.value)}
            placeholder="Blank = audit every source CSV"
            rows={3}
            disabled={stage === "running"}
          />
        </label>
        <label>
          <span>HTML filters</span>
          <textarea
            value={htmlFilters}
            onChange={(event) => setHtmlFilters(event.currentTarget.value)}
            placeholder="Blank = skip HTML body audit"
            rows={3}
            disabled={stage === "running" || auditAllHtml}
          />
        </label>
      </div>

      <div className="notion-audit-options">
        <label>
          <input
            type="checkbox"
            checked={auditAllHtml}
            onChange={(event) => setAuditAllHtml(event.currentTarget.checked)}
            disabled={stage === "running"}
          />
          <span>Audit every HTML body</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={keepEmptyRows}
            onChange={(event) => setKeepEmptyRows(event.currentTarget.checked)}
            disabled={stage === "running"}
          />
          <span>Expect blank source rows to be imported</span>
        </label>
      </div>

      {stage === "running" && <div className="notion-audit-status">Indexing source files and current workspace…</div>}
      {stage === "error" && <pre className="notion-error">{error}</pre>}
      {result && <AuditResult result={result} resultRef={resultRef} />}
    </div>
  );
}

export function AuditResult({ result, resultRef }: { result: NotionAuditResult; resultRef: RefObject<HTMLDivElement | null> }) {
  const passed = result.summary.issues === 0;
  const importedDatabases = result.summary.workspaceImportedDatabases ?? 0;
  const importedRows = result.summary.workspaceImportedRows ?? 0;
  return (
    <div className="notion-audit-result" ref={resultRef}>
      <table className="notion-summary">
        <tbody>
          <tr>
            <th>Source roots</th>
            <td>
              <div className="notion-audit-path-list">
                {result.summary.sourceRoots.map((source) => <AuditPath key={source} path={source} />)}
              </div>
            </td>
          </tr>
          <tr><th>Workspace root</th><td><AuditPath path={result.summary.workspaceRoot} /></td></tr>
          <tr><th>Source CSVs</th><td>{result.summary.auditedCsvs.toLocaleString()} / {result.summary.sourceCsvs.toLocaleString()}</td></tr>
          <tr><th>Source HTMLs</th><td>{result.summary.auditedHtmls.toLocaleString()} / {result.summary.sourceHtmls.toLocaleString()}</td></tr>
          <tr><th>Workspace</th><td>{result.summary.workspaceDatabases.toLocaleString()} DBs, {result.summary.workspaceRows.toLocaleString()} rows</td></tr>
          <tr>
            <th>Imported mappings</th>
            <td>
              {formatCount(importedDatabases, "database")},{" "}
              {formatCount(importedRows, "row/page", "row/pages")}
            </td>
          </tr>
          <tr><th>Issues</th><td>{result.summary.issues.toLocaleString()}</td></tr>
          <tr><th>Warnings</th><td>{result.summary.warnings.toLocaleString()}</td></tr>
        </tbody>
      </table>
      <div className={passed ? "notion-audit-ok" : "notion-audit-fail"}>
        {passed ? "No blocking audit issues found." : "Audit found blocking import issues."}
      </div>
      <AuditKindCounts title="Issue types" counts={result.issueKinds} />
      <AuditKindCounts title="Warning types" counts={result.warningKinds} />
      <AuditItems title="Issues" total={result.summary.issues} items={result.issues} />
      <AuditItems title="Warnings" total={result.summary.warnings} items={result.warnings} />
    </div>
  );
}

function AuditKindCounts({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <div className="notion-audit-kind-summary">
      <h3>{title}</h3>
      <div className="notion-audit-kind-grid">
        {entries.map(([kind, count]) => (
          <div className="notion-audit-kind-card" key={kind}>
            <code>{kind}</code>
            <strong>{count.toLocaleString()}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditItems({ title, total, items }: { title: string; total: number; items: NotionAuditItem[] }) {
  if (total === 0) return null;
  return (
    <details className="notion-db-preview notion-audit-items" open={title === "Issues"}>
      <summary>{title} ({total.toLocaleString()})</summary>
      <table>
        <thead>
          <tr>
            <th>Kind</th>
            <th>Source</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 200).map((item, index) => (
            <tr key={`${item.kind}-${index}`}>
              <td className="notion-audit-kind">{item.kind}</td>
              <td><AuditPath path={item.source} /></td>
              <td>{item.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > items.length && (
        <p className="hint">
          Showing first {items.length.toLocaleString()} items. Narrow the filters to inspect the rest.
        </p>
      )}
    </details>
  );
}

function AuditPath({ path }: { path: string }) {
  async function openPath() {
    const message = await window.lotion.shell.openLink(path);
    if (message) {
      console.warn(`Could not open audit path: ${message}`);
    }
  }

  return (
    <span className="notion-audit-path">
      <code title={path}>{path || "None"}</code>
      {path && (
        <button type="button" onClick={() => void openPath()}>
          Open
        </button>
      )}
    </span>
  );
}

function splitFilters(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}
