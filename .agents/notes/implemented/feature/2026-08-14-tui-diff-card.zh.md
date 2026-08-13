# Agent Note: TUI diff 卡片 —— 展开、overlay 与精确变更行

Status: implemented

[English](2026-08-14-tui-diff-card.md) | 中文

## 问题

`write`、`edit` 和 `str_replace_editor` 声明 `card: 'diff'`，载荷为 `FileDiff[]`（[render-intent union](../architecture/2026-07-02-tool-render-intent-union.md)）。Web 客户端已经在 [`DiffBlock`](../../../packages/client/ui-primitives/src/DiffBlock.tsx) 里绘制这些 hunk。已交付的 TUI 把同一视图映射成文件路径，因此一次 Editor 改动只剩标题、看不到变更。没有展开/折叠，也没有打开完整 diff 的入口。

## 决策

`@deepseek-ai/dsh-tui` 把 `card: 'diff'` 画成单栏卡片：每个 hunk 一个路径头，然后是 `+`/`-`/`  ` 行，最后是暗色 `└ +A -R · N file(s)` 页脚。两侧有界 LCS 完成时（`oldLen * newLen ≤ 12_000` 个单元格），新增/删除计数是精确变更行。更大的 hunk 回退为整段旧侧再整段新侧，并在页脚追加 ` ≈`。空文本是零行；结尾换行终止最后一行。去重路径计入文件数，与 [Web diff 卡片](2026-07-30-web-diff-card.md) 一致。diff 正文按卡片宽度截断而不折行，以保持缩进对齐。

折叠卡片用头尾切分显示 8 行正文，中间是 `… N more · ctrl+o expand · alt+o open`。Ctrl+O 切换最近一张工具卡片的展开/折叠。Alt+O 把最近一张 diff 卡片打开为全屏 overlay（`tui.showOverlay({ fullscreen: true })`），其鼠标跟踪让滚轮滚动；Escape / Ctrl+O / Alt+O 关闭。pi-tui 只在该全屏 overlay 上启用指针报告，主 transcript 保留原生选择。

## 考虑过的替代方案

**只画整侧行，像 Web `DiffBlock`。** 不予采纳，因为 `packages/fs/tool-fs/src/diff.ts` 的 result 时 hunk 已经在两侧带了三行上下文；LCS 把它们变成中性 `  ` 行并报告精确变更计数，Web 的 Agent Note 已把这记为 TUI 的职责。

**在主 transcript 上始终开启鼠标跟踪。** 不予采纳，因为 `@oh-my-pi/pi-tui` 只在全屏 overlay 占用备用屏幕时打开 SGR 鼠标报告。对整个会话启用会抢走原生选择和 scrollback。Alt+O 就是点击打开：overlay 才是指针表面。

**在路径上打开 `$EDITOR` 或 OSC 8 文件链接。** 不予采纳，因为缺的是看见已应用的改动，而不是写入后的文件。overlay 才是 diff。

**恢复已删除的 ui 组 TUI 渲染器。** 不予采纳，因为 [shipped-tui-profile](2026-08-13-shipped-tui-profile.md) 把终端作为新组合包重新引入；这次是在该组合包上绘制 `FileDiff`，而不是继承被移除的树。

## 后果

Editor 的 `str_replace` / `create`，以及 `write`/`edit`，会在卡片内显示改动。长 diff 保持 8 行预览，直到 Ctrl+O 或 Alt+O。overlay 是 TUI 上唯一接收鼠标滚轮事件的表面。call 时的 diff 对新建和覆盖仍是 `oldText: null`，因此这些卡片在 `presentResult` 用已应用 hunk 替换之前只有新增侧。

## 测试

`packages/bundle/tui/tests/diff.spec.ts` 钉住终止符规则、LCS 变更行、前导插入/删除、去重路径页脚、空 diffs、比较单元格回退，以及按 kind 上色。`tools.spec.ts` 钉住 `linesForCall`/`linesForResult` 正文、折叠/展开的 diff 卡片和 `diffView`。`diff-overlay.spec.ts` 钉住滚动键、滚轮报告和关闭。`transcript.spec.ts` 钉住最后一张卡片的展开和最后一张 diff 的查找。`tui.spec.ts` 通过 FakeTerminal 会话键入 Ctrl+O / Alt+O。`pnpm run test:tui` 是该包的门禁。

## 相关

- [Web diff 卡片](2026-07-30-web-diff-card.md) —— 同一 `FileDiff` 意图的浏览器消费者；本 Agent Note 是 TUI 消费者。
- [已交付的交互式 TUI profile](2026-08-13-shipped-tui-profile.md) —— 本次绘制所在的组合包。
- [带标签的渲染意图联合](../architecture/2026-07-02-tool-render-intent-union.md) —— `card: 'diff'`。
