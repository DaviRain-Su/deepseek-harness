# `@deepseek-ai/dsh-tui`

[English](README.md) | 中文

dsh 交互式终端组合包。省略 `--profile` 时，`dsh` 启动器会启动本 profile。[`cordis.patch.yml`](cordis.patch.yml) 直接叠加在 [`dsh-base`](../base/README.md) 之上：提供编码 persona 和工具模式、禁用 HMR（热模块替换）、将 Code Mode 的 worker 作为核心执行能力挂载，并插入本包的 `tui-runtime` 插件（配置为 `{resume}`，从注入的 `tuiStartup` 提供方解析）。它不挂载任何 Host、HTTP server、Web runtime 或浏览器插件。

Loader 结算后，runtime 读取共享的 [`ctx.agentDefaultModel`](../../core/agent-default-model/README.md)，通过 `ctx.agents` 创建或恢复一个持久化 Agent（智能体），并经由 [`@earendil-works/pi-tui`](https://www.npmjs.com/package/@earendil-works/pi-tui) 占用 TTY。会话布局跟随 Pi 的交互式 TUI：带快捷键提示的彩色产品名页眉、由用户消息气泡、Markdown 助手块和 [`presentCall` / `presentResult`](../../core/tools/README.md) 工具卡片组成的 transcript、灰色边框编辑器，以及两行 cwd/模型页脚。键入的行成为普通用户消息；以 `/` 开头的行留在 [`dsh-commands`](../../interaction/commands/README.md) 命令平面（此处注册 `/help`、`/exit` 和 `/quit`）。向用户提问走 [`dsh-user-questions`](../../interaction/user-questions/README.md) overlay。Ctrl+C 在 Agent 运行时取消任务、在空闲时退出；Ctrl+D 退出。拆卸时停止 pi-tui、排空输入、flush Session，再经启动器提供的 `ctx.appExit` 宿主钩子（[`dsh-cmdline`](../../boot/cmdline/README.md)）请求退出。缺少 TTY 属于用法错误。调用参数就是这个应用的命令行：普通 `tui-startup` 提供方（[`src/startup.ts`](src/startup.ts)）注入 `ctx.cmdlineArgs`，读取 `--resume` / `--session`、打印应用自己的 `--help`，并提供 `tuiStartup`；runtime 注入该服务，再从惰性配置中读取 resume id。

## 模型体验

无影响，因为 runtime 把键入的行作为普通用户消息提交；提示词与工具由 base 和 tui 组合包中的相应条目提供。

#### KV Cache 影响

无；runtime 不向请求前缀添加任何内容。

## 已知限制与暂缓事项

- **每个进程一个会话**：runtime 不列出或切换会话；`--resume` 只接受持久化后端已经持有的 id。
- **没有权限提示 UI**：bash 与文件系统变更遵循进程权限预设，而不是终端内的审批 overlay。
- **没有实时 skill 目录补全**：斜杠自动补全只读取 `dsh-commands`；不会从 `ctx.skills` 建议 skill 名称。
- **`ctx.appExit` 由启动器持有**：在 `dsh` 启动器之外启动 tui profile 会在激活时明确报错，直到宿主提供该退出请求。
