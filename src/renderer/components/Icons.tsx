// Lotion's icon set is a thin wrapper around lucide-react — a
// professionally drawn line-icon library — so we no longer maintain
// hand-rolled SVG paths. Two render modes are supported per icon:
//
//   - "minimal": the Lucide stroked glyph in `currentColor`.
//   - any accent theme (terracotta / navy / forest / saffron / plum):
//     the same glyph sits inside a rounded-square color block whose
//     fill comes from `var(--icon-accent)`. The glyph stroke is white.
//
// The set of names exported here is the contract callers rely on
// (Sidebar, EntityIcon, DatabaseTable toolbar, …); the mapping to a
// specific Lucide icon lives in the `LUCIDE` table so we can re-skin
// the whole app by swapping one entry.

import {
  ChevronDown as LcChevronDown,
  ChevronLeft as LcChevronLeft,
  ChevronRight as LcChevronRight,
  Database as LcDatabase,
  File as LcFile,
  FileText as LcFileText,
  Folder as LcFolder,
  FolderOpen as LcFolderOpen,
  ListFilter as LcFilter,
  ArrowUpNarrowWide as LcSort,
  Search as LcSearch,
  Settings as LcSettings,
  SquarePen as LcSquarePen,
  StickyNote as LcNote
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSettings } from "../lib/settings";

/** Wrap a Lucide glyph in a colored squircle for the accent themes.
 *  The wrap sizes via CSS (`.icon-accent-wrap`) so EntityIcon's parent
 *  span can drive the visual scale; the glyph inside takes 68 % of
 *  the wrap regardless of theme size. */
function Dop({ Icon }: { Icon: LucideIcon }) {
  return (
    <span className="icon-accent-wrap" aria-hidden="true">
      <Icon size={10} strokeWidth={2.2} />
    </span>
  );
}

function useAccent() {
  return useSettings().iconTheme !== "minimal";
}

/** Render a Lucide icon honouring the active theme. Chevrons opt out
 *  of the accent treatment by setting `monochrome` — they're tiny
 *  disclosure glyphs and a color block overpowers them.
 *
 *  Default render size is 14 px; CSS upscales it where the parent
 *  expects 100% fill (e.g. inside `.entity-icon-default` at 56 px). */
function Themed({ Icon, monochrome = false }: { Icon: LucideIcon; monochrome?: boolean }) {
  const accent = useAccent();
  if (accent && !monochrome) return <Dop Icon={Icon} />;
  return <Icon size={14} strokeWidth={1.6} />;
}

// ── exports — keep names stable; only the Lucide target changes ─────

export function PageFileIcon() {
  return <Themed Icon={LcFileText} />;
}
export function NewPageIcon() {
  return <Themed Icon={LcSquarePen} monochrome />;
}
export function RowFileIcon() {
  return <Themed Icon={LcFileText} />;
}
export function FolderClosedIcon() {
  return <Themed Icon={LcFolder} />;
}
export function FolderOpenIcon() {
  return <Themed Icon={LcFolderOpen} />;
}
export function DatabaseIcon() {
  return <Themed Icon={LcDatabase} />;
}
export function ChevronRightIcon() {
  return <Themed Icon={LcChevronRight} monochrome />;
}
export function ChevronLeftIcon() {
  return <Themed Icon={LcChevronLeft} monochrome />;
}
export function ChevronDownIcon() {
  return <Themed Icon={LcChevronDown} monochrome />;
}
export function GenericFileIcon() {
  return <Themed Icon={LcFile} />;
}
export function FilterIcon() {
  return <Themed Icon={LcFilter} />;
}
export function SortIcon() {
  return <Themed Icon={LcSort} />;
}
export function SearchIcon() {
  return <Themed Icon={LcSearch} />;
}
export function SettingsIcon() {
  return <Themed Icon={LcSettings} />;
}
export function NoteIcon() {
  return <Themed Icon={LcNote} />;
}
