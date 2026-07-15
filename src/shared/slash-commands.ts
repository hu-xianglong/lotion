import { PAGES_DATABASE_ID } from "./constants.js";
import { pageMarkdownFileName, rowPagesWorkspacePath } from "./workspace-paths.js";

export type SlashCommandPlacement = "inline" | "line";

export type SlashCommandIconId =
  | "text"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "todo"
  | "quote"
  | "callout"
  | "code"
  | "divider"
  | "table"
  | "toc"
  | "link"
  | "highlight"
  | "image"
  | "page"
  | "database";

export interface SlashCommand {
  id: string;
  label: string;
  hint: string;
  group: string;
  iconId: SlashCommandIconId;
  aliases?: string[];
  /** Markdown to insert. Use `|` to mark the final cursor position. */
  template: string;
  /** Line commands replace the whole slash line prefix; inline commands
   *  replace only the `/query` span. */
  placement: SlashCommandPlacement;
}

export interface SlashTemplateEdit {
  from: number;
  to: number;
  insert: string;
  cursor: number;
}

export const BASE_SLASH_COMMANDS: SlashCommand[] = [
  { id: "text", label: "Text", hint: "普通文本", group: "Basic", iconId: "text", aliases: ["paragraph", "正文", "文本", "普通文本"], template: "|", placement: "inline" },
  { id: "h1", label: "Heading 1", hint: "大标题", group: "Basic", iconId: "h1", aliases: ["title", "标题", "一级标题", "大标题"], template: "# |", placement: "line" },
  { id: "h2", label: "Heading 2", hint: "中标题", group: "Basic", iconId: "h2", aliases: ["subtitle", "标题", "二级标题", "中标题"], template: "## |", placement: "line" },
  { id: "h3", label: "Heading 3", hint: "小标题", group: "Basic", iconId: "h3", aliases: ["标题", "三级标题", "小标题"], template: "### |", placement: "line" },
  { id: "bullet", label: "Bulleted list", hint: "无序列表", group: "Basic", iconId: "bullet", aliases: ["ul", "list", "列表", "无序列表", "项目列表"], template: "- |", placement: "line" },
  { id: "numbered", label: "Numbered list", hint: "有序列表", group: "Basic", iconId: "numbered", aliases: ["ol", "list", "列表", "有序列表", "编号列表"], template: "1. |", placement: "line" },
  { id: "todo", label: "To-do", hint: "任务列表", group: "Basic", iconId: "todo", aliases: ["task", "checkbox", "待办", "任务", "任务列表", "复选框"], template: "- [ ] |", placement: "line" },
  { id: "quote", label: "Quote", hint: "引用", group: "Basic", iconId: "quote", aliases: ["blockquote", "引用"], template: "> |", placement: "line" },
  {
    id: "callout",
    label: "Callout",
    hint: "强调块",
    group: "Blocks",
    iconId: "callout",
    aliases: ["note", "tip", "提示", "标注", "强调块"],
    template: "```lotion-callout\nicon: 💡\n---\n|\n```\n",
    placement: "line"
  },
  {
    id: "toggle",
    label: "Toggle",
    hint: "折叠块",
    group: "Blocks",
    iconId: "toc",
    aliases: ["toggle", "collapse", "折叠", "折叠块"],
    template: "```lotion-toggle\nsummary: |\nopen: true\n---\n\n```\n",
    placement: "line"
  },
  {
    id: "equation",
    label: "Equation",
    hint: "公式",
    group: "Blocks",
    iconId: "code",
    aliases: ["math", "latex", "公式", "数学公式"],
    template: "```lotion-equation\n|\n```\n",
    placement: "line"
  },
  { id: "code", label: "Code block", hint: "代码块", group: "Blocks", iconId: "code", aliases: ["pre", "代码", "代码块"], template: "```\n|\n```\n", placement: "line" },
  { id: "divider", label: "Divider", hint: "分割线", group: "Blocks", iconId: "divider", aliases: ["hr", "line", "分割", "分割线"], template: "---\n|", placement: "line" },
  {
    id: "table",
    label: "Table",
    hint: "Markdown 表格",
    group: "Blocks",
    iconId: "table",
    aliases: ["grid", "表格", "Markdown 表格"],
    template: "| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n{{cursor}}",
    placement: "line"
  },
  {
    id: "toc",
    label: "Table of contents",
    hint: "目录",
    group: "Blocks",
    iconId: "toc",
    aliases: ["contents", "outline", "目录", "toc"],
    template: "```lotion-toc\n```\n|",
    placement: "line"
  },
  { id: "link", label: "Link", hint: "网址", group: "Media", iconId: "link", aliases: ["url", "网址"], template: "[|](https://)", placement: "inline" },
  {
    id: "highlight",
    label: "Highlight",
    hint: "黄色高亮",
    group: "Basic",
    iconId: "highlight",
    aliases: ["mark", "yellow", "background", "高亮", "黄色高亮", "背景色"],
    template: "<span data-lotion-bg=\"yellow\">|</span>",
    placement: "inline"
  },
  {
    id: "embed",
    label: "Embed",
    hint: "嵌入网页",
    group: "Media",
    iconId: "link",
    aliases: ["iframe", "web", "widget", "嵌入", "网页", "网页嵌入", "嵌入网页"],
    template: "```lotion-iframe\nurl: |\nheight: 320\ntitle: Embed\n```\n",
    placement: "line"
  },
  { id: "image", label: "Image", hint: "图片", group: "Media", iconId: "image", aliases: ["photo", "media", "图片"], template: "![|](attachments/)", placement: "inline" }
];

