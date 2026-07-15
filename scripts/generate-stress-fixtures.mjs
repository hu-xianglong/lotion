import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyFormulasToRecords } from "./lib/formula.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const spaceRoot = join(repoRoot, "samples", "demo-space");

const BASE_DATE = new Date("2026-05-17T09:00:00.000Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function lcg(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

function pickMany(rand, list, min, max) {
  const count = min + Math.floor(rand() * (max - min + 1));
  const pool = [...list];
  const chosen = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const idx = Math.floor(rand() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen;
}

function isoFromOffset(offsetDays, offsetMinutes = 0) {
  return new Date(BASE_DATE + offsetDays * DAY + offsetMinutes * 60_000).toISOString();
}

function dateOnly(iso) {
  return iso.slice(0, 10);
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function toCsv(headers, rows) {
  const escape = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(","));
  }
  return lines.join("\n") + "\n";
}

async function writeDatabase({ id, schema, rows, views }) {
  const dir = join(spaceRoot, "databases", "user", databaseFolderName(id, schema.name));
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, "views"), { recursive: true });
  await writeJson(join(dir, "schema.json"), schema);
  const computedRows = applyFormulasToRecords(rows, schema.fields);
  await writeFile(join(dir, "data.csv"), toCsv(schema.fields.map((field) => field.id), computedRows), "utf8");
  for (const view of views) {
    await writeJson(join(dir, "views", `${view.id}.json`), view);
  }
}

function databaseFolderName(id, title = "") {
  const stableId = id.startsWith("db_") ? id : `db_${id}`;
  const slug = title ? slugifyTitle(title, 72) : "";
  return slug && slug !== stableId ? `${slug}--${stableId}` : stableId;
}

function slugifyTitle(value, maxLength = 64) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|\x00]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength)
    .replace(/_+$/g, "");
  return cleaned || "untitled";
}

// ── db_views_stress ────────────────────────────────────────────────────────────

const VS_STATUSES = ["Backlog", "Todo", "In Progress", "Blocked", "In Review", "Done"];
const VS_PRIORITIES = ["Low", "Medium", "High", "Critical"];
const VS_TEAMS = ["Frontend", "Backend", "Design", "Data", "Mobile"];
const VS_ASSIGNEES = ["Ada", "Boris", "Cleo", "Dimitri", "Esma"];
const VS_TAGS = ["bug", "feature", "refactor", "docs", "performance", "accessibility"];

const VS_TITLES = [
  "Investigate slow dashboard load",
  "Wire up search auto-complete",
  "Migrate auth tokens to new format",
  "Refactor sidebar layout",
  "Add empty-state illustrations",
  "Fix flaky integration test",
  "Audit color contrast on tables",
  "Document the formula engine",
  "Trim home page bundle size",
  "Add keyboard shortcut overlay",
  "Polish drag-to-reorder",
  "Repair mobile nav toggle",
  "Cache embedded view bundles",
  "Replace deprecated date picker",
  "Add bulk row delete",
  "Surface git commit hashes",
  "Sync user avatars across views",
  "Add export to Markdown",
  "Improve formula error messages",
  "Profile renderer memory usage",
  "Tighten CSV escape rules",
  "Add localized number formats",
  "Make sidebar resizable",
  "Audit dialog focus traps",
  "Add cursor-based pagination",
  "Add per-column wrap toggle",
  "Refactor view query engine",
  "Annotate empty database states",
  "Move plugin docs to repo",
  "Add inline view name editing"
];

const VS_TITLES_ZH = [
  "排查仪表盘加载缓慢的问题",
  "接入搜索自动补全",
  "迁移登录令牌到新版格式",
  "重构侧边栏布局",
  "补齐空状态插画",
  "修复偶发失败的集成测试",
  "检查表格的颜色对比度",
  "完善公式引擎文档",
  "瘦身首页打包体积",
  "添加快捷键浮层",
  "打磨拖拽排序体验",
  "修复移动端导航开关",
  "缓存嵌入视图的数据",
  "替换已废弃的日期选择器",
  "支持批量删除行",
  "在界面上展示 Git 提交哈希",
  "在多视图之间同步用户头像",
  "支持导出为 Markdown",
  "改进公式报错提示",
  "分析渲染端内存占用",
  "收紧 CSV 转义规则",
  "支持本地化的数字格式",
  "实现可调宽度的侧边栏",
  "审查弹窗的焦点陷阱",
  "支持基于游标的分页",
  "新增按列换行的开关",
  "重构视图查询引擎",
  "标注空数据库的友好提示",
  "把插件文档移入仓库",
  "支持在视图内联编辑名称"
];

