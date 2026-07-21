import assert from "node:assert/strict";
import {
  applySlashCommandTemplate,
  BASE_SLASH_COMMANDS,
  createChildPageInput,
  createDatabaseSlashCommands,
  createPageSlashCommands,
  filterSlashCommands
} from "../dist-electron/shared/slash-commands.js";

const byId = new Map(BASE_SLASH_COMMANDS.map((command) => [command.id, command]));

{
  assert.equal(filterSlashCommands(BASE_SLASH_COMMANDS, "page")[0]?.id, "new-page");
  assert.equal(filterSlashCommands(BASE_SLASH_COMMANDS, "页面")[0]?.id, "new-page");
  assert.equal(filterSlashCommands(BASE_SLASH_COMMANDS, "new page")[0]?.id, "new-page");
  assert.equal(filterSlashCommands(BASE_SLASH_COMMANDS, "新页面")[0]?.id, "new-page");
  assert.equal(filterSlashCommands(BASE_SLASH_COMMANDS, "子页面")[0]?.id, "new-page");
  assert.equal(filterSlashCommands(BASE_SLASH_COMMANDS, "创建页面")[0]?.id, "new-page");
}

{
  assert.deepEqual(
    createChildPageInput({
      id: "pg_parent",
      kind: "page",
      title: "Parent",
      path: ["Projects", "Parent"]
    }, "Child"),
    {
      title: "Child",
      parentId: "pg_parent",
      parentKind: "page",
      path: ["Projects", "Parent", "Child"]
    }
  );
  assert.deepEqual(
    createChildPageInput({ id: "row_parent", kind: "row", title: "Record" }, "子页面"),
    {
      title: "子页面",
      parentId: "row_parent",
      parentKind: "row",
      path: ["Record", "子页面"]
    }
  );
}

for (const command of BASE_SLASH_COMMANDS) {
  const visibleHint = command.hint.trim();
  if (!visibleHint) continue;
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, visibleHint);
  assert.equal(
    results[0]?.id,
    command.id,
    `visible slash hint "${visibleHint}" should resolve to ${command.id}`
  );
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "hea");
  assert.deepEqual(results.slice(0, 3).map((command) => command.id), ["h1", "h2", "h3"]);
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "标题");
  assert.equal(results[0]?.id, "h1");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "一级标题");
  assert.equal(results[0]?.id, "h1");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "大标题");
  assert.equal(results[0]?.id, "h1");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "二级标题");
  assert.equal(results[0]?.id, "h2");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "中标题");
  assert.equal(results[0]?.id, "h2");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "三级标题");
  assert.equal(results[0]?.id, "h3");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "小标题");
  assert.equal(results[0]?.id, "h3");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "待办");
  assert.equal(results[0]?.id, "todo");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "任务列表");
  assert.equal(results[0]?.id, "todo");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "复选框");
  assert.equal(results[0]?.id, "todo");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "列表");
  assert.equal(results[0]?.id, "bullet");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "无序列表");
  assert.equal(results[0]?.id, "bullet");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "项目列表");
  assert.equal(results[0]?.id, "bullet");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "有序列表");
  assert.equal(results[0]?.id, "numbered");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "编号列表");
  assert.equal(results[0]?.id, "numbered");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "文本");
  assert.equal(results[0]?.id, "text");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "正文");
  assert.equal(results[0]?.id, "text");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "普通文本");
  assert.equal(results[0]?.id, "text");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "任务");
  assert.equal(results[0]?.id, "todo");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "引用");
  assert.equal(results[0]?.id, "quote");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "代码");
  assert.equal(results[0]?.id, "code");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "代码块");
  assert.equal(results[0]?.id, "code");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "分割");
  assert.equal(results[0]?.id, "divider");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "分割线");
  assert.equal(results[0]?.id, "divider");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "提示");
  assert.equal(results[0]?.id, "callout");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "标注");
  assert.equal(results[0]?.id, "callout");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "强调块");
  assert.equal(results[0]?.id, "callout");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "toggle");
  assert.equal(results[0]?.id, "toggle");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "折叠块");
  assert.equal(results[0]?.id, "toggle");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "equation");
  assert.equal(results[0]?.id, "equation");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "公式");
  assert.equal(results[0]?.id, "equation");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "数学公式");
  assert.equal(results[0]?.id, "equation");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "embed");
  assert.equal(results[0]?.id, "embed");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "嵌入");
  assert.equal(results[0]?.id, "embed");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "网页");
  assert.equal(results[0]?.id, "embed");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "网页嵌入");
  assert.equal(results[0]?.id, "embed");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "嵌入网页");
  assert.equal(results[0]?.id, "embed");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "表格");
  assert.equal(results[0]?.id, "table");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "Markdown 表格");
  assert.equal(results[0]?.id, "table");
}