const GROUP_ORDER = new Map([
  ["Basic", 0],
  ["Blocks", 1],
  ["Media", 2],
  ["Pages", 3],
  ["Databases", 4]
]);

export function filterSlashCommands(commands: SlashCommand[], query: string, limit = 100): SlashCommand[] {
  const normalized = normalizeSlashQuery(query);
  return commands
    .map((command, index) => ({
      command,
      index,
      score: scoreSlashCommand(command, normalized)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || commandOrder(a.command, b.command) || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.command);
}

export function applySlashCommandTemplate(input: {
  doc: string;
  lineFrom: number;
  slashFrom: number;
  slashTo: number;
  command: SlashCommand;
}): SlashTemplateEdit {
  let { text, cursorIndex } = splitTemplateCursor(input.command.template);
  if (input.command.placement === "inline") {
    return {
      from: input.slashFrom,
      to: input.slashTo,
      insert: text,
      cursor: input.slashFrom + cursorIndex
    };
  }

  if (input.command.id === "divider" && needsBlankLineBeforeDivider(input.doc, input.lineFrom)) {
    text = `\n${text}`;
    cursorIndex += 1;
  }

  const from = input.lineFrom;
  const to = input.slashTo;
  const { insert, cursorPrefix } = normalizeLineInsertionBoundaries(input.doc, from, to, text);
  return {
    from,
    to,
    insert,
    cursor: from + cursorPrefix + cursorIndex
  };
}

function needsBlankLineBeforeDivider(doc: string, lineFrom: number): boolean {
  if (lineFrom <= 0) return false;
  const previousLineEnd = doc[lineFrom - 1] === "\n" ? lineFrom - 1 : lineFrom;
  const previousBreak = doc.lastIndexOf("\n", Math.max(0, previousLineEnd - 1));
  const previousLineStart = previousBreak < 0 ? 0 : previousBreak + 1;
  return doc.slice(previousLineStart, previousLineEnd).trim().length > 0;
}

export function createPageSlashCommands(pages: Array<{ id: string; title: string; path?: string[] }>): SlashCommand[] {
  return pages.map((page) => {
    const title = page.title.trim() || "Untitled";
    const path = pagePathLabel(page.path);
    const target = `${rowPagesWorkspacePath(PAGES_DATABASE_ID, true, "pages")}/${pageMarkdownFileName(page.id, title)}`;
    return {
      id: `page:${page.id}`,
      label: title,
      hint: path || "Page link",
      group: "Pages",
      iconId: "page",
      aliases: ["page", "link", "页面", "链接", path],
      template: `[${escapeMarkdownLabel(title)}](${target})|`,
      placement: "inline"
    };
  });
}

export function createDatabaseSlashCommands(databases: Array<{ id: string; name: string; path?: string[] }>): SlashCommand[] {
  return databases.map((database) => {
    const path = pagePathLabel(database.path);
    return {
      id: `database:${database.id}`,
      label: database.name,
      hint: path || "数据库视图",
      group: "Databases",
      iconId: "database",
      aliases: ["database", "db", "view", "table", "数据库", "视图", path],
      template: "```lotion-view\n" +
        `database: ${database.id}\n` +
        "view: view_default\n" +
        "```\n|",
      placement: "line"
    };
  });
}

function normalizeSlashQuery(query: string): string {
  return query.trim().toLowerCase();
}

function scoreSlashCommand(command: SlashCommand, query: string): number {
  if (!query) return 1;
  const label = command.label.toLowerCase();
  const id = command.id.toLowerCase();
  const group = command.group.toLowerCase();
  const aliases = (command.aliases ?? []).map((alias) => alias.toLowerCase()).filter(Boolean);
  if (id === query || label === query) return 1000;
  if (label.startsWith(query)) return 900;
  if (aliases.some((alias) => alias === query)) return 850;
  if (aliases.some((alias) => alias.startsWith(query))) return 800;
  if (id.includes(query)) return 700;
  if (label.includes(query)) return 650;
  if (aliases.some((alias) => alias.includes(query))) return 600;
  if (group.includes(query)) return 300;
  return 0;
}

function commandOrder(left: SlashCommand, right: SlashCommand): number {
  const leftGroup = GROUP_ORDER.get(left.group) ?? 99;
  const rightGroup = GROUP_ORDER.get(right.group) ?? 99;
  if (leftGroup !== rightGroup) return leftGroup - rightGroup;
  return left.label.localeCompare(right.label);
}

function splitTemplateCursor(template: string): { text: string; cursorIndex: number } {
  const explicitCursor = "{{cursor}}";
  const explicitIndex = template.indexOf(explicitCursor);
  if (explicitIndex >= 0) {
    return {
      text: template.slice(0, explicitIndex) + template.slice(explicitIndex + explicitCursor.length),
      cursorIndex: explicitIndex
    };
  }
  const cursorIndex = template.indexOf("|");
  if (cursorIndex < 0) return { text: template, cursorIndex: template.length };
  return {
    text: template.slice(0, cursorIndex) + template.slice(cursorIndex + 1),
    cursorIndex
  };
}

function normalizeLineInsertionBoundaries(doc: string, from: number, to: number, text: string): { insert: string; cursorPrefix: number } {
  const before = from > 0 ? doc[from - 1] : "";
  const after = to < doc.length ? doc[to] : "";
  const prefix = before && before !== "\n" ? "\n" : "";
  const suffix = after && after !== "\n" ? "\n" : "";
  return {
    insert: `${prefix}${text}${suffix}`,
    cursorPrefix: prefix.length
  };
}

function pagePathLabel(path: string[] | undefined): string {
  const segments = (path ?? []).map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 1 ? segments.join(" / ") : "";
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}
