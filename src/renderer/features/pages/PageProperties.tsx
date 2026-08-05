import { useEffect, useRef, useState } from "react";
import type { PageMeta } from "../../../shared/types";
import { useI18n } from "../../lib/i18n";
import { WorkspaceLinkButton } from "./PropertyLinks";

interface PagePropertiesProps {
  meta: PageMeta;
  onChange: (input: PagePropertyInput) => Promise<void> | void;
  onSearchTag?: (tag: string) => void;
}

export type PagePropertyInput = { tags?: string[]; date?: string; url?: string };
export type PagePropertyMutationState =
  | { status: "idle" }
  | { status: "pending"; input: PagePropertyInput }
  | { status: "error"; input: PagePropertyInput; error: string };

export function createPagePropertyMutationController(
  operation: (input: PagePropertyInput) => Promise<void>,
  onState: (state: PagePropertyMutationState) => void
) {
  let active = false;
  let failedInput: PagePropertyInput | null = null;

  const submit = async (input: PagePropertyInput): Promise<"submitted" | "failed" | "ignored"> => {
    if (active || failedInput) return "ignored";
    active = true;
    onState({ status: "pending", input });
    try {
      await operation(input);
      onState({ status: "idle" });
      return "submitted";
    } catch (error) {
      failedInput = input;
      onState({ status: "error", input, error: normalizePagePropertyError(error) });
      return "failed";
    } finally {
      active = false;
    }
  };

  return {
    submit,
    retry: async (): Promise<"submitted" | "failed" | "ignored"> => {
      if (active || !failedInput) return "ignored";
      const input = failedInput;
      failedInput = null;
      return submit(input);
    },
    dismiss: (): boolean => {
      if (active || !failedInput) return false;
      failedInput = null;
      onState({ status: "idle" });
      return true;
    }
  };
}

function normalizePagePropertyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Inline editable property panel for top-level pages — tags, date, url.
 * Mirrors the row-detail properties layout (160 px label / value). Each
 * field commits on blur or Enter; an empty value clears the underlying
 * metadata field on the next save.
 *
 * Why a fixed set instead of an arbitrary schema: top-level pages have
 * no DatabaseSchema. Keeping the property list short and uniform avoids
 * building a per-page schema editor — most workflows only need tags +
 * date anyway, and rich typed columns live on databases.
 */
export function PageProperties({ meta, onChange, onSearchTag }: PagePropertiesProps) {
  const { t } = useI18n();
  const [tagsText, setTagsText] = useState((meta.tags ?? []).join(", "));
  const [date, setDate] = useState(meta.date ?? "");
  const [url, setUrl] = useState(meta.url ?? "");
  const [mutation, setMutation] = useState<PagePropertyMutationState>({ status: "idle" });
  const operationRef = useRef(onChange);
  operationRef.current = onChange;
  const controllerRef = useRef<ReturnType<typeof createPagePropertyMutationController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createPagePropertyMutationController(
      async (input) => operationRef.current(input),
      setMutation
    );
  }
  const blocked = mutation.status !== "idle";

  // Re-sync from props when navigating between pages — otherwise the
  // input keeps the previous page's text.
  useEffect(() => {
    setTagsText((meta.tags ?? []).join(", "));
    setDate(meta.date ?? "");
    setUrl(meta.url ?? "");
  }, [meta.id, meta.tags, meta.date, meta.url]);

  function commitTags() {
    const tags = tagsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const previous = (meta.tags ?? []).join(",");
    if (previous === tags.join(",")) return;
    void controllerRef.current?.submit({ tags });
  }
  function commitDate() {
    if ((meta.date ?? "") === date) return;
    void controllerRef.current?.submit({ date });
  }
  function commitUrl() {
    if ((meta.url ?? "") === url) return;
    void controllerRef.current?.submit({ url });
  }

  return (
    <div className="row-properties page-properties">
      <PropertyField
        label={t("page.props.tags")}
        icon={<TagsIcon />}
      >
        <span className="page-property-tag-stack">
          <PageTagSearchChips tags={meta.tags ?? []} onSearchTag={onSearchTag} />
          <input
            className="page-property-input"
            value={tagsText}
            placeholder={t("cell.empty")}
            disabled={blocked}
            onChange={(e) => setTagsText(e.target.value)}
            onBlur={commitTags}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </span>
      </PropertyField>

      <PropertyField label={t("page.props.date")} icon={<CalendarIcon />}>
        <input
          className="page-property-input"
          value={date}
          placeholder={t("cell.empty")}
          disabled={blocked}
          onChange={(e) => setDate(e.target.value)}
          onBlur={commitDate}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      </PropertyField>

      <PropertyField label={t("page.props.url")} icon={<LinkIcon />}>
        <PageUrlProperty
          value={url}
          placeholder={t("cell.empty")}
          onChange={setUrl}
          onCommit={commitUrl}
          disabled={blocked}
        />
      </PropertyField>

      {mutation.status === "error" ? (
        <div className="database-mutation-toast page-property-feedback error" role="alert" aria-live="assertive">
          <span>Page properties failed to save: {mutation.error}</span>
          <button type="button" onClick={() => { void controllerRef.current?.retry(); }}>Retry</button>
          <button type="button" onClick={() => {
            if (!controllerRef.current?.dismiss()) return;
            setTagsText((meta.tags ?? []).join(", "));
            setDate(meta.date ?? "");
            setUrl(meta.url ?? "");
          }}>Discard changes</button>
        </div>
      ) : null}

      {meta.originalNotionHtml ? (
        <PropertyField label="Original Notion HTML" icon={<LinkIcon />}>
          <WorkspaceLinkButton href={meta.originalNotionHtml} />
        </PropertyField>
      ) : null}
    </div>
  );
}

