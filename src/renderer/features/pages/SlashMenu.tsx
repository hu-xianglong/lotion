import { useEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import { createPortal } from "react-dom";
import {
  CheckSquare,
  Code2,
  Database,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image,
  Lightbulb,
  Link2,
  List,
  ListOrdered,
  ListTree,
  Minus,
  FileText,
  Quote,
  Table2,
  Type,
  type LucideIcon
} from "lucide-react";
import { filterSlashCommands, type SlashCommand, type SlashCommandIconId } from "../../../shared/slash-commands";
import { useI18n, type Locale } from "../../lib/i18n";

export type { SlashCommand } from "../../../shared/slash-commands";

interface SlashCommandDisplay {
  label: string;
  hint: string;
  group: string;
}

const SLASH_GROUP_COPY: Record<string, Record<Locale, string>> = {
  Basic: { en: "Basic", zh: "基础" },
  Blocks: { en: "Blocks", zh: "块" },
  Media: { en: "Media", zh: "媒体" },
  Pages: { en: "Pages", zh: "页面" },
  Databases: { en: "Databases", zh: "数据库" },
  Data: { en: "Data", zh: "数据" }
};

const BASE_SLASH_COPY: Record<string, Record<Locale, Pick<SlashCommandDisplay, "label" | "hint">>> = {
  text: {
    en: { label: "Text", hint: "Plain paragraph" },
    zh: { label: "文本", hint: "普通段落" }
  },
  h1: {
    en: { label: "Heading 1", hint: "Large section title" },
    zh: { label: "大标题", hint: "一级标题" }
  },
  heading_1: {
    en: { label: "Heading 1", hint: "Large section title" },
    zh: { label: "大标题", hint: "一级标题" }
  },
  h2: {
    en: { label: "Heading 2", hint: "Medium section title" },
    zh: { label: "中标题", hint: "二级标题" }
  },
  h3: {
    en: { label: "Heading 3", hint: "Small section title" },
    zh: { label: "小标题", hint: "三级标题" }
  },
  bullet: {
    en: { label: "Bulleted list", hint: "Simple unordered list" },
    zh: { label: "无序列表", hint: "项目符号列表" }
  },
  numbered: {
    en: { label: "Numbered list", hint: "Ordered list" },
    zh: { label: "有序列表", hint: "编号列表" }
  },
  todo: {
    en: { label: "To-do", hint: "Checkbox task" },
    zh: { label: "待办", hint: "复选框任务" }
  },
  quote: {
    en: { label: "Quote", hint: "Quoted block" },
    zh: { label: "引用", hint: "引用块" }
  },
  callout: {
    en: { label: "Callout", hint: "Emphasized note" },
    zh: { label: "标注", hint: "强调提示块" }
  },
  toggle: {
    en: { label: "Toggle", hint: "Collapsible block" },
    zh: { label: "折叠块", hint: "可展开内容" }
  },
  equation: {
    en: { label: "Equation", hint: "Math formula" },
    zh: { label: "公式", hint: "数学公式" }
  },
  code: {
    en: { label: "Code block", hint: "Fenced code" },
    zh: { label: "代码块", hint: "多行代码" }
  },
  divider: {
    en: { label: "Divider", hint: "Horizontal rule" },
    zh: { label: "分割线", hint: "水平分隔" }
  },
  table: {
    en: { label: "Table", hint: "Markdown table" },
    zh: { label: "表格", hint: "Markdown 表格" }
  },
  toc: {
    en: { label: "Table of contents", hint: "Page outline" },
    zh: { label: "目录", hint: "页面大纲" }
  },
  link: {
    en: { label: "Link", hint: "Web link" },
    zh: { label: "链接", hint: "网址链接" }
  },
  highlight: {
    en: { label: "Highlight", hint: "Yellow background" },
    zh: { label: "高亮", hint: "黄色背景" }
  },
  embed: {
    en: { label: "Embed", hint: "Embedded webpage" },
    zh: { label: "嵌入", hint: "嵌入网页" }
  },
  image: {
    en: { label: "Image", hint: "Image attachment" },
    zh: { label: "图片", hint: "图片附件" }
  },
  database: {
    en: { label: "Database", hint: "Inline table view" },
    zh: { label: "数据库", hint: "内嵌表格视图" }
  }
};

const SLASH_ICONS: Record<SlashCommandIconId, LucideIcon> = {
  text: Type,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  bullet: List,
  numbered: ListOrdered,
  todo: CheckSquare,
  quote: Quote,
  callout: Lightbulb,
  code: Code2,
  divider: Minus,
  table: Table2,
  toc: ListTree,
  link: Link2,
  highlight: Highlighter,
  image: Image,
  page: FileText,
  database: Database
};

interface SlashMenuProps {
  anchor: { left: number; top: number };
  query: string;
  commands: SlashCommand[];
  onPick: (command: SlashCommand) => void;
  onClose: () => void;
}

interface SlashMenuContentProps {
  style: CSSProperties;
  items: SlashCommand[];
  active: number;
  listRef?: Ref<HTMLDivElement>;
  onHover: (index: number) => void;
  onPick: (command: SlashCommand) => void;
}

/**
 * Slash-command popover. Filters the command list by the substring
 * after `/`, navigates with ↑↓, commits with Enter, dismisses with Esc.
 * Anchored via the parent's choice — we position absolutely against
 * the editor cursor coordinates.
 */
export function SlashMenu({ anchor, query, commands, onPick, onClose }: SlashMenuProps) {
  const items = filterSlashCommands(commands, query);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset selection whenever the filtered list shape changes — the
  // previously active index might be out of range or off-target.
  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const activeEl = listRef.current?.querySelector<HTMLElement>(".slash-menu-item.active");
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && listRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onClose]);

  // Keyboard nav is wired at the window level so it works regardless
  // of where focus actually sits (the editor still owns it).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setActive((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setActive((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length));
      } else if (event.key === "Enter" || event.key === "Tab") {
        const choice = items[active];
        if (choice) {
          event.preventDefault();
          event.stopPropagation();
          onPick(choice);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [items, active, onPick, onClose]);

  return createPortal(
    <SlashMenuContent
      style={menuStyle(anchor)}
      items={items}
      active={active}
      listRef={listRef}
      onHover={setActive}
      onPick={onPick}
    />,
    document.body
  );
}

