# Lessons

Notes captured during development — concrete debugging episodes where the
fix is easy to write down once but the reasoning behind it is easy to
forget. Each entry is the kind of thing where, the second time it
happens, we want to remember the answer instead of rediscovering it.

## CSS — `max-height` does not establish a definite size for flex children

**Symptom.** Embedded views in pages rendered only their header
(database name + Open button). The table itself was invisible — no
rows, no spacer, no toolbar. The full-page database view (same
component, same data) rendered fine.

**Surface explanation.** When we added virtualization to support 500K
rows in the full-page view, `.table-scroll` got `flex: 1 1 0` so it
would claim the leftover vertical space inside `.database-table` and
scroll internally. To wrap an embedded view in a bounded box, we then
set on `.embedded-view` something like:

```css
.embedded-view { display: flex; flex-direction: column; max-height: 520px; }
.embedded-table { flex: 1 1 0; min-height: 0; }
```

The intuition was: "the embed is at most 520 px tall; the table fills
that space; virtualization handles the rest." Everything collapsed
to zero.

**Root cause.** `max-height` is a *cap*, not a *size*. It only takes
effect once an actual height is established. Flex distributes the
parent's main-axis size among children — and the parent's main-axis
size, when no explicit `height` is set, is determined by **the sum of
the children's intrinsic sizes**.

With `flex: 1 1 0`, `flex-basis: 0`. Each flex child claims a base
size of zero and is willing to grow if there's extra space. Their
intrinsic contribution is zero. The flex container's auto height
resolves to ~zero (just the non-flex children, like the header). The
`max-height: 520` never gets a chance to bite because the natural
size is already well below it. There's no "extra space" to grow
into, so `flex-grow: 1` distributes zero. Result: 0-px table.

In the full-page surface this isn't a problem because the outer
`.main-area` enforces a definite height (it inherits `height: 100%`
from the page chrome), so the flex container *does* have a real
main-axis size, and `flex: 1 1 0` children fill it correctly.

**Fix (it took two passes).**

First attempt — switch `.embedded-table` to `flex: 1 1 auto`. This
brought back the toolbar and the row-count footer (so the embed had
*some* height now), but the rows themselves were still missing. The
chrome was rendering at its natural height; the table-scroll between
them was still zero.

The reason: `.table-scroll` itself still had `flex: 1 1 0` from the
base rule (where the full-page surface needs it to claim leftover
flex space). With `flex-basis: 0`, `.table-scroll` reports a zero
content contribution to *its* parent (`.embedded-table`), so even
after `.embedded-table` flipped to `flex-basis: auto`, the natural
height it summed up was "header + 0 + footer + field-adder" — and
that's exactly what ended up on screen.

The bug was layered: the `auto` flex-basis only fixes the parent that
holds it; you also have to fix every flex item below it whose
intrinsic size needs to participate in the chain.

Second attempt — also override `.embedded-table .table-scroll` to
`flex: 1 1 auto`. Now `.table-scroll` reports its real content
height (rows × ROW_HEIGHT) to `.embedded-table`, which in turn reports
to `.embedded-view`. The whole chain sizes correctly, the embed
caps at `max-height: 520px` only when content actually exceeds it,
and virtualization works inside the bounded `.table-scroll`.

```css
.embedded-table {
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
}
.embedded-table .table-scroll {
  flex: 1 1 auto;   /* override the base `flex: 1 1 0` for this context */
}
```

**Takeaway.**

- `flex: 1 1 0` means "base size 0, grow into free space". It needs a
  parent with a *definite* main-axis size for the growth to mean
  anything. In a content-sized parent it contributes zero to the
  parent's intrinsic size and stays zero.
- `flex: 1 1 auto` means "base size from content, grow / shrink as
  needed". This works in containers that have only `max-height`, or
  where the parent sizes to its content.
- `max-height` without `height` does not magically promote the
  container to a definite height. It only constrains the natural
  size that flexbox would otherwise arrive at.