interface PropertyFieldProps {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function PropertyField({ label, icon, children }: PropertyFieldProps) {
  return (
    <div className="row-property">
      <div className="row-property-label">
        <span className="row-property-icon">{icon}</span>
        <span className="row-property-name">{label}</span>
      </div>
      <div className="row-property-value">{children}</div>
    </div>
  );
}

function PageTagSearchChips({ tags, onSearchTag }: { tags: string[]; onSearchTag?: (tag: string) => void }) {
  const values = tags.map((tag) => tag.trim()).filter(Boolean);
  if (values.length === 0) return null;
  return (
    <span className="row-property-option-searches page-property-tag-searches" aria-label="Search page tags">
      {values.map((tag) => (
        <button
          key={tag}
          type="button"
          className="row-property-option-search row-property-option-search-chip page-property-tag-search"
          title={`Search tag: ${tag}`}
          aria-label={`Search tag: ${tag}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSearchTag?.(tag);
          }}
        >
          <span className="row-property-option-search-glyph" aria-hidden="true">⌕</span>
          <span className="row-property-option-search-label">{tag}</span>
        </button>
      ))}
    </span>
  );
}

function PageUrlProperty({
  value,
  placeholder,
  onChange,
  onCommit,
  disabled = false
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  disabled?: boolean;
}) {
  const raw = value.trim();
  const href = normalizeUrlForOpen(raw);
  const display = raw || placeholder;
  return (
    <span className="url-cell page-property-url-cell">
      <span
        className={raw ? "url-cell-display" : "url-cell-display empty"}
        title={raw}
        onMouseDown={(event) => {
          event.preventDefault();
          const input = event.currentTarget.closest(".url-cell")?.querySelector("input");
          if (input instanceof HTMLInputElement) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
          }
        }}
      >
        {display}
      </span>
      <input
        className="page-property-input"
        type="url"
        value={value}
        placeholder="https://"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
      />
      <button
        type="button"
        className="url-cell-open"
        disabled={disabled || !href}
        title={href || placeholder || "Open URL"}
        aria-label="Open URL"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!href) return;
          void window.lotion.shell.openLink(href).then((message) => {
            if (message) console.warn("[lotion] failed to open page URL:", message);
          });
        }}
      >
        <ExternalLinkIcon />
      </button>
    </span>
  );
}

function normalizeUrlForOpen(raw: string): string {
  if (!raw) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  if (/^[^\s/@]+\.[^\s]+/.test(raw)) return `https://${raw}`;
  return raw;
}

// PageProperties' label glyphs come from lucide-react — the same line
// icon system the rest of the app uses now, so the property panel
// matches the sidebar / column-header style.
import {
  AlignLeft as RawTagsIcon,
  Calendar as RawCalendarIcon,
  ExternalLink as RawExternalLinkIcon,
  Link as RawLinkIcon
} from "lucide-react";

function TagsIcon() {
  return <RawTagsIcon size={14} strokeWidth={1.6} />;
}
function CalendarIcon() {
  return <RawCalendarIcon size={14} strokeWidth={1.6} />;
}
function LinkIcon() {
  return <RawLinkIcon size={14} strokeWidth={1.6} />;
}
function ExternalLinkIcon() {
  return <RawExternalLinkIcon size={16} strokeWidth={2} />;
}