{
  const commands = createDatabaseSlashCommands([{ id: "db_rows", name: "Rows", path: ["Fixture"] }]);
  const results = filterSlashCommands(commands, "数据库");
  assert.equal(results[0]?.id, "database:db_rows");
}

{
  const commands = createDatabaseSlashCommands([{ id: "db_rows", name: "Rows", path: ["Fixture"] }]);
  const results = filterSlashCommands(commands, "db");
  assert.equal(results[0]?.id, "database:db_rows");
}

{
  const commands = createDatabaseSlashCommands([{ id: "db_rows", name: "Rows", path: ["Fixture"] }]);
  const results = filterSlashCommands(commands, "database");
  assert.equal(results[0]?.id, "database:db_rows");
}

{
  const commands = createDatabaseSlashCommands([{ id: "db_rows", name: "Rows", path: ["Fixture"] }]);
  const results = filterSlashCommands(commands, "view");
  assert.equal(results[0]?.id, "database:db_rows");
}

{
  const commands = createDatabaseSlashCommands([{ id: "db_rows", name: "Rows", path: ["Fixture"] }]);
  const results = filterSlashCommands(commands, "视图");
  assert.equal(results[0]?.id, "database:db_rows");
}

{
  const commands = createPageSlashCommands([{ id: "pg_target", title: "Target Page", path: ["Fixture"] }]);
  const results = filterSlashCommands(commands, "页面");
  assert.equal(results[0]?.id, "page:pg_target");
}

{
  const commands = createPageSlashCommands([{ id: "pg_target", title: "Target Page", path: ["Fixture"] }]);
  const results = filterSlashCommands(commands, "page");
  assert.equal(results[0]?.id, "page:pg_target");
}

{
  const commands = createPageSlashCommands([{ id: "pg_target", title: "Target Page", path: ["Fixture"] }]);
  const results = filterSlashCommands(commands, "链接");
  assert.equal(results[0]?.id, "page:pg_target");
}

{
  assert.equal(byId.get("link")?.hint, "网址");
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "网址");
  assert.equal(results[0]?.id, "link");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "url");
  assert.equal(results[0]?.id, "link");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "高亮");
  assert.equal(results[0]?.id, "highlight");
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "yellow");
  assert.equal(results[0]?.id, "highlight");
}

{
  const doc = "Intro\n  /h1";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: 6,
    slashFrom: 8,
    slashTo: doc.length,
    command: byId.get("h1")
  });
  assert.equal(doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to), "Intro\n# ");
  assert.equal(edit.cursor, "Intro\n# ".length);
}

{
  const doc = "Before\n/text";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n".length,
    slashFrom: "Before\n".length,
    slashTo: doc.length,
    command: byId.get("text")
  });
  assert.equal(doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to), "Before\n");
  assert.equal(edit.cursor, "Before\n".length);
}

{
  const doc = "Read /link now";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: 0,
    slashFrom: 5,
    slashTo: 10,
    command: byId.get("link")
  });
  assert.equal(doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to), "Read [](https://) now");
  assert.equal(edit.cursor, "Read [".length);
}

{
  const doc = "Image: /image";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: 0,
    slashFrom: "Image: ".length,
    slashTo: doc.length,
    command: byId.get("image")
  });
  assert.equal(doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to), "Image: ![](attachments/)");
  assert.equal(edit.cursor, "Image: ![".length);
}

{
  const doc = "Before\n/divider";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n".length,
    slashFrom: "Before\n".length,
    slashTo: doc.length,
    command: byId.get("divider")
  });
  assert.equal(doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to), "Before\n\n---\n");
  assert.equal(edit.cursor, "Before\n\n---\n".length);
}

{
  const doc = "Before\n\n/divider";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n\n".length,
    slashFrom: "Before\n\n".length,
    slashTo: doc.length,
    command: byId.get("divider")
  });
  assert.equal(doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to), "Before\n\n---\n");
  assert.equal(edit.cursor, "Before\n\n---\n".length);
}

{
  const doc = "Before\n/callout";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n".length,
    slashFrom: "Before\n".length,
    slashTo: doc.length,
    command: byId.get("callout")
  });
  const nextDoc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  assert.equal(nextDoc, "Before\n```lotion-callout\nicon: 💡\n---\n\n```\n");
  assert.equal(edit.cursor, "Before\n```lotion-callout\nicon: 💡\n---\n".length);
}

{
  const doc = "Before\n/toggle";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n".length,
    slashFrom: "Before\n".length,
    slashTo: doc.length,
    command: byId.get("toggle")
  });
  const nextDoc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  const expected = "Before\n```lotion-toggle\nsummary: \nopen: true\n---\n\n```\n";
  assert.equal(nextDoc, expected);
  assert.equal(edit.cursor, "Before\n```lotion-toggle\nsummary: ".length);
}