export function SlashMenuContent({ style, items, active, listRef, onHover, onPick }: SlashMenuContentProps) {
  const { locale } = useI18n();
  if (items.length === 0) {
    return (
      <div className="slash-menu" style={style} ref={listRef}>
        <div className="slash-menu-empty">{locale === "zh" ? "没有匹配的命令。" : "No matching commands."}</div>
      </div>
    );
  }

  return (
    <div className="slash-menu" style={style} ref={listRef}>
      {items.map((cmd, i) => {
        const Icon = SLASH_ICONS[cmd.iconId] ?? Type;
        const showGroup = i === 0 || items[i - 1].group !== cmd.group;
        const display = slashCommandDisplay(cmd, locale);
        return (
          <div key={cmd.id}>
            {showGroup && <div className="slash-menu-group-heading">{display.group}</div>}
            <button
              type="button"
              className={i === active ? "slash-menu-item active" : "slash-menu-item"}
              onMouseEnter={() => onHover(i)}
              onMouseDown={(event) => {
                // Prevent the editor from losing focus before the click
                // commits — without this, blur would fire and dismiss the
                // menu before onClick lands.
                event.preventDefault();
                onPick(cmd);
              }}
            >
              <span className="slash-menu-icon" aria-hidden="true"><Icon size={16} strokeWidth={1.9} /></span>
              <span className="slash-menu-copy">
                <span className="slash-menu-label">{display.label}</span>
                <span className="slash-menu-group">{display.hint}</span>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function slashCommandDisplay(command: SlashCommand, locale: Locale): SlashCommandDisplay {
  const copy = BASE_SLASH_COPY[command.id]?.[locale];
  return {
    label: copy?.label ?? command.label,
    hint: copy?.hint ?? localizedDynamicHint(command.hint, locale),
    group: slashGroupLabel(command.group, locale)
  };
}

function slashGroupLabel(group: string, locale: Locale): string {
  return SLASH_GROUP_COPY[group]?.[locale] ?? group;
}

function localizedDynamicHint(hint: string, locale: Locale): string {
  if (locale === "zh") {
    if (hint === "Page link") return "页面链接";
    if (hint === "数据库视图") return "数据库视图";
  } else if (hint === "数据库视图") {
    return "Database view";
  }
  return hint;
}

function menuStyle(anchor: { left: number; top: number }): CSSProperties {
  const width = 320;
  const gutter = 10;
  return {
    left: Math.max(gutter, Math.min(anchor.left, window.innerWidth - width - gutter)),
    top: Math.max(gutter, Math.min(anchor.top, window.innerHeight - 320 - gutter))
  };
}
