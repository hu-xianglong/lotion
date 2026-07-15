import type { DatabaseViewType, FieldType } from "../../shared/types";
import { useSettings } from "../lib/settings";
import {
  Calendar,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  Clock,
  GalleryHorizontal,
  Hash,
  KanbanSquare,
  List,
  Link,
  AlignLeft,
  Sigma,
  Table2,
  Tags,
  Type
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Field-type column-header glyphs are now sourced from lucide-react —
// professionally drawn line icons with a uniform stroke width — so we
// no longer maintain SVG paths in-line. Two visual modes:
//
//   - minimal: Lucide stroke in `currentColor`
//   - any accent theme: Lucide glyph centered in a colored squircle
//     whose fill is `var(--icon-accent)`, glyph stroke = white.

function Dop({ Icon }: { Icon: LucideIcon }) {
  return (
    <span
      className="field-type-glyph field-type-glyph-dop"
      aria-hidden="true"
    >
      <Icon width="70%" height="70%" strokeWidth={2.2} />
    </span>
  );
}

function TextGlyph({ children }: { children: string }) {
  return (
    <span className="field-type-glyph field-type-glyph-dop field-type-glyph-text" aria-hidden="true">
      {children}
    </span>
  );
}

const MIN_PROPS = {
  className: "field-type-glyph-svg",
  width: 14,
  height: 14,
  strokeWidth: 1.6,
  "aria-hidden": true as const
};

export function FieldTypeIcon({ type, isTitle = false }: { type: FieldType; isTitle?: boolean }) {
  const accent = useSettings().iconTheme !== "minimal";

  // Notion treats the title property as "Aa" and ordinary text as a
  // paragraph icon. Keep that distinction even though both are stored as
  // text fields in Lotion.
  if (type === "text") {
    if (!isTitle) return accent ? <Dop Icon={AlignLeft} /> : <AlignLeft {...MIN_PROPS} />;
    return accent ? (
      <TextGlyph>Aa</TextGlyph>
    ) : (
      <span className="field-type-glyph field-type-glyph-text" aria-hidden="true">Aa</span>
    );
  }
  if (type === "number") {
    return accent ? <Dop Icon={Hash} /> : <Hash {...MIN_PROPS} />;
  }
  if (type === "formula" || type === "rollup") {
    return accent ? <Dop Icon={Sigma} /> : <Sigma {...MIN_PROPS} />;
  }
  if (type === "id") {
    return accent ? (
      <TextGlyph>id</TextGlyph>
    ) : (
      <span className="field-type-glyph field-type-glyph-id" aria-hidden="true">id</span>
    );
  }

  // select → a chevron-down (matches HTML <select>'s dropdown indicator).
  if (type === "select") {
    return accent ? <Dop Icon={ChevronDown} /> : <ChevronDown {...MIN_PROPS} />;
  }

  // multi_select → Lucide's `Tags` icon (two layered tag shapes).
  if (type === "multi_select") {
    return accent ? <Dop Icon={Tags} /> : <Tags {...MIN_PROPS} />;
  }

  if (type === "date") {
    return accent ? <Dop Icon={Calendar} /> : <Calendar {...MIN_PROPS} />;
  }
  if (type === "url") {
    return accent ? <Dop Icon={Link} /> : <Link {...MIN_PROPS} />;
  }
  if (type === "entity_ref") {
    return accent ? <Dop Icon={Link} /> : <Link {...MIN_PROPS} />;
  }
  if (type === "checkbox") {
    return accent ? <Dop Icon={CheckSquare} /> : <CheckSquare {...MIN_PROPS} />;
  }
  if (type === "created_time" || type === "updated_time") {
    return accent ? <Dop Icon={Clock} /> : <Clock {...MIN_PROPS} />;
  }

  // Fallback for any future / unrecognised type — keep a neutral mark
  // so the column header doesn't ship an empty space.
  return accent ? <Dop Icon={Type} /> : <span className="field-type-glyph" aria-hidden="true">·</span>;
}

export function ViewTypeIcon({
  type = "table",
  providerIcon
}: {
  type?: DatabaseViewType;
  providerIcon?: string;
}) {
  const knownLucideType =
    type === "table" ||
    type === "list" ||
    type === "calendar" ||
    type === "gallery" ||
    type === "kanban";
  if (providerIcon && !knownLucideType) {
    return <span className="view-type-glyph view-type-glyph-text" aria-hidden="true">{providerIcon}</span>;
  }

  const props = {
    className: "view-type-glyph",
    width: 14,
    height: 14,
    strokeWidth: 1.7,
    "aria-hidden": true as const
  };
  if (type === "list") return <List {...props} />;
  if (type === "calendar") return <CalendarDays {...props} />;
  if (type === "gallery") return <GalleryHorizontal {...props} />;
  if (type === "kanban") return <KanbanSquare {...props} />;
  return <Table2 {...props} />;
}