- A `flex-basis: auto` parent only helps if its flex children also
  contribute non-zero intrinsic sizes. Fixing the chain in one place
  is rarely enough — walk every flex level from the bounded ancestor
  down to the element whose height you actually care about.
- When the same React component renders in two layout contexts
  (full-page vs embedded), audit the height chain end-to-end for
  *both* contexts. The fix for one can quietly break the other if
  the constraints aren't symmetrical.

**How to spot this kind of bug next time.** Open devtools, inspect
the broken container, and look at its computed height. If it's 0 or
matches just the non-flex children's heights, the flex children are
not contributing intrinsic size — flip them to `flex-basis: auto` (or
give the parent an explicit `height`).

## React — 弹出层被祖先的 `overflow` 切掉

**症状。** 表格里的 select 单元格点开下拉菜单，菜单只露出一小部分,
下面被生硬地切了一刀。在整库视图里看似 OK, 一旦在页面里的嵌入视图
出现, 问题就立刻冒出来。

**根因。** `OptionDropdown` 的菜单是 `position: absolute`, 锚在它
自己的根 `<div class="option-dropdown">` 上。这个根又活在 `<td>` →
`<table>` → `.table-scroll` (`overflow: auto`) → `.embedded-view`
(`overflow: hidden; max-height: 520px`) 这条层级里。`position:
absolute` 找最近的"positioned"祖先做坐标系, 但只要某个祖先有
`overflow: hidden | auto | scroll`, 子元素超出那个盒子的部分**都会
被裁掉**, 与 z-index 无关。

整库视图能看到完整菜单是因为 `.main-area` 自己没 `overflow:
hidden`, 菜单从表格底下顺着出来仍在主区域内, 不会被裁。嵌入视图
两层 overflow 一夹, 菜单就只剩头部。

**修法。** 用 React Portal 把菜单渲染到 `document.body`, 配合
`position: fixed` 用 trigger 元素的 `getBoundingClientRect()` 算出
视口坐标。这样菜单脱离原本的 DOM 嵌套, 不再受任何 overflow 祖先
管辖。

```tsx
const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
const triggerRef = useRef<HTMLButtonElement>(null);

useLayoutEffect(() => {
  if (!isOpen) { setPos(null); return; }
  const rect = triggerRef.current?.getBoundingClientRect();
  if (rect) setPos({ top: rect.bottom + 4, left: rect.left });
}, [isOpen]);

const menu = isOpen && pos ? createPortal(
  <div ref={menuRef} style={{ position: "fixed", top: pos.top, left: pos.left }}>
    {/* ... */}
  </div>,
  document.body
) : null;
```

**配套要做的几件事。**

- **点击外部关闭的检测要同时看 trigger 区域和 portal 出来的菜单。**
  原来 `handleClick` 只检查 `rootRef.current?.contains(target)`, 现在
  菜单跑到 portal 外面去了, 点菜单本身会被当成"外部点击"误关。改成
  `!rootRef.current?.contains(target) && !menuRef.current?.contains(target)`
  才对。

- **滚动 / resize 时关闭菜单。** trigger 在虚拟化滚动里位置会变, 菜单
  停在固定坐标就会漂移。最简单是 `window.addEventListener("scroll", close, true)`
  (capture phase, 任何祖先滚都触发) + resize 关闭。要更花哨可以
  recompute, 但关闭对用户感受不差。

**何时需要 portal, 何时不需要。**

## CodeMirror 6 — 块装饰不能来自 ViewPlugin

**症状。** Markdown 编辑器加了 `Decoration.widget({ block: true })` 渲染图片和 iframe 之后, 编辑器整个挂掉, console 弹:

```
Uncaught RangeError: Block decorations may not be specified via plugins
  at Object.point (chunk-...:2788:21)
  at _RangeSet.spans (...)
  at TileUpdate.emit (...)
```

**根因。** CodeMirror 6 把装饰分两层来源:

- **ViewPlugin** (通过 `ViewPlugin.fromClass(..., { decorations: ... })` 提供) — 跑在**视图层**, 在每帧重绘前应用。便宜, 可以靠 viewport 局部更新。**只能放不影响行高的装饰** —— mark decorations、不改高度的 line decorations。
- **StateField** (通过 `EditorView.decorations.from(field)` 提供) — 是**编辑器状态**的一部分, 在视图层运行之前就已经定型。**必须用它**承载会影响行高的装饰: `block: true` 的 widget、改变行高 / padding 的 line decorations。

为什么这么分: 块装饰会改变文档的几何尺寸 (一行因为下方多了个 image widget 而占两行高度等)。视图层用这个几何信息算滚动条、行号、虚拟化窗口。所以**必须先有几何再有视图**, 顺序反了就拒绝。

ViewPlugin 注册块装饰时, CodeMirror 在 `RangeSet.spans` 里识别出 `block: true` 的装饰, 直接抛 RangeError — 这是一道硬护栏, 不是 bug。

**修法。** 把装饰按"是否影响行高"拆两半:

```ts
// 1) 内联标记 (mark) → ViewPlugin, 视口级更新, 便宜
const inlinePlugin = ViewPlugin.fromClass(InlineDecorations, {
  decorations: (v) => v.decorations
});

// 2) 行 + 块 widget → StateField, 编辑器状态级
const blockField = StateField.define<DecorationSet>({
  create: (state) => buildBlocks(state),
  update: (value, tr) => tr.docChanged ? buildBlocks(tr.state) : value,
  provide: (f) => EditorView.decorations.from(f)
});

export const markdownDecorations: Extension = [inlinePlugin, blockField, theme];
```

`buildBlocks(state)` 用 `syntaxTree(state)` 遍历整棵树 (不能只遍历 visible ranges, 因为状态级装饰必须覆盖全文档), 收集 line decorations 和 block widget decorations, `Decoration.set(ranges, true)` 返回。

**关于"行装饰算不算块装饰"的边界。** 严格意义上, line decoration 不是 block decoration —— CM6 不会因为一个 line deco 出现在 ViewPlugin 而崩。但**改高度** (`padding`、`min-height`) 的 line decoration 仍然影响几何, **建议**统一放进 StateField, 跟它的真朋友 (block widgets) 一块儿。不然万一某天你的 padding 变成了显著值, 又得在两个地方调试。

**判断标准 (每次加新装饰时问自己)。**

- 这装饰会让某一行的视觉高度变化吗? → StateField。
- 它的位置是 `block: true` 的 widget? → StateField。
- 纯改文字颜色 / 字重 / 背景 / 下划线, 不动盒模型? → ViewPlugin (省更新成本)。

不确定就先放 StateField, 性能损失通常小, 比看到 `RangeError` 强。

**如何下次提前发现。** 添加任何带 `block: true` 或 `Decoration.line({ padding: ... })` 的装饰时, 先扫一眼它的来源是 plugin 还是 field。Plugin 不放 block widget, 不放改 padding 的 line deco —— 这两条是规则, 不是品味。

**何时需要 portal, 何时不需要。**

- 内容只可能出现在自己父盒子内部 → 不需要 portal, 普通 `absolute`
  就够。
- 内容可能溢出某个 `overflow:hidden / auto` 祖先 → **必须** portal
  (或者用 `position: fixed` + 视口坐标, 在没有 transform / filter
  / will-change 祖先创建 containing block 的前提下)。

任何"飘出来"的 UI 都要先想一下: 它现在被多少层 overflow 包着?
下拉菜单 / tooltip / 弹窗 / popover / context menu 全是这一类。
Lotion 的 `FieldSettingsDialog` 和 `ViewSettingsDialog` 已经走的
是全屏 `.dialog-backdrop` 居中 (`position: fixed`) 模式, 天然
不会有这问题; 真正容易踩坑的是这种"贴着 trigger" 的轻量弹层。