const VS_OWNER_NOTES_ZH = [
  "小任务,本周内可以收尾。",
  "需要先和设计 review 一遍,确认无障碍同事的反馈。",
  "上游存储改造合并后再继续推进,暂时挂起。",
  "牵扯到单元格渲染和嵌入视图,要和公式重构那边对齐节奏。",
  "改动范围小,理论上不需要数据迁移。",
  "横跨渲染层、preload 边界和主进程,风险偏高,需要分步合并。"
];

const vsRand = lcg(0x10a31d2c);

const vsRows = VS_TITLES.map((title, index) => {
  const status = VS_STATUSES[index % VS_STATUSES.length];
  const priority = VS_PRIORITIES[(index + 1) % VS_PRIORITIES.length];
  const team = VS_TEAMS[(index + 2) % VS_TEAMS.length];
  const assignee = VS_ASSIGNEES[(index + 3) % VS_ASSIGNEES.length];
  const tags = pickMany(vsRand, VS_TAGS, 1, 3).join(";");
  const dueOffset = ((index * 3) % 21) - 5;
  const effort = 1 + Math.floor(vsRand() * 13);
  const progress = status === "Done" ? 100 : Math.floor(vsRand() * 100);
  const done = status === "Done";
  const noteLengths = [
    "Quick win, mostly tracked elsewhere.",
    "Needs design review before any code changes; expect comments from accessibility leads and from the team that owns the underlying telemetry.",
    "Blocked on upstream change in the storage adapter; will revisit once the streaming branch lands.",
    "Touches the cell renderer and the embedded view path; coordinate with the formula refactor so we do not double-instrument.",
    "Small isolated change; should not require a migration.",
    "Spans renderer, preload boundary, and main process — file under risky."
  ];
  const notes = noteLengths[index % noteLengths.length];
  const createdOffset = index * 0.4;
  const updatedOffset = createdOffset + (vsRand() * 2);
  const reviewedOffset = createdOffset - 1 - vsRand() * 3;
  return {
    id: `row_vs_${String(index + 1).padStart(3, "0")}`,
    created_time: isoFromOffset(createdOffset, index),
    updated_time: isoFromOffset(updatedOffset, index + 5),
    title,
    chinese_title: VS_TITLES_ZH[index % VS_TITLES_ZH.length],
    status,
    priority,
    team,
    assignee,
    tags,
    due_date: dateOnly(isoFromOffset(dueOffset)),
    last_reviewed_at: dateOnly(isoFromOffset(reviewedOffset)),
    effort,
    progress,
    done: done ? "true" : "false",
    notes,
    owner_notes_zh: VS_OWNER_NOTES_ZH[index % VS_OWNER_NOTES_ZH.length],
    urgency: ""
  };
});

