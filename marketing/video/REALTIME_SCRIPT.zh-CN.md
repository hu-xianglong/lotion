# Lotion vs Notion：实时操作版脚本

## 目标

- 成片时长：约 74 秒
- 画面：1920×1080，原生恒定 25fps，Lotion 英文界面
- 内容：真实操作，不使用静态截图模拟功能
- 数据：只使用每次录制前重置的 synthetic demo workspace
- 表述：对比 Notion 核心工作流，不宣称完整功能对等
- 字幕：画面使用简短英文字幕；本文件提供中文旁白稿

## 视觉规则

- 每一节先用 1 秒显示 `NOTION CORE` 和能力名称，然后立即进入 Lotion 实际操作。
- 鼠标只在必要时出现；键盘操作显示 `⌘K`、`/`、`Enter` 等短暂按键提示。
- 点击后保留 0.5–1 秒，让观众看清状态变化。
- 不使用私人 workspace、真实 Notion 导出或个人 Git 仓库。
- 不把“功能存在”当作演示；每项能力必须产生可见结果。

## 镜头表

| 时间 | 对比主题 | Lotion 实时操作 | 画面字幕 | 中文旁白 |
| --- | --- | --- | --- | --- |
| 00:00–00:03 | 开场 | Logo 由负空间 `L` 显现，切入已打开的 demo workspace。 | `Lotion vs Notion` / `Core workflows, different foundations.` | Notion 定义了现代工作区的核心体验。Lotion 在本地文件之上重新实现这些工作流。 |
| 00:03–00:15 | 页面与块 | 用 `⌘K` 打开 `Markdown Lab`；在空行输入 `/callout` 并插入 callout；输入一句文字；选中关键词并加粗、高亮；插入 toggle，随后收起再展开；拖动 callout 到 toggle 下方。 | `NOTION CORE  /  Blocks, slash menu, formatting, toggles, drag and drop` / `LOTION  /  Markdown underneath` | 页面仍然使用熟悉的 slash menu、块、格式、toggle 和拖拽。但保存下来的不是私有块数据库，而是 Markdown。 |
| 00:15–00:30 | 数据库与视图 | 打开 `Tasks`；新增一行 `Ship the first public release`；把 Status 改为 `In Progress`，Priority 改为 `High`，Tags 加上 `Product`；拖动列调整顺序；切换到 `Board` 并把卡片拖到 `Done`；快速切换 `Calendar` 再返回表格。 | `NOTION CORE  /  Properties, filters and multiple views` / `LOTION  /  The rows stay CSV` | Lotion 覆盖核心数据库工作流：属性、筛选、排序、公式、关系和多种视图。界面改变，底层 CSV 不变。 |
| 00:30–00:40 | 搜索与连接 | 按 `⌘K` 搜索 `formula`；打开 `Formula Lab`；展开 `Page details`；显示 backlinks；点击一条 backlink 跳转；返回后打开 History。 | `NOTION CORE  /  Search, links and backlinks` / `LOTION  /  Local index and page history` | 搜索、页面链接和 backlinks 让工作区保持连接。Lotion 在本地建立索引，并把页面历史连接到 Git。 |
| 00:40–00:52 | Notion 迁移 | 打开 Import；选择预先准备的 synthetic Notion HTML+CSV export；显示导入进度；打开 audit report；从报告进入一张导入页面，再打开对应数据库行。 | `FROM NOTION  /  HTML + CSV export` / `IN LOTION  /  Pages, databases, attachments and an audit trail` | Notion 导出的 HTML 和 CSV 可以导入为嵌套页面、数据库、行页面和附件。无法确定的转换不会被隐藏，而是进入审计报告。 |
| 00:52–01:02 | 数据所有权 | 回到刚编辑的页面并修改一句话；执行 `Edit source`，显示 Markdown；切到 Tasks 的 `Edit source`，显示 CSV；在终端插入镜头中运行 `git diff --stat`，随后回到 Lotion。 | `NOTION  /  Export for portability` / `LOTION  /  Readable files by default` | 两者最大的差异不在界面。Lotion 的 Markdown、CSV 和附件始终可以被普通工具读取、diff 和备份。 |
| 01:02–01:09 | 诚实的差距 | 暂停实际操作，使用简洁双栏文字；左侧列出 Notion 优势，右侧列出 Lotion 取舍。 | `NOTION IS AHEAD  /  Collaboration, comments, AI, broader views, mobile` / `LOTION IS DIFFERENT  /  Local-first, Git, open source, no account` | 这不是完整功能对等。Notion 在协作、评论、AI、更多视图和移动端仍然领先。Lotion 选择本地优先、开放格式和 Git。 |
| 01:09–01:14 | 收尾 | 回到 workspace 全景，缩小为 Logo；显示项目地址。 | `The core workspace experience. On files you own.` / `github.com/hu-xianglong/lotion` | 核心工作区体验，建立在你真正拥有的文件之上。 |

## 操作数据

录制前复制 `samples/demo-space` 到临时目录，并只对副本写入：

```text
Page: Markdown Lab
Callout: The workspace feels familiar. The files stay yours.
Toggle: What is stored underneath?
Toggle body: Plain Markdown that remains readable without Lotion.

Database: Tasks
New row: Ship the first public release
Status: In Progress -> Done
Priority: High
Tags: Product

Search term: formula
```

Notion 导入镜头必须使用仓库内的 synthetic fixture。导入结果至少包含：

- 一张嵌套页面
- 一个 CSV 数据库
- 一个数据库行页面
- 一张本地附件
- 一条 audit report 记录

## 自动录制方案

1. 运行构建并复制 demo workspace 到临时目录。
2. 使用 Playwright 驱动 Electron，所有点击优先使用稳定 selector，不使用绝对坐标。
3. 通过 Chromium screencast 捕获 Lotion renderer；只在展示 `git diff` 时切入单独录制的终端片段。
4. 每个章节独立录制，失败时只重录当前章节。
5. FFmpeg 统一裁切到 1920×1080，加入按键提示、章节标签和 6–8 帧交叉淡化。
6. 合成后自动抽取每章首、中、尾帧，检查空白、弹窗遮挡、私人数据和字幕裁切。

## 验收标准

- 页面、数据库、搜索、导入和源文件五段都包含真实状态变化。
- toggle 必须在镜头中完成一次收起和展开。
- Board 卡片必须完成一次跨列拖动并持久化。
- backlinks 必须由真实链接计算产生，不使用静态 mock。
- 导入镜头必须打开实际 audit report。
- Markdown 和 CSV 镜头必须来自本次操作后的临时 workspace。
- 视频不得出现 manual test workspace、用户名、Token、私人仓库或桌面通知。
- 结尾明确说明这是核心工作流覆盖，不是完整 Notion parity。
