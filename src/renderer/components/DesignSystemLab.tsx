import {
  DatabaseIcon,
  FilterIcon,
  PageFileIcon,
  SearchIcon,
  SettingsIcon,
  SortIcon
} from "./Icons";

const TOKEN_SWATCHES = [
  ["Paper", "var(--paper)", "Main canvas"],
  ["Sand", "var(--sand)", "App chrome"],
  ["Vellum", "var(--vellum)", "Hover/input surface"],
  ["Kraft", "var(--kraft)", "Selected surface"],
  ["Accent", "var(--accent)", "Primary/focus"],
  ["Success", "var(--success-soft)", "Status surface"]
] as const;

export function DesignSystemLab() {
  return (
    <div className="design-system-lab" data-testid="design-system-lab">
      <header className="design-system-hero">
        <div>
          <p className="design-system-eyebrow">Frontend system</p>
          <h1>Lotion workbench system</h1>
          <p>
            A restrained local workbench style for editor chrome, search,
            settings, plugin panels, and database tools.
          </p>
        </div>
        <div className="design-system-status-row" aria-label="Design system quality gates">
          <span className="lotion-ui-status-pill success">Readable</span>
          <span className="lotion-ui-status-pill warning">Dense</span>
          <span className="lotion-ui-status-pill neutral">Tokenized</span>
        </div>
      </header>

      <section className="design-system-section" aria-label="Surface tokens">
        <div className="design-system-section-heading">
          <h2>Tokens</h2>
          <p>Shared surface, ink, rule, status, radius, shadow, and focus tokens.</p>
        </div>
        <div className="design-token-grid">
          {TOKEN_SWATCHES.map(([name, value, description]) => (
            <div key={name} className="design-token-card">
              <span className="design-token-swatch" style={{ background: value }} />
              <strong>{name}</strong>
              <code>{value}</code>
              <span>{description}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="design-system-section" aria-label="Controls">
        <div className="design-system-section-heading">
          <h2>Controls</h2>
          <p>Quiet defaults with one accent path for primary and focus states.</p>
        </div>
        <div className="lotion-ui-panel">
          <div className="lotion-ui-toolbar" role="toolbar" aria-label="Design system toolbar">
            <button className="lotion-ui-button primary" type="button">
              New page
            </button>
            <button className="lotion-ui-button" type="button">
              Save
            </button>
            <button className="lotion-ui-button ghost" type="button">
              Cancel
            </button>
            <button className="lotion-ui-icon-button" type="button" aria-label="Filter results">
              <FilterIcon />
            </button>
            <button className="lotion-ui-icon-button" type="button" aria-label="Sort results">
              <SortIcon />
            </button>
          </div>
          <div className="design-control-grid">
            <label className="lotion-ui-field">
              <span>Search</span>
              <span className="lotion-ui-input-shell">
                <SearchIcon />
                <input className="lotion-ui-input" defaultValue="Project notes" />
              </span>
            </label>
            <label className="lotion-ui-field">
              <span>Mode</span>
              <select className="lotion-ui-select" defaultValue="default">
                <option value="default">Default</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label className="lotion-ui-toggle">
              <input type="checkbox" defaultChecked />
              <span>Show page context</span>
            </label>
            <div className="lotion-ui-segmented" role="group" aria-label="Result mode">
              <button className="active" type="button">Search</button>
              <button type="button">AI</button>
              <button type="button">Settings</button>
            </div>
          </div>
        </div>
      </section>

      <section className="design-system-section" aria-label="Workflow patterns">
        <div className="design-system-section-heading">
          <h2>Patterns</h2>
          <p>Reusable rows for search results, settings, source cards, and status states.</p>
        </div>
        <div className="design-pattern-grid">
          <button className="lotion-ui-result-item" type="button">
            <span className="lotion-ui-result-icon"><PageFileIcon /></span>
            <span>
              <strong>Daily plan</strong>
              <small>Page · Workspace / Journal</small>
            </span>
            <span className="lotion-ui-kbd">↵</span>
          </button>
          <button className="lotion-ui-result-item" type="button">
            <span className="lotion-ui-result-icon"><DatabaseIcon /></span>
            <span>
              <strong>Task database</strong>
              <small>Database · 1,204 rows · Updated today</small>
            </span>
            <span className="lotion-ui-kbd">⌘O</span>
          </button>
          <div className="lotion-ui-settings-row">
            <span className="lotion-ui-result-icon"><SettingsIcon /></span>
            <span>
              <strong>Advanced Search provider</strong>
              <small>Keep configuration inside Settings, not workflow pages.</small>
            </span>
            <span className="lotion-ui-status-pill neutral">Local</span>
          </div>
          <div className="lotion-ui-source-card">
            <strong>Source attachment</strong>
            <span>attachments/original/Export/page.html</span>
            <button className="lotion-ui-button ghost" type="button">Open</button>
          </div>
        </div>
      </section>
    </div>
  );
}
