# `@deepseek-ai/dsh-tui`

[English](README.md) | 中文

dsh 交互式终端组合包。省略 `--profile` 时，`dsh` 启动器会启动本 profile。[`cordis.patch.yml`](cordis.patch.yml) 直接叠加在 [`dsh-base`](../base/README.md) 之上：提供编码 persona 和工具模式、禁用 HMR（热模块替换）、将 Code Mode 的 worker 作为核心执行能力挂载，并插入本包的 `tui-runtime` 插件（配置为 `{resume, theme}`，从注入的 `tuiStartup` 提供方解析）。它不挂载任何 Host、HTTP server、Web runtime 或浏览器插件。该 patch 插入 [`dsh-agent-presets`](../../preset/agent-presets/README.md)（`default: standard`），并禁用宿主平面上的工具行，让每个会话加入一份常驻 preset；`apps/cli` 的 `composeProfile` 会补上随附根目录。

Loader 结算后，runtime 读取共享的 [`ctx.agentDefaultModel`](../../core/agent-default-model/README.md)，通过 `ctx.agents` 创建或恢复一个持久化 Agent（智能体），并经由 [`@oh-my-pi/pi-tui`](https://www.npmjs.com/package/@oh-my-pi/pi-tui) 占用 TTY。Node 版 `dsh` 启动器会把本 profile re-exec 到 bun >= 1.3.14；缺少 bun 会在 TTY 检查之前报用法错误。会话布局跟随 Pi 的交互式 TUI，并使用 OMP chrome：带快捷键提示的彩色产品名页眉、由用户消息气泡、`reasoning-delta` 的暗色 Thinking 块、Markdown 助手块和 [`presentCall` / `presentResult`](../../core/tools/README.md) 工具卡片组成的 transcript（每次 `subagent/start` 还会打开一张实时卡片：从子日志的 `subagent/descriptor` 取标签，把子会话自己的工具活动折叠成滚动 feed，并在 `subagent/end` 以该次运行的停止原因收尾）、muted 圆角边框编辑器，以及 cwd/模型页脚（同时统计正在运行的 subagent 数量），并在首轮上报 token 用量后，于模型行上方插入一行暗色持久统计：缓存命中率、计费输入/输出 token、解码吞吐（tok/s）、轮数、context 占用（`ctx N% used/window`），以及来自 `contextBreakdown` 的启发式 `~sys` / `~tools` / `~msg` 组成——全部读取自 `token-meter` 与 `session-stats` 会话投影，分页与压缩都不会改动这些数字）。Agent 等待模型时，transcript 尾部有一行转动的 `Thinking` loader；工具正在运行时同一行改标为该次调用的 `presentCall` 标题；首个 reasoning 或回答 token 会替换它。真正收尾的 subagent 运行会响铃（BEL）；有运行进行时窗口标题为 `dsh · N subagent(s) running`。`card: 'diff'` 的调用（write、edit、`str_replace_editor`）会画出折叠为八行的 `+`/`-` hunk；Ctrl+O 展开最近一张工具卡片，Alt+O 打开可用鼠标滚轮滚动的全屏 overlay。编辑器和页脚贴在 TTY 最下面几行，直到 transcript 填满视口。`/model`（以及 Ctrl+P / Alt+P）列出已注册的 `ctx.llm` 路由——DeepSeek 正式路由、settings 里配置的 pi-ai profile、进程环境里已有 API key 的已安装 catalog 提供方，以及设置了 `OLLAMA_API_KEY` 时的 Ollama Cloud——当所选模型暴露可选的 reasoning effort 档位时，再弹一个档位 picker，随后写入活选择，并经 `agentDefaultModel.saveSelection` 持久化。页脚以 `· <effort>` 追加显示当前档位。`llm/adapters-updated` 提交后会重建打开的 `/model` picker，并提示新注册的提供方 id，因此在另一进程里执行的 `dsh login` 不必重启 TUI 就能出现。`/theme` 列出内置调色板 Dark、Tokyo Night、Catppuccin、Light，以及 `$DSH_HOME/themes/<id>.json`（oh-my-pi 的 `colors` / `vars` JSON 在本 token 集合上可用），应用活调色板，并把 id 写入 `tui-theme` 设置段。`/settings` 打开设置中心：外观复用 `/theme`；Models 列出可配置的 `ctx.llm` 提供方，并通过 `ctx.credentials` 与 `ctx.settings.mutate` 写入 API key（Login 仍走 `/login`）；权限为当前会话切换生效的 [`ctx.permissionPresets`](../../interaction/permission-presets/README.md) 预设束（沙箱模式 + 审批策略），派生的 `custom` 行仅展示、不可设置；Inventory 只读列出 loader 已挂载的插件条目（`ctx.loader.entries()`）；提供方存一份本地文件时，Settings file 会提示 `ctx.settings.documentPath`。键入的行成为普通用户消息；空闲时 Enter 立即画出用户气泡并开始下一轮 follow-up；Agent 正在运行时，Enter 会把该行作为当前轮次的下一步引导送入，transcript 先显示一行暗色 `appending`，直到模型领取。当 plan 模式开启（或待生效）、已设置 goal、存在站立 todo 清单、或本会话有可见后台任务时，模型行上方会出现一行状态 chip——`/plan` 和 `/goal` 仍是宿主命令；`/jobs` 打开 `ctx.jobs.list` 的 picker。缺少投影或 `ctx.jobs` 时省略对应 chip。以 `/` 开头的行留在 [`dsh-commands`](../../interaction/commands/README.md) 命令平面（此处注册 `/help`、`/model`、`/theme`、`/settings`、`/login`、`/logout`、`/auth`、`/sessions`、`/jobs`、`/preset`、`/exit` 和 `/quit`）。`/preset` 在会话仍为空白时经 [`ctx.agentPresets`](../../preset/agent-presets/README.md) 重新组合；对话一旦开始即锁定。`compaction/summary` 画一行暗色 `compacted`；`feedback/record` 画出已记录的文本。斜杠自动补全还会建议 [`ctx.skills`](../../skill/skill/README.md) 中用户可调用的名称；与已注册命令同名的 skill 不会出现。`/sessions` 经 [`ctx.sessionQuery`](../../session-query/session-query/README.md) 列出各已记录 cwd 的顶层会话，并在进程内恢复所选会话；正在运行的一轮必须先结束，恢复失败则保留当前 Agent。`/login` 和 `/logout` 经 overlay（提供方 picker、授权 URL / 设备码、文本提示）驱动 [`ctx.llmOAuth`](../../llm/llm-oauth/README.md)；`/auth` 提示已存储与可登录提供方。成功的 `/login` 与 `dsh login` 写入同一份存储，因此 `/model` 会在 `llm/adapters-updated` 上刷新。向用户提问走 [`dsh-user-questions`](../../interaction/user-questions/README.md) overlay。本会话的 `approval/request` 会打开 [`ctx.approval`](../../interaction/user-approval/README.md) 上的 Allow once / Reject overlay；Escape 取消。Ctrl+C 在 Agent 运行时取消任务、在空闲时退出；Ctrl+D 退出。拆卸时停止 pi-tui、排空输入、flush Session，再经启动器提供的 `ctx.appExit` 宿主钩子（[`dsh-cmdline`](../../boot/cmdline/README.md)）请求退出。缺少 TTY 属于用法错误。调用参数就是这个应用的命令行：普通 `tui-startup` 提供方（[`src/startup.ts`](src/startup.ts)）注入 `ctx.cmdlineArgs`，读取 `--resume` / `--session`、打印应用自己的 `--help`，并提供 `tuiStartup`；runtime 注入该服务，再从惰性配置中读取 resume id。

## 模型体验

无影响，因为 runtime 把键入的行作为普通用户消息提交；提示词与工具来自已挂载的 agent preset，无花名册时则来自宿主组合。

#### KV Cache 影响

无；runtime 不向请求前缀添加任何内容。

## 已知限制与暂缓事项

- **不监视主题文件**：打开 `/theme` 时会再读一遍 `$DSH_HOME/themes`；正在使用的 JSON 被改掉不会实时重载。没有 OSC 11 自动深/浅色，也不附带 oh-my-pi 那套默认主题包。
- **`/sessions` 不改进程 cwd**：picker 列出各已记录 cwd 的顶层会话（本进程 cwd 在前）；切换是进程内 resume，和 `--resume <id>` 一样，工具仍在启动时的工作目录里跑。
- **状态 chip 与 `/jobs` 只做可见性**：缺少 `plan` / `goal` / `todos` 投影或 `ctx.jobs` 时省略对应 chip；`/jobs` 提示状态和详情，不取消任务。
- **Models 设置只写密钥，不编辑完整 profile**：`/settings` → Models 经 `ctx.credentials` 存 API key，并记录 `apiKeyEnv`；不改 base URL、模型列表，也不手改 `settings.yaml`。Settings file 只提示本地路径，不打开编辑器。订阅 OAuth 仍走 `/login`。
- **没有语言切换**：Web 的 `dsh-client-locale` 是浏览器插件；TUI 文案保持英文。
- **没有 Trajectory 表**：transcript 就是对话，没有第二份结构化日志视图。
- **编辑器只接受文本**：transcript 里的图片内容块已画成 `[image]`；编辑器不能附加文件。
- **没有赞/踩 chrome**：挂载了 `dsh-command-feedback` 时，`/feedback` 仍可记录一条会话级备注。
- **交互式 `dsh` 要求 bun >= 1.3.14**：`dsh web` 和 `dsh --profile headless` 留在 Node；dump-config 和启动器 `--help` 也是。
- **首轮请求后才显示 context 占用**：`contextWindow` 取自首条 `request/context` 记录，不从 `resolveModelInfo` 预热，因此首轮计费上报 sample 之前 `ctx` 分组为空。
- **subagent 卡片仅限实时**：`subagent/start` / `subagent/end` 生命周期是瞬时的，因此 `--resume` 会重放委派持久的工具调用与结果，但不会重放该次运行的活动 feed。
- **`ctx.appExit` 由启动器持有**：在 `dsh` 启动器之外启动 tui profile 会在激活时明确报错，直到宿主提供该退出请求。
