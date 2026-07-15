import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SHORTCUTS,
  chordFromKeyboardEvent,
  displayShortcutChord,
  resolveShortcuts,
  validateShortcutOverride,
  type ResolvedShortcut
} from "../../shared/shortcuts";
import { useSettings } from "../lib/settings";

export function ShortcutSettings() {
  const { shortcutOverrides, setShortcutOverrides } = useSettings();
  const [query, setQuery] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const shortcuts = useMemo(() => resolveShortcuts(shortcutOverrides), [shortcutOverrides]);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = shortcuts.filter((shortcut) => {
    if (!normalizedQuery) return true;
    return [
      shortcut.label,
      shortcut.category,
      shortcut.id,
      shortcut.display,
      shortcut.defaultDisplay
    ].some((value) => value.toLowerCase().includes(normalizedQuery));
  });
  const grouped = groupShortcuts(filtered);

  useEffect(() => {
    if (!recordingId) return;
    const actionId = recordingId;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setRecordingId(null);
        setMessage("Shortcut capture canceled.");
        return;
      }
      const chord = chordFromKeyboardEvent(event);
      if (!chord) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const conflict = validateShortcutOverride(actionId, chord, shortcutOverrides);
      if (conflict) {
        setMessage(conflict.message);
        return;
      }
      setShortcutOverrides((current) => ({ ...current, [actionId]: chord }));
      setRecordingId(null);
      setMessage(`${displayShortcutChord(chord)} saved.`);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingId, setShortcutOverrides, shortcutOverrides]);

  function disableShortcut(shortcut: ResolvedShortcut) {
    if (!shortcut.configurable) return;
    setShortcutOverrides((current) => ({ ...current, [shortcut.id]: null }));
    setMessage(`${shortcut.label} disabled.`);
  }

  function resetShortcut(shortcut: ResolvedShortcut) {
    setShortcutOverrides((current) => {
      const next = { ...current };
      delete next[shortcut.id];
      return next;
    });
    setMessage(`${shortcut.label} reset.`);
  }

  function resetAll() {
    setShortcutOverrides({});
    setRecordingId(null);
    setMessage("All shortcuts reset.");
  }

  return (
    <section className="shortcut-settings" aria-label="Keyboard shortcuts">
      <div className="sidebar-settings-subhead">
        <span>Keyboard shortcuts</span>
        <button type="button" onClick={resetAll}>Reset all</button>
      </div>
      <input
        className="shortcut-settings-search"
        aria-label="Search keyboard shortcuts"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="Search shortcuts"
      />
      {message && (
        <div className="shortcut-settings-message" role="status" aria-live="polite">
          {message}
        </div>
      )}
      {recordingId && (
        <div className="shortcut-settings-recorder" role="status">
          Press a shortcut. Esc cancels.
        </div>
      )}
      <div className="shortcut-settings-list">
        {grouped.map(([category, categoryShortcuts]) => (
          <div className="shortcut-settings-group" key={category}>
            <div className="shortcut-settings-group-title">{category}</div>
            {categoryShortcuts.map((shortcut) => (
              <div
                className={shortcut.disabled ? "shortcut-settings-row disabled" : "shortcut-settings-row"}
                key={shortcut.id}
                data-shortcut-id={shortcut.id}
              >
                <div className="shortcut-settings-main">
                  <span className="shortcut-settings-label">{shortcut.label}</span>
                  <span className="shortcut-settings-scope">{shortcut.scope}</span>
                </div>
                <kbd className="shortcut-settings-chord">{shortcut.display}</kbd>
                <div className="shortcut-settings-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setRecordingId(shortcut.id);
                      setMessage(`Recording ${shortcut.label}.`);
                    }}
                    disabled={!shortcut.configurable}
                    aria-label={`Edit ${shortcut.label}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => shortcut.disabled ? resetShortcut(shortcut) : disableShortcut(shortcut)}
                    disabled={!shortcut.configurable}
                  >
                    {shortcut.disabled ? "Enable" : "Disable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => resetShortcut(shortcut)}
                    disabled={!shortcut.customized}
                  >
                    Reset
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
        {filtered.length === 0 && <div className="shortcut-settings-empty">No shortcuts found.</div>}
      </div>
    </section>
  );
}

function groupShortcuts(shortcuts: ResolvedShortcut[]): Array<[string, ResolvedShortcut[]]> {
  const order = new Map(DEFAULT_SHORTCUTS.map((shortcut, index) => [shortcut.id, index]));
  const groups = new Map<string, ResolvedShortcut[]>();
  for (const shortcut of shortcuts) {
    const rows = groups.get(shortcut.category) ?? [];
    rows.push(shortcut);
    groups.set(shortcut.category, rows);
  }
  return [...groups.entries()].map(([category, rows]) => [
    category,
    rows.slice().sort((left, right) => (order.get(left.id) ?? 999) - (order.get(right.id) ?? 999))
  ]);
}