**如何下次提前发现。** 任何渲染在 cell 里、需要"飘出去"的 UI, 默
认就用 portal。代码审查时只要看到 `.option-menu` 这类紧贴 trigger
的小弹层是普通 absolute, 就要问一句"这玩意儿会不会在嵌入视图里被
切?"

## Markdown — 同一份解析逻辑被两个文件各写一遍

**症状。** 测试页里有两张图, 第一张 `![alt](url)` 正常渲染成 `<img>`,
第二张 `![alt](url "hover title")` 在编辑器里完全不渲染 (依然显示
raw markdown 源码), 但右侧预览面板里两张都正常显示。

**根因。** 项目里有两个文件各自实现了一份 Markdown image 的解析:

- `src/renderer/lib/markdown.ts` — 给预览面板用,
  regex 是 `/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g`,
  支持可选 title 段。
- `src/renderer/features/pages/markdown-decorations.ts` — 给 CM
  编辑器里的 block widget 用, regex 是
  `/^!\[([^\]]*)\]\(([^)\s]+)\)$/`, **忘了 title**。

两条 regex 互相不知道对方存在, 谁加 feature 谁顺手写一条。预览那边
早期就把 title 加进去了, CM 装饰这条一直没补 —— 结果一种正常一种不
正常, 第二张图静默挂掉。

**修法不是补 regex, 是干掉一条。** Lezer-Markdown 的语法树已经把
Image 节点拆好了:

- `URL` 子节点 → 直接 `node.node.getChild("URL")` 拿到 URL 范围,
  title / 转义 / 嵌套 corner case Lezer 都解过了。
- alt 在第一个 `LinkMark "["` 和第二个 `LinkMark "]"` 之间, 用
  `getChildren("LinkMark")` 取边界 sliceString 即可。

也就是说在 CM 这条路径上, 我们其实**根本不需要 regex** —— 它就在
syntaxTree 里。当时写 regex 是图快, 结果"快"省下来的时间被 title
bug 重新还回去了, 还多搭一份 docs/lessons 进来。

**判断标准 (写 markdown 相关代码时)。**

- 输入已经经过 `markdown()` extension, 你能拿到 syntaxTree?
  → 用 `node.getChild(...)` / `node.getChildren(...)`, **不写 regex**。
- 输入是裸字符串 (preview 渲染、CSV cell 里的内嵌格式) 没有现成
  parse tree? → 不得不写 regex, 那就**抽到 `lib/markdown` 共享**,
  别两个文件各写一份。
- 看到任何一个文件自己重新写 image / link / heading / fence 的
  regex 时, 当作"潜在漂移源"对待 —— 它一定会和别的地方不一致。

