# Agent Note: 面向 pi-ai OAuth 提供方的订阅登录

Status: implemented

[English](2026-08-14-subscription-login.md) | 中文

## 问题

API 密钥无法为只提供 OAuth 方法的 catalog 提供方（`openai-codex`）完成认证，而那六个在密钥之外另带 OAuth 的提供方也没有使用订阅的产品路径。[目录不予提供的笔记](../bug-fix/2026-08-13-oauth-only-providers-withheld.md)记录了这个缺口：没有持久化存储、没有登录流程、也没有运行登录的界面。把 ChatGPT token 粘进密钥框会过期，且没有任何环节会去刷新它。只把 token 存下来对 `/model` 也不够：`createModels({ credentials })` 只有在 catalog 路由已经注册之后才有用。

## 决策

`@deepseek-ai/dsh-llm-oauth`（`ctx.llmOAuth`）是文件型 pi-ai `CredentialStore`，文档位于 `$DSH_HOME/.auth.yaml`（`0600`，父目录 `0700`）。它拥有 `login` / `logout` / `loginableProviders` / `read` / `list` / `modify` / `delete`。写入是跨进程锁下的原子、仅所有者可替换。`llm/oauth-updated` 点名每个已变更的提供方。显式 `path` 是文档文件，不是目录。

`dsh login` / `logout` / `auth` 由启动器拥有。[`apps/cli/src/login.ts`](../../../../apps/cli/src/login.ts) 启动一棵最小树（`llm-oauth` 加上 `@deepseek-ai/dsh-command-login`），避免 profile 的 argv 解析器消费这些 token。Commander 的 action 保持同步，只捕获工作；`apply` 在 `parseCmdline`（`parse`，不是 `parseAsync`）之后等待捕获到的 run。Token 写入同一份 `$DSH_HOME/.auth.yaml`，下一次 profile 启动会读到它。

已交付的 base 在 `llm-pi-ai` 之前挂载 `llm-oauth`。存储在 apply 时已经存在时，适配器会 `list()` 已存储的 catalog id，通过 `expandInstalledCatalog` 加上空桩（没有 `apiKeyEnv`），并把该存储交给 `createModels({ credentials })`。`llm/oauth-updated` 会作废 profile 备忘并重新跑注册和目录。`ctx.inject(['llmOAuth'])` 只用于晚挂载：在一棵永远不挂该存储的树上等待 inject，就是 TUI 的 settings 竞态。未知 / 非 catalog 的 id 会被忽略。目录仍然不提供尚未存入凭据的仅 OAuth catalog 路由；那些桩通过联合的 profile 那一半加入。

可登录的 catalog id 就是已安装 pi-ai catalog 上 `loginableProviders()` 返回的那些——今天包括 `openai-codex`、`anthropic`、`xai`、`github-copilot`、`kimi-coding`、`openrouter`、`openrouter-images` 和 `radius`。裸 `openai` 只支持 API 密钥。

## 备选方案

**把 `@deepseek-ai/dsh-command-login` 挂进 profile 树。** 否决：profile 启动解析器会与同一 argv 抢跑。启动器另起进程；command-login 不是 base profile 行。

**存储缺席时也等待 `inject(['llmOAuth'])`。** 否决：那就是 TUI 的 settings 竞态（`invariant service settled without becoming active`）。产品组合先挂存储，因此 apply 已经 list 过。

**把 `path` 当成目录并总是追加 `.auth.yaml`。** 否决：这会把 `path: '/x/.auth.yaml'` 变成 `/x/.auth.yaml/.auth.yaml`。`resolveSpec` 与 credentials-local 一致：显式 `path` 就是文件。

**把 `~/.codex/auth.json` 读进存储。** 否决，理由与不予提供的笔记相同：为一个提供方把 harness 绑定到另一个工具的私有文件格式上。

**在没有已存储凭据时仍提供仅 OAuth 的 catalog 路由。** 否决：每个请求仍会在发出之前以 `Provider is not configured` 失败。目录过滤保留；注册靠的是已存储 token 或 settings 已写过的路由。

**Web 登录界面。** 暂缓。模型设置页仍无法启动该流程。

**把 TUI `/login` 做成第二套 OAuth 实现。** 否决：TUI overlay 是同一套 `ctx.llmOAuth.login` 上的 `AuthInteraction`（[TUI 登录 overlay](2026-08-14-tui-login-overlay.md)）。

## 影响

`dsh login openai-codex` 或 TUI `/login` 写入存储；正在运行的 TUI `/model` 在 `llm/adapters-updated` 之后列出该 catalog 路由，请求经存储认证，并在锁下刷新。Web 仍需重新启动。模型设置页仍无法启动该流程；在存入 token、或 settings 文档已经写过该路由之前，Codex 不会出现在**添加提供方**里。同 UID 进程可以读取 `$DSH_HOME/.auth.yaml`；仅所有者权限挡住的是其他 OS 用户，不是模型或以同一用户运行的工具。

## 测试

`packages/llm/llm-oauth/tests` 钉住解析、仅所有者权限、login/logout、`llm/oauth-updated` 和 watcher（chokidar 被 mock）。`packages/llm/command-login/tests` 钉住 `ownsInvocation`、三条命令，以及 readline 交互（被 mock）。`apps/cli/tests/args.spec.ts` 和 `login.spec.ts` 钉住启动器路由和最小树。`packages/llm/llm-pi-ai/tests/adapter.spec.ts` 和 `catalog.spec.ts` 钉住 `oauthProviders` 桩、现场存储、登录后重新注册，以及晚挂载 inject。登录成功通过 `vi.mock('@earendil-works/pi-ai/providers/all')` stub。没有无密钥的、走完 OAuth 流程的组装快照。

## 相关

- [可配置提供方目录不再提供仅以 OAuth 认证的提供方](../bug-fix/2026-08-13-oauth-only-providers-withheld.md) — 本工作保留的目录过滤。
- [文件型凭据](../../../../packages/credentials/credentials-local/README.md) — OAuth 存储所遵循的文档、锁与 watcher 模式。
- [TUI 登录 overlay](2026-08-14-tui-login-overlay.md) — 进程内 `/login` / `/logout` / `/auth`，走同一份存储。
- [TUI 活模型目录](2026-08-14-tui-live-model-catalog.md) — 存储写入后的 `/model` 刷新。