{
  const doc = "Before\n/equation";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n".length,
    slashFrom: "Before\n".length,
    slashTo: doc.length,
    command: byId.get("equation")
  });
  const nextDoc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  const expected = "Before\n```lotion-equation\n\n```\n";
  assert.equal(nextDoc, expected);
  assert.equal(edit.cursor, "Before\n```lotion-equation\n".length);
}

{
  const doc = "Before\n/embed";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n".length,
    slashFrom: "Before\n".length,
    slashTo: doc.length,
    command: byId.get("embed")
  });
  const nextDoc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  const expected = "Before\n```lotion-iframe\nurl: \nheight: 320\ntitle: Embed\n```\n";
  assert.equal(nextDoc, expected);
  assert.equal(edit.cursor, "Before\n```lotion-iframe\nurl: ".length);
}

{
  const doc = "Before\n/code";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n".length,
    slashFrom: "Before\n".length,
    slashTo: doc.length,
    command: byId.get("code")
  });
  const nextDoc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  assert.equal(nextDoc, "Before\n```\n\n```\n");
  assert.equal(edit.cursor, "Before\n```\n".length);
}

{
  const doc = "Before\n/bullet";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n".length,
    slashFrom: "Before\n".length,
    slashTo: doc.length,
    command: byId.get("bullet")
  });
  const nextDoc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  assert.equal(nextDoc, "Before\n- ");
  assert.equal(edit.cursor, "Before\n- ".length);
}

{
  const doc = "Before\n/numbered";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n".length,
    slashFrom: "Before\n".length,
    slashTo: doc.length,
    command: byId.get("numbered")
  });
  const nextDoc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  assert.equal(nextDoc, "Before\n1. ");
  assert.equal(edit.cursor, "Before\n1. ".length);
}

{
  const doc = "Before\n/table";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n".length,
    slashFrom: "Before\n".length,
    slashTo: doc.length,
    command: byId.get("table")
  });
  const nextDoc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  const expected = "Before\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n";
  assert.equal(nextDoc, expected);
  assert.equal(edit.cursor, expected.length);
}

{
  const doc = "Important /highlight";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: 0,
    slashFrom: "Important ".length,
    slashTo: doc.length,
    command: byId.get("highlight")
  });
  const nextDoc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  assert.equal(nextDoc, "Important <span data-lotion-bg=\"yellow\"></span>");
  assert.equal(edit.cursor, "Important <span data-lotion-bg=\"yellow\">".length);
}

{
  const results = filterSlashCommands(BASE_SLASH_COMMANDS, "目录");
  assert.equal(results[0]?.id, "toc");
}

{
  const doc = "Before\n/toc";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n".length,
    slashFrom: "Before\n".length,
    slashTo: doc.length,
    command: byId.get("toc")
  });
  const nextDoc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  assert.equal(nextDoc, "Before\n```lotion-toc\n```\n");
  assert.equal(edit.cursor, nextDoc.length);
}

{
  const doc = "Before\n/quote";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n".length,
    slashFrom: "Before\n".length,
    slashTo: doc.length,
    command: byId.get("quote")
  });
  const nextDoc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  assert.equal(nextDoc, "Before\n> ");
  assert.equal(edit.cursor, "Before\n> ".length);
}

{
  const [page] = createPageSlashCommands([{ id: "pg_home", title: "Home [A]", path: ["pages", "Home [A]"] }]);
  assert.equal(page.id, "page:pg_home");
  assert.equal(page.group, "Pages");
  assert.match(page.template, /\[Home \\\[A\\\]\]\(databases\/system\/pages--db_pages\/pages\/Home_\[A\]--pg_home\.md\)\|/);

  const doc = "Before\n/home";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n".length,
    slashFrom: "Before\n".length,
    slashTo: doc.length,
    command: page
  });
  const nextDoc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  assert.match(nextDoc, /^Before\n\[Home \\\[A\\\]\]\(databases\/system\/pages--db_pages\/pages\/Home_\[A\]--pg_home\.md\)$/);
  assert.equal(edit.cursor, nextDoc.length);
}

{
  const [database] = createDatabaseSlashCommands([{ id: "db_tasks", name: "Tasks", path: ["work", "Tasks"] }]);
  assert.equal(database.id, "database:db_tasks");
  assert.equal(database.group, "Databases");
  assert.equal(database.placement, "line");
  assert.match(database.template, /```lotion-view\n/);
  assert.match(database.template, /database: db_tasks\n/);

  const doc = "Before\n/tasks";
  const edit = applySlashCommandTemplate({
    doc,
    lineFrom: "Before\n".length,
    slashFrom: "Before\n".length,
    slashTo: doc.length,
    command: database
  });
  const nextDoc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  assert.equal(nextDoc, "Before\n```lotion-view\ndatabase: db_tasks\nview: view_default\n```\n");
  assert.equal(edit.cursor, nextDoc.length);
}

console.log("Slash command tests passed.");
