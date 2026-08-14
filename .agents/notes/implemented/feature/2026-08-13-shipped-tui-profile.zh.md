# Agent Note: 随附的交互式 TUI profile

Status: implemented

[English](2026-08-13-shipped-tui-profile.md) | 中文

## 问题

产品随附交互式浏览器 profile（`dsh web` / `--profile web`）和一次性 CLI（`dsh --profile headless "task"`），没有盒内交互式终端。此前位于 ui 组的 `@deepseek-ai/dsh-tui` 因没有产品负责人、没有已交付组合，以及带补丁的 `pi-tui` 产物而被删除；[该移除决策](../simplification/2026-08-04-remove-tui-package.md)对该包仍然成立。重新引入需要具名产品、显式组合包边界、具体交互提供方和组装测试，而不是恢复已删除的目录树。

## 决策

省略 `--profile` 会启动随附的 `tui` 模板：先 `@deepseek-ai/dsh-base`，再 `@deepseek-ai/dsh-tui`。`--profile tui` 是同一套组合。没有 `dsh tui` 别名；`dsh --help` 和 `dsh -h` 仍打印启动器帮助，以便发现 web、headless 和 plugin。tui 组合包持有 `--resume` / `--session`，方式与 headless 持有任务位置参数相同。

`@deepseek-ai/dsh-tui` 是 `packages/bundle/tui/` 下的新组合包。其 patch 直接叠加在 base 之上：编码 persona、进程工具模式、关闭 HMR（热模块替换）、Code Mode worker、`tui-startup` 和 `tui-runtime`。它不挂载 Host、HTTP server、Web runtime 或浏览器插件。工具留在宿主平面。runtime 读取 `ctx.agentDefaultModel`，通过 `ctx.agents` 创建或恢复一个持久化 Agent（智能体），并经由 bun 上的 `@oh-my-pi/pi-tui` 占用 TTY（[后续决策](2026-08-14-tui-omp-engine-and-catalog.md)）。交互布局和深色主题跟随 [Pi coding-agent 的 interactive mode](https://github.com/earendil-works/pi)：带快捷键提示的 accent 页眉、用户消息 `Box`、Markdown 助手块、带 pending/success/error 背景的 `presentCall`/`presentResult` 工具卡片、muted 边框编辑器、cwd/模型页脚。键入的行成为用户消息；以 `/` 开头的行留在 `dsh-commands`（此处注册 `/help`、`/exit`、`/quit`）。向用户提问走 `dsh-user-questions` overlay。Ctrl+C 在 Agent 运行时取消任务、在空闲时退出；Ctrl+D 退出。拆卸时停止 pi-tui、排空输入、flush Session，再经启动器持有的 `ctx.appExit` 请求退出。缺少 TTY 属于用法错误。

这不会恢复已删除的 ui 组 TUI 目录树、其快照、其打过补丁的 `pi-tui` 或 SDK 脚手架。

## 考虑过的替代方案

**只把 turtle-ui 当作官方树外路径。** 不予采纳，因为产品需要盒内交互式终端，其 profile 模板、内置组合包和组装测试标准应与 web、headless 相同。树外插件仍然有效，但不是随附 TUI。

**恢复已删除的 ui 组 TUI 目录树。** 不予采纳，因为那棵树是没有当前负责人的产品级前端，且移除决策的重新引入条件要求新的包边界，而不是继承已删除的实现。

**增加 `dsh tui` 别名。** 不予采纳，因为只有 `dsh web` 有别名；默认 profile 已经打开终端。

**把省略 `--profile` 当作错误。** 不予采纳，因为产品入口就是交互式终端；web 和 headless 仍需显式指定（`dsh web` 或 `--profile headless`）。

**把工具放到 TUI 本地平面，或加入 Host/HTTP。** 不予采纳，因为 TUI 与 headless 一样，是直接运行在 base 之上的 Agent，而不是第二套 Web 栈。

**把渲染器换成 `@oh-my-pi/pi-tui`。** 当时不予采纳，因为该包以 TypeScript 源码发布、声明 bun 引擎，并拉取 `pi-natives`；当时随附的 Node CLI 消费的是已编译的 `@earendil-works/pi-tui`，它已经提供 Markdown、Editor、`Box` 和显示列宽换行。Pi interactive mode 的布局和深色主题（页眉、Markdown 对话、工具卡片、muted 编辑器边框、cwd/模型页脚）是叠在该引擎上的应用层。[后续的 TUI bun 决策](2026-08-14-tui-omp-engine-and-catalog.md) 只在 TUI 进程上 supersede 这条拒绝。

## 后果

交互式终端用法是 `dsh` 和 `dsh --resume <id>`（`--profile tui` 等价）。已有且持有用户自有组合包列表的 `$DSH_HOME/profiles/tui` 目录保持不变；缺失的 tui profile 会自动初始化为 base + tui。已删除的 ui 组 TUI 目录树仍然不存在。

斜杠自动补全会建议已注册命令和 `ctx.skills` 中用户可调用的名称（[TUI skill 斜杠补全](2026-08-14-tui-skill-slash-complete.md)）。`/sessions` 切换本 cwd 的顶层会话（[TUI 会话 picker](2026-08-14-tui-session-picker.md)）。批准走 Allow once overlay。transcript 是用户消息气泡、Markdown 助手块和 `presentCall`/`presentResult` 工具卡片；换行使用 pi-tui 的显示列宽。编辑器、Markdown 和 select-list 的 chrome 使用 Pi 深色主题的 truecolor 色值。主 transcript 是回滚缓冲区，不是备用屏幕。

## 测试

包测试覆盖 transcript 格式化、Markdown 对话块、工具卡片映射、页眉/页脚、斜杠自动补全、提问 overlay、Loader 启动提供方（`--resume` / `--session` / `--help`），以及 FakeTerminal 会话（创建/恢复、提交、斜杠分派、Ctrl+C/Ctrl+D、拆卸）。已构建和源码路径的 `dsh` bin 在 bun 能够 re-exec 时将非 TTY 的裸调用固定为 `tui requires an interactive TTY`，否则固定为缺 bun 诊断；`--profile tui --help` 和 `--dump-default-config`（包含 `dsh-tui`，不含 Host/Web/client 行）仍不把 `tui` 列为启动器持有的子命令。没有无密钥的组装 TUI 快照示例；呈现由包内语义矩阵覆盖，Terminal 是测试接缝。