**如何下次提前发现。** Code review 时碰到正则匹配 `!\[` `\[.*\]\(`
``\`\`\``` 这种 markdown syntax token 的字面量, 第一反应是"这能不能
从 Lezer 拿"; 第二反应是"别处是不是已经写过一份"。同一种 token
的 regex 在仓库里出现两次以上, 几乎一定其中一个落后了。

## 跨系统桥接 — 别在下游层用低分辨率信号反推上游意图

**症状。** Vim mode 下, `gg` (跳到文档首) 和 `G` (跳到文档尾) 不会
真的跳到首/尾, 而是停在路径上**第一个** `lotion-view` widget 那一
行。`5j`、PageDown、`/search`、鼠标点远处行也都中招。但单步 `j` /
`k` 经过 widget 时行为是对的 (落到 widget 行起点 / 末尾, 源码展开)。

**起因。** 之前为了让 `j` / `k` 能"进入"折叠的 image / iframe /
lotion-view widget, 加了一个 `EditorState.transactionFilter`:

```ts
// 旧逻辑
if (Math.abs(nextLine - prevLine) >= 2) {
  // 中间有 widget 行 → 把 cursor 重定向到 widget 边界
}
```

写的时候只想着 j/k —— "单步被 widget 弹过 ≥ 2 行就是 j/k"。但
CM6 在 transactionFilter 层只看到一件事: `{ selection: { anchor:
X } }`, 没有按键身份。所有可能产生 selection 跳跃的来源 —— j、k、
gg、G、PageDown、`/`、`{`、`}`、`5j`、鼠标点击 —— 在 filter 这里
**全长一个样**。filter 当 j 处理, 等于把所有大跳都拦腰拽到 widget
上。

**根因。** 错的不是 filter 本身, 是"在下游层用低分辨率信号反推上
游意图"这个方法。按键经过 Vim plugin → CM command → transaction,
按键身份在第一道就被抹平了。等 transaction 到 filter 时, 上游意
图已经是灰烬, 你再去**从下游推上游**, 推不出来。

**正确思路: 别猜意图, 只在情况无歧义时介入。** 把"我该不该 redirect"
重新定义成"几何上唯一对应 j/k 单步被弹过 widget 的情形":

- prev 行的**直接下一行 / 上一行**是 widget;
- next 落点正好是 widget 末尾 + 1 (或 widget 起点 − 1)。

只有 j/k 一步移动会在这种几何位置停下来。gg 跳到第 1 行, next
是 1, 远小于路径上 widget 起点 - 1 → filter 撒手, CM 默认行为
(穿过 widget) 接管。PageDown 跳 20 行也一样, 不接。

```ts
// 新逻辑
if (dir > 0) {
  if (!lines.has(prevLine + 1)) return tr;
  const groupEnd = lastLine.get(prevLine + 1)!;
  if (nextLine > groupEnd + 1) return tr;  // 大跳, 放行
  // 否则: redirect 到 widget 起点
}
```

**判断标准。** 任何"我要在 transaction / event / DOM 事件层拦截
并改写"的代码, 先问自己:

- 这个层看得到上游意图吗? 还是只看得到结果?
- 如果只看得到结果, 我设计的判定条件**几何上是否唯一**指向我想
  处理的那种情况? 还是只是**统计上常见**?
- "abs(delta) >= 2" 这种"足够大的差异"是统计常见, 不是几何唯一
  —— 不要用。

**类似的坑长什么样。**

- 在 React `onChange` 里靠 `value.length === old.length + 1` 判断
  "用户敲了一个字" → 中文输入法、粘贴、撤销全都会撞。
- 在 `mousemove` 里靠"deltaX > 0" 判断"用户在拖" → 触控板惯性
  滚动、抖动都会触发。
- 在 transaction filter 里靠"docChanged" 加 "某区域文本变了" 判
  断"用户编辑了 widget" → 程序化 dispatch、外部同步全都误伤。

**如何下次提前发现。** 写跨层过滤时, 先列出**所有**能产生当前
信号的上游路径, 再看自己的判定条件能否在每条路径上给出对的答
案。如果不能, 要么收窄判定 (找几何唯一的特征), 要么放弃在这层
拦, 把逻辑挪到能看到原始意图的那一层 (比如 Vim 命令本身, 或者
keymap 自定义)。

## 半成品装饰 — 加 class 没加 CSS, 或者用错了装饰类型

**症状。** Markdown 编辑器里 `---` (horizontal rule) 一直显示成蓝
色带下划线的 `---` 文字, 没有渲染成一条灰色横线。其它 block 视
觉 (image、iframe、table、lotion-view) 都正常工作。

**第一层问题: 一对配套的东西只写了一半。**

`lineDecorations` 表里给 `HorizontalRule` 配了 class `cm-md-line-hr`:

```ts
const lineDecorations = {
  ATXHeading1: lineDeco("cm-md-line-h1"),
  // ...
  HorizontalRule: lineDeco("cm-md-line-hr")  // ← class 加上了
};
```

但 theme 里**只**写了 h1-h6、blockquote、code 的 CSS, **忘了**写
`cm-md-line-hr` 那条。class 被加到 `<div class="cm-line ...">` 上,
CSS 找不到匹配规则, 视觉上完全没变化。

**这是 silent dead end。**

- TypeScript 不会管字符串里的 class 名是否在 CSS 里有定义。
- CSS 不存在的 class 不会报错, 只会"什么都不发生"。
- 唯一发现的方式是"打开页面看, 哎怎么没效果"。

类似的成对 / 配套结构, 写少一半都会进同样的洞:

- i18n key 定义了, 但 EN / ZH translations 里只填了一半语言。
- API 添加了字段, frontend type 加了, backend serializer 忘了。
- 注册了某个事件 listener, 忘了在 cleanup 里 remove。

**第二层问题: 工具选错了。**

更深的事: 即便我当时补上了 `cm-md-line-hr` 的 CSS, 这个方案**仍
然是错的**。

`---` 这三个字符是文档内容。`Decoration.line` 给行加 class, 只能
调样式 (border、background、字号), **没法替换文本可见性**。要让
`---` 在视觉上变成一条横线, 要么:

- 给行配 `color: transparent` + `border-top` —— 字符还在,
  只是看不见。属于"伪装", 容易在 selection、search highlight 等
  地方露馅。
- 用 `Decoration.replace({ widget, block: true })` 直接把整行替
  换成 `<hr>` widget —— cursor 不在该行时 widget 显示, cursor 进
  入时撤销, 自动回退到 raw 源码。

后者就是 image / iframe / table / lotion-view 用的模式。我当时
"图省事"给 hr 选了 line class 路线, 跟同类装饰**方案不一致**。
即便没忘 CSS, 这条路线也不会比 widget 好。

**判断标准 (加新装饰时问自己)。**

- 我想做的视觉变化能用纯 CSS 表达吗 (改字号 / 颜色 / 边框 / 背
  景)? → `Decoration.line({ class })` 或 `Decoration.mark({ class })`,
  **加 class 同一个 commit 内一定要把 CSS 也加上**。
- 我想做的视觉变化是"换 DOM 节点" (换成 `<hr>` / `<table>` /
  `<input>` / `<img>`)? → `Decoration.replace({ widget })`, 不要
  考虑 line class。

不确定的时候, 看仓库里同类型的视觉是怎么处理的, 跟齐。Image /
iframe / table 都是 widget, 那 hr 也应该是 widget。

**如何下次提前发现。**

- 加任何一条 `lineDeco("class-name")` / `markDeco("class-name")` 时,
  **立刻** grep `class-name` 在 theme 里有没有对应规则; 没有就当
  下补上, 不要留 TODO。
- Code review 时看到新增的 class 名, 第一反应是"theme 里有这条
  CSS 吗"; 第二反应是"这个特性应不应该用 widget"。如果该特性是
  "换一个 DOM 节点", widget 永远是更对路的工具。

## CodeMirror 6 — 点击解析 DOM 优先于坐标, 注意边界 + 注册顺序

**症状。** 编辑器里的 markdown 内部链接 `[text](system/pages/db_pages/<title>--pg_X.md)`
本来点击能跳转。后来:

- 有时点上去**完全没反应** (handler 跑了但 `resolveInner` 找不到
  Link 节点);
- 有时点 A 链接, 却跳到了 **B 链接的目标页面**。

控制台里 `[lotion] link mousedown {target: ..., hit: true}` 触发,
但接下来要么 `bailed: no Link in syntax tree`, 要么 `link click
{url: 'B 的 URL', kind: 'internal-md'}` ——位置算错了。

**根因。** 三个独立但叠加的 CodeMirror 6 行为:

1. **坐标 → 位置不可靠。** 我们用 `view.posAtCoords({ x, y })` 把
   鼠标坐标变成文档位置。但一旦改全局 CSS (这次是 `:root` 的
   `font-size: 14px` + `line-height: 1.5`), CM 在某些时刻还按旧
   metrics 算行高, 返回的位置就**整行偏了**。点 A 链接得到 B 链
   接所在行的位置 → 跳错页面。

2. **`resolveInner(pos, side)` 在边界上偏向某一侧。** 链接末尾我
   们挂了个 trailing icon widget (`Decoration.widget({side: 1})`),
   widget 视觉上在链接后面, 位置上正好等于 `Link.to`。点 icon 时
   `pos === Link.to`, 用 `resolveInner(pos, 1)` 走右侧 → 拿到的是
   Link 之后的 sibling 节点, 不是 Link 本身。代码里
   `while (node.name !== "Link" && node.parent)` 一路往上走到根
   节点都找不到 → 报 "no Link"。

3. **`EditorView.domEventHandlers` 按注册顺序生效。** 第一个返回
   true 的 handler 消费事件, 后面的不再触发。Vim 扩展自己也注册
   了 mousedown handler。把我们的 link interceptor 放在 vim 之后
   注册, vim 先看到 mousedown, 有时直接返回 true → 我们的 handler
   根本没机会跑。Vim mode 关掉时表面上看是好的, 其实只是少了 vim
   这道拦截, 上面 (1)(2) 还在以低概率背景出 bug。

**修法。**

- **`view.posAtDOM(linkEl)` 优先于 `posAtCoords`。** 我们在
  `mousedown` 里已经通过 `target.closest(".cm-md-link, .cm-md-url,
  .cm-md-link-icon")` 拿到了具体被点的 DOM 元素 —— 那就是 ground
  truth。直接问 CM "这个 DOM 在 doc 里哪个位置", 不去算坐标:

  ```ts
  let pos: number | null = null;
  try { pos = view.posAtDOM(linkEl); }
  catch { pos = view.posAtCoords({ x: event.clientX, y: event.clientY }); }
  ```

- **`resolveInner` 试两侧。** 先 side: -1 (看左边节点 → 拿到 Link),
  没找到再 side: 1:

  ```ts
  let node = tree.resolveInner(pos, -1);
  while (node.name !== "Link" && node.parent) node = node.parent;
  if (node.name !== "Link") {
    node = tree.resolveInner(pos, 1);
    while (node.name !== "Link" && node.parent) node = node.parent;
  }
  ```

- **link interceptor 注册在 vim 之前**。CM6 的
  `EditorView.domEventHandlers` 按 extensions 数组顺序处理事件,
  自己要的优先级高就放前面。我们的 mousedown handler 现在是
  extensions 数组的第一项, vim compartment 紧跟其后。

**判断标准 (CM6 一族问题)。**

- 凡是有 DOM 元素能拿到的事件 (mousedown、click、context-menu),
  **能用 DOM API 就别用坐标**: `posAtDOM(el)` > `posAtCoords({x,y})`。
  坐标对 CSS、缩放、retina 都敏感。
- 用 `resolveInner` 找语法节点时, 默认 side: 0 在节点边界上不可
  靠 —— 写代码时**显式想清楚 pos 是不是可能落在边界**, 边界就两侧
  都试。
- 写新 `EditorView.domEventHandlers` 前, 先看仓库里已经注册了哪
  些类似 handler (vim、search、自家的)。需要优先级就放在 extension
  数组前面; 不需要就保留在后面让别人先看。

**如何下次提前发现。** 加日志去看 handler 跑没跑、跑到哪一步 —
就是我这次定位用的招数 (`console.log({target, hit, pos, kind, url})`)。
没日志全靠猜的话, "点不动" 这种无声 bug 永远定位不到。CM6 还有
个反向暗坑: `EditorView.updateListener` / `domEventHandlers` 默
认是**静默**的, 没异常没警告 —— 不主动 print 永远不知道触发了几次、
走到哪一行。

## CodeMirror 6 — block widget 垂直间距用 padding 不用 margin, 异步内容挂 ResizeObserver

**症状。** Markdown editor 里, 点击 "Internal page links" 段落里
任意位置, cursor 不落在点击的字符, 而是**飘到下面 1-2 行**。每多
经过一个图片 / 分割线 / 表格 / lotion-view widget, 飘得越多。在
没有 widget 的段落里完全正常。

**根因。** CM6 的 `posAtCoords` 把鼠标 y 坐标除以 "每行有多高"
反推出文档位置。它怎么知道每个 block widget 有多高? 调用 widget
DOM 的 `getBoundingClientRect().height`。

两个独立坑叠在一起:

1. **`getBoundingClientRect` 不算 margin。** 我们给 image / iframe
   / hr / table / lotion-view widget 习惯性写了 `margin: 8px 24px`
   或 `margin: 12px 0` 来留白。视觉上对, 但 getBCR 返回的是
   border-box, **margin 那部分根本没在 height 里**。CM 看到的是
   "widget 占 X px", 实际渲染要 X + 16px。每多一个 widget, CM 就
   少算 ~16px ≈ 半到一行。

2. **图片 / iframe / React portal 是异步的。** `toDOM` 返回时
   `<img>` 还没下载完, getBCR 拿到的是占位高度 (≈20px), 不是
   最终 ~360px。CM 把这个错的值塞进 heightMap, 后面再也不主动
   重测。等图片真加载完, 视觉上 widget 撑大了, CM 仍按 20px 在
   算 — 鼠标点哪儿都飘。

**修法。**

**(a) 一切垂直间距用 padding, 一切水平间距才用 margin。**

```css
/* 错: 视觉对了, CM 算错了 */
.cm-md-image-widget { margin: 8px 24px; }
.cm-md-hr-widget   { margin: 12px 0; border-top: 2px solid; }

/* 对: padding 上下、margin 左右 */
.cm-md-image-widget { margin: 0 24px; padding: 8px 0; }
.cm-md-hr-widget-wrap { padding: 12px 0; }
.cm-md-hr-widget   { margin: 0; border-top: 2px solid; }
```

如果元素本身已经有 `border` / `background` (像 iframe widget),
直接在它上面加 padding 会让 border 跟内容拉开难看的空隙 —— 这
时候**包一层 wrapper**, 让 wrapper 拿垂直 padding, 内层保留
border / bg。HrWidget 就是这种 wrapper 模式。

**(b) 异步内容挂 ResizeObserver, 尺寸变化就喊 `view.requestMeasure()`。**

```ts
function attachRemeasureObserver(dom: HTMLElement, view: EditorView) {
  const ro = new ResizeObserver(() => view.requestMeasure());
  ro.observe(dom);
  (dom as any)._ro = ro;
}

class ImageWidget extends WidgetType {
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    /* ... img ... */
    attachRemeasureObserver(wrap, view);  // ← 关键
    return wrap;
  }
  destroy(dom: HTMLElement) {
    (dom as any)._ro?.disconnect();
  }
}
```

ResizeObserver 在元素被插入 DOM 后会**至少 fire 一次** (初始
layout), 之后每次尺寸变化再 fire。一次 callback 触发
`view.requestMeasure()`, CM 重新走一遍 heightMap, posAtCoords
立刻准了。

只用 img.onload / iframe.onload 不够 — React portal、web 字体
加载、windows resize 都可能改尺寸但不触发那些事件。
ResizeObserver 是统一兜底。

**判断标准 (每写一个 block widget 时)。**

- 视觉上 widget 跟前后行之间有空白吗? → 上下 **padding**, 别用
  margin。
- widget 里有 `<img>` / `<iframe>` / 异步注入的内容? → 加
  `attachRemeasureObserver` (上面那个 helper)。
- widget 里只有同步 innerHTML (像 table widget 那种 markdown-it
  渲染)? → 严格说 ResizeObserver 不必, 但**加上不亏** (window
  resize / 字体加载等边界情况也覆盖)。

**如何下次提前发现。** Bug 表现是无声的"点击位置飘", 没异常没
警告。报告问题的关键线索: "有 widget 的段落飘, 没 widget 的段
落正常" — 当听到这种相关性, 第一反应去查 widget 的 height 报告
对不对 (DevTools 里看 getBCR 的实际值 vs 视觉占的空间)。如果差
一个 margin 数 = 中了第一坑; 如果差很多 = 异步内容没等加载完 =
中了第二坑。
