# Agent Note: TUI 的 bun 运行时与 pi-ai 目录

Status: implemented

[English](2026-08-14-tui-omp-engine-and-catalog.md) | 中文

## 问题

已交付的交互式 TUI 在 Node 上使用 [`@earendil-works/pi-tui`](https://www.npmjs.com/package/@earendil-works/pi-tui)。该引擎没有圆角框 `symbols`、没有编辑器 `hintStyle`，主题适配也比 [`@oh-my-pi/pi-tui`](https://www.npmjs.com/package/@oh-my-pi/pi-tui) 薄；后者声明 `engines.bun >= 1.3.14`，并使用 `Bun.stringWidth` / `bun:ffi`。会话没有 `/model` 选择器，transcript 丢弃 `reasoning-delta` 分片，因此思考内容不会出现。

## 决策

TUI **进程**在 bun 上运行。源码 `pnpm dsh` 在 [`dsh-launch.mjs`](../../../../apps/cli/src/dsh-launch.mjs) 里分类 argv，并对 tui 启动 `exec` bun（[bun 优先的源码启动](../architecture/2026-08-14-tui-bun-first-source-launch.md)）。Node 版 `dsh` 启动器在 `parseDshArgs` 选出 profile `tui` 且 `process.versions.bun` 未设置时，用 `bun` `exec` 同一入口和 argv。缺少 bun 或版本低于 1.3.14 则以退出码 1 报错并指出 [https://bun.sh](https://bun.sh)。已安装的 web、headless、dump-config、plugin 以及启动器 `--help` 留在 Node；源码 headless 与 login 在 PATH 上有 bun 时走 bun。

`@deepseek-ai/dsh-tui` 依赖 `@oh-my-pi/pi-tui`（及其 `@oh-my-pi/pi-natives` 树）。Host `tsc` 消费该包的 `.d.ts`；tsdown 把 `@oh-my-pi/*` 标为 external，避免宿主包加载 `bun:ffi`。Node Vitest 排除 `packages/bundle/tui`；`pnpm run test:tui` 在 bun 下跑这些测试。coverage CI job 安装 bun 并运行该脚本。

Chrome 适配跟随 OMP 的 `getEditorTheme` / `getMarkdownTheme` / `getSelectListTheme` / `getSymbolTheme`：圆角框符号、muted 编辑器边框、`hintStyle`、用户消息 `Box`、Markdown 助手块、工具卡片背景。内置调色板是 Pi 的 `dark`，加上从 OMP 拷贝的 `dark-tokyo-night`、`dark-catppuccin` 和 `light` 色值。文件主题、持久化和 `/theme` 目录见 [TUI 文件主题](2026-08-14-tui-file-themes.md)。仍不交付 OMP 的主题监视器、mermaid ASCII、native highlight FFI，或那套打包的 OMP 默认 JSON。pi-tui 把短于 TTY 的帧顶对齐，因此 `SessionChrome` 在 transcript 和编辑器之间插入空行，直到 transcript 填满视口。`reasoning-delta` 分片和组装后的 `reasoning` 块会以暗色斜体 Thinking 正文出现在 Markdown 回答之前。

`dsh-llm-pi-ai` 增加 `enableInstalledCatalog`（默认 `false`）。为 true 时，对每个 `catalogProviderTakesApiKey` 接受的 `catalogProviderIds()` 条目注册一条省略 `apiKeyEnv` 的路由，从而走 pi-ai 的环境发现（`OPENAI_API_KEY` 等）；显式 `providers` 条目覆盖对应占位。已交付组合将该标志保持关闭。插件 apply 仍会自动注册进程环境里已有 API key 的 catalog 提供方（跳过 catalog `deepseek`，以免与 `deepseek-official` 重复），并在设置了 `OLLAMA_API_KEY` 时注册 `ollama-cloud`——托管的 Ollama Cloud，端点 `https://ollama.com/v1`，pi-ai 不提供该 catalog id。`/model`（以及 Ctrl+P / Alt+P）列出已注册的 `ctx.llm.listProviders()` × `listModels()` 路由——DeepSeek 正式路由、settings 里配置的 pi-ai profile、这些环境发现路由，以及 Ollama Cloud——写入 `ModelSelectionRef.current`，调用 `agentDefaultModel.saveSelection()`，并更新页脚。`ollama-cloud` 的 `listModels` 会询问 `GET /v1/models`，seed catalog 未点名的 id 仍会解析。

这只在 TUI 进程上 supersede [shipped-tui-profile](2026-08-13-shipped-tui-profile.md) 里被拒绝的 `@oh-my-pi/pi-tui` 替代方案。整仓 `packageManager`、Vitest、web 和 CI 的 Node 矩阵仍是 pnpm/Node。

## 考虑过的替代方案

**把整仓换成 bun。** 不予采纳，因为会推翻 [tsx source-launch 约定](../architecture/2026-07-29-dsh-source-launch-tsx-esm.md)、`engines.node` 和 Windows wine 门。只有 TUI 进程需要 bun API。

**把 oh-my-pi coding-agent 整棵搬进来。** 不予采纳，因为那是另一套产品（Rust `pi-natives` 核心、60+ 提供方、31 个工具、advisor/memory、OAuth、Agent Hub）。dsh 仍是 Cordis 插件树，DeepSeek 仍是正式适配器。

**再依赖 `@oh-my-pi/pi-catalog`。** 不予采纳，因为 `dsh-llm-pi-ai` 已经通过 `catalogProviderIds()` 物化 `@earendil-works/pi-ai` 的 `getBuiltinProviders()`。第二份目录会重复路由 id 和认证策略。

**给 Ollama Cloud 写一份静态模型列表。** 不予采纳，因为 Ollama 会按公布日程下线 Cloud 模型；`/model` 会提供端点已经不再服务的 id。用实时 `GET /v1/models` 加单一 seed 回退，才是选择器需要的 listing。

**在 tui patch 里打开已安装目录。** 不予采纳，因为 `/model` 应该提供真正可用的路由，而不是每一条 pi-ai catalog 模型。没有环境密钥的额外提供方仍写进 `$DSH_HOME/settings.yaml` 的 `llm-pi-ai:`。进程环境里已有 API key 的提供方会自动注册，无需摊开整份目录。

**在 base 里打开已安装目录。** 不予采纳，因为摊开每一条 catalog 提供方会改变 web 组合。按环境密钥注册是更窄的扩展：选择器里只出现进程已经能认证的提供方。

**OMP 的模型角色、回退链、路径作用域模型和 OAuth。** 暂缓。`/model` 是 llm 注册表上的会话选择，不是 OMP 的 Settings/Registry 类型。

**用 OMP 风格的欢迎屏填满空视口。** 不予采纳，因为 dsh 的页眉只有几行；把编辑器垫到屏幕底部是布局，不是额外的 onboarding 文案。

## 后果

交互式 `dsh` 要求 PATH 上有 bun >= 1.3.14。`dsh web` 和 `dsh --profile headless` 不要求。没有 bun 的宿主仍可 dump tui 配置并打印启动器帮助。

TUI 进程加载与 Node 相同的 base 插件树。bun 的解析器拒绝把 `declare` 当作值绑定，因此 `dsh-llm-pi-ai` 使用另一个辅助函数名。bun 不导出 `node:module.stripTypeScriptTypes`；worker 运行时随后用 amaro 做类型剥离。bun 也没有 Node ESM 的 `loader.internal`，因此启动器的仅监视 HMR（`root: []`）在没有 `--expose-internals` 时也能启动；模块热替换的 root 仍然需要它。`boot()` 会列出 `AggregateError` 的成员，使并发加载失败点名每一行。

TUI `/model` 列出 `ctx.llm` 当前已注册的路由，包括进程环境里已有 API key 的 catalog 提供方，以及设置了 `OLLAMA_API_KEY` 时的 `ollama-cloud`。环境里没有密钥的提供方仍通过 settings profile 添加，而不是 TUI 把目录整表铺出来。本地 Ollama 守护进程仍是手工声明的路由；仅有 `OLLAMA_HOST` 不会注册。

Node coverage 不测量 `packages/bundle/tui/src`。该树的正确性由 bun 下的 `pnpm run test:tui` 负责。

## 测试

`apps/cli` 单测 bun 版本下限；source-launch / built-bin 冒烟在 bun 已 re-exec 时接受 `tui requires an interactive TTY`，否则接受缺 bun 诊断。`dsh-llm-pi-ai` 单测休眠默认、目录展开、环境密钥注册（含跳过 catalog `deepseek`，以及从 `OLLAMA_API_KEY` 注册 `ollama-cloud`）、设置层覆盖占位，以及 Cloud `listModels` 询问与 seed 回退。bun 下的 TUI 包测试覆盖调色板 `/theme`、overlay picker、对着假 `ctx.llm` 的 `/model`、FakeTerminal 会话、chrome、把编辑器钉在短视口的最下面几行、流式和回放的 reasoning，以及审批 overlay。仍然没有无密钥的组装 TUI 快照；呈现仍是包内语义矩阵。