const vsSchema = {
  id: "db_views_stress",
  name: "Views Stress Lab",
  created_time: isoFromOffset(0),
  updated_time: isoFromOffset(0),
  fields: [
    { id: "id", name: "ID", type: "id", system: true },
    { id: "created_time", name: "Created time", type: "created_time", system: true },
    { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
    { id: "title", name: "Title", type: "text" },
    { id: "chinese_title", name: "中文标题", type: "text" },
    {
      id: "status",
      name: "Status",
      type: "select",
      options: [
        { id: "opt_backlog", name: "Backlog", color: "gray" },
        { id: "opt_todo", name: "Todo", color: "yellow" },
        { id: "opt_in_progress", name: "In Progress", color: "blue" },
        { id: "opt_blocked", name: "Blocked", color: "red" },
        { id: "opt_in_review", name: "In Review", color: "purple" },
        { id: "opt_done", name: "Done", color: "green" }
      ]
    },
    {
      id: "priority",
      name: "Priority",
      type: "select",
      options: [
        { id: "opt_low", name: "Low", color: "gray" },
        { id: "opt_medium", name: "Medium", color: "yellow" },
        { id: "opt_high", name: "High", color: "orange" },
        { id: "opt_critical", name: "Critical", color: "red" }
      ]
    },
    {
      id: "team",
      name: "Team",
      type: "select",
      options: [
        { id: "opt_frontend", name: "Frontend", color: "blue" },
        { id: "opt_backend", name: "Backend", color: "purple" },
        { id: "opt_design", name: "Design", color: "pink" },
        { id: "opt_data", name: "Data", color: "orange" },
        { id: "opt_mobile", name: "Mobile", color: "green" }
      ]
    },
    {
      id: "assignee",
      name: "Assignee",
      type: "select",
      options: [
        { id: "opt_ada", name: "Ada", color: "purple" },
        { id: "opt_boris", name: "Boris", color: "blue" },
        { id: "opt_cleo", name: "Cleo", color: "pink" },
        { id: "opt_dimitri", name: "Dimitri", color: "orange" },
        { id: "opt_esma", name: "Esma", color: "green" }
      ]
    },
    {
      id: "tags",
      name: "Tags",
      type: "multi_select",
      options: [
        { id: "opt_bug", name: "bug", color: "red" },
        { id: "opt_feature", name: "feature", color: "blue" },
        { id: "opt_refactor", name: "refactor", color: "purple" },
        { id: "opt_docs", name: "docs", color: "gray" },
        { id: "opt_performance", name: "performance", color: "orange" },
        { id: "opt_accessibility", name: "accessibility", color: "green" }
      ]
    },
    { id: "due_date", name: "Due date", type: "date" },
    { id: "last_reviewed_at", name: "Last reviewed at", type: "date" },
    { id: "effort", name: "Effort", type: "number" },
    { id: "progress", name: "Progress", type: "number" },
    { id: "done", name: "Done", type: "checkbox" },
    { id: "notes", name: "Notes", type: "text" },
    { id: "owner_notes_zh", name: "负责人备注", type: "text" },
    {
      id: "urgency",
      name: "Urgency",
      type: "formula",
      formula: "=IF(status=\"Done\", 0, IF(priority=\"Critical\", 100, IF(priority=\"High\", 50, IF(priority=\"Medium\", 20, 5))))"
    },
    { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
  ],
  defaultViewId: "view_default"
};

const vsAllFields = ["title", "chinese_title", "status", "priority", "team", "assignee", "tags", "due_date", "last_reviewed_at", "effort", "progress", "done", "notes", "owner_notes_zh", "urgency"];
const vsCompactFields = ["title", "chinese_title", "status", "priority", "assignee"];
const vsChineseFields = ["chinese_title", "status", "priority", "team", "assignee", "owner_notes_zh", "last_reviewed_at"];

const vsViews = [
  {
    id: "view_default",
    name: "All",
    visibleFieldIds: vsAllFields,
    fieldOrder: vsAllFields,
    sorts: [{ fieldId: "due_date", direction: "asc" }],
    filters: []
  },
  {
    id: "view_compact",
    name: "Compact",
    visibleFieldIds: vsCompactFields,
    fieldOrder: vsCompactFields,
    sorts: [{ fieldId: "title", direction: "asc" }],
    filters: []
  },
  {
    id: "view_wide_wrap",
    name: "Wide (wrap notes)",
    visibleFieldIds: vsAllFields,
    fieldOrder: vsAllFields,
    sorts: [{ fieldId: "urgency", direction: "desc" }],
    filters: [],
    wrapFieldIds: ["notes", "title", "chinese_title", "owner_notes_zh"],
    columnWidths: { title: 260, chinese_title: 220, notes: 320, owner_notes_zh: 280 }
  },
  {
    id: "view_chinese",
    name: "中文视图",
    visibleFieldIds: vsChineseFields,
    fieldOrder: vsChineseFields,
    sorts: [{ fieldId: "last_reviewed_at", direction: "desc" }],
    filters: [],
    wrapFieldIds: ["chinese_title", "owner_notes_zh"],
    columnWidths: { chinese_title: 240, owner_notes_zh: 280 }
  },
  {
    id: "view_backlog",
    name: "Backlog",
    visibleFieldIds: ["title", "priority", "team", "assignee", "tags", "due_date"],
    fieldOrder: ["title", "priority", "team", "assignee", "tags", "due_date"],
    sorts: [{ fieldId: "due_date", direction: "asc" }],
    filters: [{ fieldId: "status", operator: "is", value: "Backlog" }]
  },
  {
    id: "view_todo",
    name: "Todo",
    visibleFieldIds: ["title", "priority", "team", "assignee", "due_date", "effort"],
    fieldOrder: ["title", "priority", "team", "assignee", "due_date", "effort"],
    sorts: [{ fieldId: "due_date", direction: "asc" }],
    filters: [{ fieldId: "status", operator: "is", value: "Todo" }]
  },
  {
    id: "view_in_progress",
    name: "In progress",
    visibleFieldIds: ["title", "priority", "team", "assignee", "progress", "due_date"],
    fieldOrder: ["title", "priority", "team", "assignee", "progress", "due_date"],
    sorts: [{ fieldId: "progress", direction: "desc" }],
    filters: [{ fieldId: "status", operator: "is", value: "In Progress" }]
  },
  {
    id: "view_blocked",
    name: "Blocked",
    visibleFieldIds: ["title", "priority", "team", "assignee", "notes"],
    fieldOrder: ["title", "priority", "team", "assignee", "notes"],
    sorts: [{ fieldId: "priority", direction: "asc" }],
    filters: [{ fieldId: "status", operator: "is", value: "Blocked" }]
  },
  {
    id: "view_in_review",
    name: "In review",
    visibleFieldIds: ["title", "team", "assignee", "updated_time"],
    fieldOrder: ["title", "team", "assignee", "updated_time"],
    sorts: [{ fieldId: "updated_time", direction: "desc" }],
    filters: [{ fieldId: "status", operator: "is", value: "In Review" }]
  },
  {
    id: "view_done",
    name: "Done",
    visibleFieldIds: ["title", "team", "assignee", "updated_time"],
    fieldOrder: ["title", "team", "assignee", "updated_time"],
    sorts: [{ fieldId: "updated_time", direction: "desc" }],
    filters: [{ fieldId: "done", operator: "checked", value: true }]
  },
  {
    id: "view_critical",
    name: "Critical",
    visibleFieldIds: ["title", "status", "team", "assignee", "due_date", "urgency"],
    fieldOrder: ["title", "status", "team", "assignee", "due_date", "urgency"],
    sorts: [{ fieldId: "due_date", direction: "asc" }],
    filters: [{ fieldId: "priority", operator: "is", value: "Critical" }]
  },
  {
    id: "view_high",
    name: "High priority",
    visibleFieldIds: ["title", "status", "team", "assignee", "due_date"],
    fieldOrder: ["title", "status", "team", "assignee", "due_date"],
    sorts: [{ fieldId: "due_date", direction: "asc" }],
    filters: [{ fieldId: "priority", operator: "is", value: "High" }]
  },
  {
    id: "view_frontend",
    name: "Frontend",
    visibleFieldIds: ["title", "status", "priority", "assignee", "due_date"],
    fieldOrder: ["title", "status", "priority", "assignee", "due_date"],
    sorts: [{ fieldId: "status", direction: "asc" }],
    filters: [{ fieldId: "team", operator: "is", value: "Frontend" }]
  },
  {
    id: "view_backend",
    name: "Backend",
    visibleFieldIds: ["title", "status", "priority", "assignee", "due_date"],
    fieldOrder: ["title", "status", "priority", "assignee", "due_date"],
    sorts: [{ fieldId: "status", direction: "asc" }],
    filters: [{ fieldId: "team", operator: "is", value: "Backend" }]
  },
  {
    id: "view_design",
    name: "Design",
    visibleFieldIds: ["title", "status", "priority", "assignee", "due_date"],
    fieldOrder: ["title", "status", "priority", "assignee", "due_date"],
    sorts: [{ fieldId: "status", direction: "asc" }],
    filters: [{ fieldId: "team", operator: "is", value: "Design" }]
  },
  {
    id: "view_data",
    name: "Data",
    visibleFieldIds: ["title", "status", "priority", "assignee", "due_date"],
    fieldOrder: ["title", "status", "priority", "assignee", "due_date"],
    sorts: [{ fieldId: "status", direction: "asc" }],
    filters: [{ fieldId: "team", operator: "is", value: "Data" }]
  },
  {
    id: "view_mobile",
    name: "Mobile",
    visibleFieldIds: ["title", "status", "priority", "assignee", "due_date"],
    fieldOrder: ["title", "status", "priority", "assignee", "due_date"],
    sorts: [{ fieldId: "status", direction: "asc" }],
    filters: [{ fieldId: "team", operator: "is", value: "Mobile" }]
  },
  {
    id: "view_ada",
    name: "Assigned to Ada",
    visibleFieldIds: ["title", "status", "priority", "team", "due_date"],
    fieldOrder: ["title", "status", "priority", "team", "due_date"],
    sorts: [{ fieldId: "due_date", direction: "asc" }],
    filters: [{ fieldId: "assignee", operator: "is", value: "Ada" }]
  }
].map((view) => ({ pageSize: 50, ...view, databaseId: "db_views_stress", type: "table" }));

// ── db_rows_stress ────────────────────────────────────────────────────────────

const RS_KINDS = ["Email", "Slack", "Bug", "Note", "Meeting", "Doc"];
const RS_SEVERITIES = ["Info", "Low", "Medium", "High", "Critical"];
const RS_TOPICS = ["Auth", "Billing", "Search", "UI", "Infra", "Mobile", "Analytics"];
const RS_TAGS = ["customer", "internal", "urgent", "automated", "manual"];
const RS_TITLE_HEADS = [
  "Customer report:",
  "Engineering note:",
  "Incident drill:",
  "Bug triage:",
  "Sync recap:",
  "Doc update:",
  "Investigation:",
  "Follow up:",
  "Telemetry blip:",
  "Pager event:"
];
const RS_TITLE_TAILS = [
  "auth latency spike",
  "billing webhook retries",
  "search index rebuild",
  "UI shimmer regression",
  "infra cost trend",
  "mobile crash cluster",
  "analytics gap",
  "feature flag rollout",
  "queue backlog growth",
  "schema migration delay"
];
const RS_NOTE_TEMPLATES = [
  "",
  "Short note.",
  "Owner ack'd; no action required this cycle.",
  "Worth a follow up with the owning team. Recheck after the next release branch is cut to confirm the regression is fully gone and that the dashboards reflect the recovered state.",
  "Triaged in standup. Lower confidence than usual because the alert fired during a deploy window and may be incidental. Will need a second data point before we escalate.",
  "Customer is unblocked but reports a similar symptom intermittently. Tagging for the next cross-team review.",
  "Marked as automated rollup; the underlying batch retried successfully on its own. Keep the link for the runbook so we have an example."
];

const RS_TITLE_HEADS_ZH = [
  "客户反馈:",
  "工程笔记:",
  "应急演练:",
  "Bug 分诊:",
  "同步回顾:",
  "文档更新:",
  "排查记录:",
  "跟进事项:",
  "遥测异常:",
  "值班事件:"
];
const RS_TITLE_TAILS_ZH = [
  "登录延迟突增",
  "账单 Webhook 重试",
  "搜索索引重建",
  "界面闪烁回归",
  "基础设施成本上扬",
  "移动端崩溃聚簇",
  "数据上报缺口",
  "功能开关灰度",
  "队列积压增长",
  "迁移延期"
];
const RS_NOTE_TEMPLATES_ZH = [
  "",
  "已记录,本周不需要额外动作。",
  "负责人已确认,等待下周复盘。",
  "需要在下一个发布周期内复查。建议把链接放进 runbook 作为案例。",
  "在站会上分诊。告警在发布窗口期触发,可能是偶发,需要再观察一轮。",
  "客户问题已临时绕过,但仍偶发相似症状,留作跨组例会议题。",
  "自动批处理已重试成功,标记为自动化。链接保留供新人参考。"
];
const RS_SOURCE_CHANNELS = ["Customer email", "Internal slack", "Pager duty", "Support ticket", "Status page", "Telemetry alert"];

function buildRsRows(rowCount, seed, prefix) {
  const rand = lcg(seed);
  const rows = [];
  for (let i = 0; i < rowCount; i += 1) {
    const head = RS_TITLE_HEADS[i % RS_TITLE_HEADS.length];
    const tail = RS_TITLE_TAILS[(i * 3 + 1) % RS_TITLE_TAILS.length];
    const kind = RS_KINDS[i % RS_KINDS.length];
    const severity = RS_SEVERITIES[Math.floor(rand() * RS_SEVERITIES.length)];
    const topic = RS_TOPICS[(i + Math.floor(rand() * RS_TOPICS.length)) % RS_TOPICS.length];
    const tags = pickMany(rand, RS_TAGS, 0, 2).join(";");
    const occurredOffset = -((i * 0.3) + rand() * 0.4);
    const occurredIso = isoFromOffset(occurredOffset, i * 7);
    const createdOffset = occurredOffset + 0.01;
    const updatedOffset = createdOffset + rand() * 0.2;
    const count = 1 + Math.floor(rand() * 50);
    const resolved = rand() < 0.55;
    const note = RS_NOTE_TEMPLATES[i % RS_NOTE_TEMPLATES.length];
    const headZh = RS_TITLE_HEADS_ZH[i % RS_TITLE_HEADS_ZH.length];
    const tailZh = RS_TITLE_TAILS_ZH[(i * 3 + 1) % RS_TITLE_TAILS_ZH.length];
    const sourceChannel = RS_SOURCE_CHANNELS[(i + Math.floor(rand() * 2)) % RS_SOURCE_CHANNELS.length];
    const noteZh = RS_NOTE_TEMPLATES_ZH[i % RS_NOTE_TEMPLATES_ZH.length];
    rows.push({
      id: `${prefix}_${String(i + 1).padStart(5, "0")}`,
      created_time: isoFromOffset(createdOffset, i * 7),
      updated_time: isoFromOffset(updatedOffset, i * 7 + 3),
      title: `${head} ${tail} #${i + 1}`,
      chinese_title: `${headZh} ${tailZh} #${i + 1}`,
      kind,
      severity,
      topic,
      source_channel: sourceChannel,
      tags,
      occurred_at: dateOnly(occurredIso),
      count,
      resolved: resolved ? "true" : "false",
      note,
      chinese_note: noteZh,
      urgency_score: ""
    });
  }
  return rows;
}

function buildRsSchema(id, name) { return {
  id,
  name,
  created_time: isoFromOffset(0),
  updated_time: isoFromOffset(0),
  fields: [
    { id: "id", name: "ID", type: "id", system: true },
    { id: "created_time", name: "Created time", type: "created_time", system: true },
    { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
    { id: "title", name: "Title", type: "text" },
    { id: "chinese_title", name: "中文标题", type: "text" },
    {
      id: "kind",
      name: "Kind",
      type: "select",
      options: [
        { id: "opt_email", name: "Email", color: "blue" },
        { id: "opt_slack", name: "Slack", color: "purple" },
        { id: "opt_bug", name: "Bug", color: "red" },
        { id: "opt_note", name: "Note", color: "gray" },
        { id: "opt_meeting", name: "Meeting", color: "orange" },
        { id: "opt_doc", name: "Doc", color: "green" }
      ]
    },
    {
      id: "source_channel",
      name: "Source channel",
      type: "select",
      options: [
        { id: "opt_customer_email", name: "Customer email", color: "blue" },
        { id: "opt_internal_slack", name: "Internal slack", color: "purple" },
        { id: "opt_pager_duty", name: "Pager duty", color: "red" },
        { id: "opt_support_ticket", name: "Support ticket", color: "yellow" },
        { id: "opt_status_page", name: "Status page", color: "orange" },
        { id: "opt_telemetry_alert", name: "Telemetry alert", color: "green" }
      ]
    },
    {
      id: "severity",
      name: "Severity",
      type: "select",
      options: [
        { id: "opt_info", name: "Info", color: "gray" },
        { id: "opt_low", name: "Low", color: "blue" },
        { id: "opt_medium", name: "Medium", color: "yellow" },
        { id: "opt_high", name: "High", color: "orange" },
        { id: "opt_critical", name: "Critical", color: "red" }
      ]
    },
    {
      id: "topic",
      name: "Topic",
      type: "select",
      options: [
        { id: "opt_auth", name: "Auth", color: "purple" },
        { id: "opt_billing", name: "Billing", color: "yellow" },
        { id: "opt_search", name: "Search", color: "blue" },
        { id: "opt_ui", name: "UI", color: "pink" },
        { id: "opt_infra", name: "Infra", color: "gray" },
        { id: "opt_mobile", name: "Mobile", color: "green" },
        { id: "opt_analytics", name: "Analytics", color: "orange" }
      ]
    },
    {
      id: "tags",
      name: "Tags",
      type: "multi_select",
      options: [
        { id: "opt_customer", name: "customer", color: "blue" },
        { id: "opt_internal", name: "internal", color: "gray" },
        { id: "opt_urgent", name: "urgent", color: "red" },
        { id: "opt_automated", name: "automated", color: "purple" },
        { id: "opt_manual", name: "manual", color: "orange" }
      ]
    },
    { id: "occurred_at", name: "Occurred at", type: "date" },
    { id: "count", name: "Count", type: "number" },
    { id: "resolved", name: "Resolved", type: "checkbox" },
    { id: "note", name: "Note", type: "text" },
    { id: "chinese_note", name: "中文备注", type: "text" },
    {
      id: "urgency_score",
      name: "Urgency score",
      type: "formula",
      formula: "=IF(resolved=TRUE, 0, IF(severity=\"Critical\", 100, IF(severity=\"High\", 60, IF(severity=\"Medium\", 25, IF(severity=\"Low\", 8, 1)))))"
    },
    { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
  ],
  defaultViewId: "view_default"
}; }

const rsAllFields = ["title", "chinese_title", "kind", "source_channel", "severity", "topic", "tags", "occurred_at", "count", "resolved", "note", "chinese_note", "urgency_score"];
const rsCompactFields = ["title", "chinese_title", "kind", "severity", "occurred_at"];
const rsChineseFields = ["chinese_title", "kind", "source_channel", "severity", "topic", "occurred_at", "resolved", "chinese_note"];

function buildRsViews(databaseId, defaultPageSize, compactPageSize) { return [
  {
    id: "view_default",
    name: "All",
    visibleFieldIds: rsAllFields,
    fieldOrder: rsAllFields,
    sorts: [{ fieldId: "occurred_at", direction: "desc" }],
    filters: [],
    pageSize: defaultPageSize
  },
  {
    id: "view_compact",
    name: "Compact",
    visibleFieldIds: rsCompactFields,
    fieldOrder: rsCompactFields,
    sorts: [{ fieldId: "occurred_at", direction: "desc" }],
    filters: [],
    pageSize: compactPageSize
  },
  {
    id: "view_wide_wrap",
    name: "Wrapped notes",
    visibleFieldIds: rsAllFields,
    fieldOrder: rsAllFields,
    sorts: [{ fieldId: "occurred_at", direction: "desc" }],
    filters: [],
    wrapFieldIds: ["note", "title", "chinese_title", "chinese_note"],
    columnWidths: { title: 280, chinese_title: 240, note: 320, chinese_note: 280, source_channel: 160 }
  },
  {
    id: "view_chinese",
    name: "中文视图",
    visibleFieldIds: rsChineseFields,
    fieldOrder: rsChineseFields,
    sorts: [{ fieldId: "occurred_at", direction: "desc" }],
    filters: [],
    wrapFieldIds: ["chinese_title", "chinese_note"],
    columnWidths: { chinese_title: 260, chinese_note: 280, source_channel: 160 }
  },
  {
    id: "view_unresolved",
    name: "Unresolved",
    visibleFieldIds: ["title", "kind", "severity", "topic", "occurred_at", "count"],
    fieldOrder: ["title", "kind", "severity", "topic", "occurred_at", "count"],
    sorts: [{ fieldId: "urgency_score", direction: "desc" }],
    filters: [{ fieldId: "resolved", operator: "is_not", value: "true" }]
  },
  {
    id: "view_resolved",
    name: "Resolved",
    visibleFieldIds: ["title", "kind", "severity", "topic", "occurred_at"],
    fieldOrder: ["title", "kind", "severity", "topic", "occurred_at"],
    sorts: [{ fieldId: "occurred_at", direction: "desc" }],
    filters: [{ fieldId: "resolved", operator: "checked", value: true }]
  },
  {
    id: "view_critical",
    name: "Critical",
    visibleFieldIds: ["title", "kind", "topic", "occurred_at", "resolved"],
    fieldOrder: ["title", "kind", "topic", "occurred_at", "resolved"],
    sorts: [{ fieldId: "occurred_at", direction: "desc" }],
    filters: [{ fieldId: "severity", operator: "is", value: "Critical" }]
  },
  {
    id: "view_high",
    name: "High severity",
    visibleFieldIds: ["title", "kind", "topic", "occurred_at", "resolved"],
    fieldOrder: ["title", "kind", "topic", "occurred_at", "resolved"],
    sorts: [{ fieldId: "occurred_at", direction: "desc" }],
    filters: [{ fieldId: "severity", operator: "is", value: "High" }]
  },
  {
    id: "view_bugs",
    name: "Bugs",
    visibleFieldIds: ["title", "severity", "topic", "occurred_at", "resolved"],
    fieldOrder: ["title", "severity", "topic", "occurred_at", "resolved"],
    sorts: [{ fieldId: "occurred_at", direction: "desc" }],
    filters: [{ fieldId: "kind", operator: "is", value: "Bug" }]
  },
  {
    id: "view_emails",
    name: "Emails",
    visibleFieldIds: ["title", "severity", "topic", "occurred_at", "resolved"],
    fieldOrder: ["title", "severity", "topic", "occurred_at", "resolved"],
    sorts: [{ fieldId: "occurred_at", direction: "desc" }],
    filters: [{ fieldId: "kind", operator: "is", value: "Email" }]
  },
  {
    id: "view_billing",
    name: "Billing",
    visibleFieldIds: ["title", "kind", "severity", "occurred_at", "resolved"],
    fieldOrder: ["title", "kind", "severity", "occurred_at", "resolved"],
    sorts: [{ fieldId: "occurred_at", direction: "desc" }],
    filters: [{ fieldId: "topic", operator: "is", value: "Billing" }]
  },
  {
    id: "view_search",
    name: "Search",
    visibleFieldIds: ["title", "kind", "severity", "occurred_at", "resolved"],
    fieldOrder: ["title", "kind", "severity", "occurred_at", "resolved"],
    sorts: [{ fieldId: "occurred_at", direction: "desc" }],
    filters: [{ fieldId: "topic", operator: "is", value: "Search" }]
  },
  {
    id: "view_old_first",
    name: "Oldest first",
    visibleFieldIds: rsCompactFields,
    fieldOrder: rsCompactFields,
    sorts: [{ fieldId: "occurred_at", direction: "asc" }],
    filters: [],
    pageSize: defaultPageSize
  }
].map((view) => ({ pageSize: defaultPageSize, ...view, databaseId, type: "table" })); }

const rsConfigs = [
  { id: "db_rows_stress", name: "Rows Stress Lab", rowCount: 220, seed: 0xc0ffee2026, prefix: "row_rs", defaultPageSize: 50, compactPageSize: 25 },
  { id: "db_rows_2k", name: "Rows Stress Lab · 2K", rowCount: 2000, seed: 0xfeedface, prefix: "row_2k", defaultPageSize: 50, compactPageSize: 25 },
  { id: "db_rows_20k", name: "Rows Stress Lab · 20K", rowCount: 20000, seed: 0xb0a72026, prefix: "row_20k", defaultPageSize: 50, compactPageSize: 25 },
  { id: "db_rows_100k", name: "Rows Stress Lab · 100K", rowCount: 100000, seed: 0xd0d0face, prefix: "row_100k", defaultPageSize: 50, compactPageSize: 25 },
  { id: "db_rows_500k", name: "Rows Stress Lab · 500K", rowCount: 500000, seed: 0xface0001, prefix: "row_500k", defaultPageSize: 50, compactPageSize: 25 }
];

await writeDatabase({ id: "db_views_stress", schema: vsSchema, rows: vsRows, views: vsViews });
console.log(`Generated db_views_stress: ${vsRows.length} rows, ${vsViews.length} views`);

for (const config of rsConfigs) {
  const rows = buildRsRows(config.rowCount, config.seed, config.prefix);
  const schema = buildRsSchema(config.id, config.name);
  const views = buildRsViews(config.id, config.defaultPageSize, config.compactPageSize);
  await writeDatabase({ id: config.id, schema, rows, views });
  console.log(`Generated ${config.id}: ${rows.length} rows, ${views.length} views`);
}
