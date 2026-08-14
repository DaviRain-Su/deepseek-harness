# @deepseek-ai/dsh-llm-oauth

[English](README.md) | 中文

面向 pi-ai OAuth 提供方的持久化订阅登录存储（`ctx.llmOAuth`）。文档位于 `$DSH_HOME/.auth.yaml`（0600，父目录 0700）。该存储实现 pi-ai 的 `CredentialStore`，因此 `@deepseek-ai/dsh-llm-pi-ai` 可以把同一实例交给 `createModels({ credentials })`，由 pi-ai 在存储锁下刷新过期 token。登录与登出由应用拥有：本包运行 catalog 提供方的 OAuth 流程并持久化返回的凭据，不挂载命令界面。

```yaml
- id: llm-oauth
  name: '@deepseek-ai/dsh-llm-oauth'
```

`dsh login` / `logout` / `auth` 会启动一棵只挂本存储和 [`@deepseek-ai/dsh-command-login`](../command-login/README.md) 的最小树。挂载了该存储的 profile（已交付的 base 在 `llm-pi-ai` 之前挂载）在下次启动时读同一文件。

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `path` | `<harness home>/.auth.yaml` | Token 文档位置。 |
| `dshHome` | `$DSH_HOME` 或 `~/.dsh` | 省略 `path` 时使用的 harness home。 |
| `watch` | `true` | 热发布外部编辑。 |
| `debounceMs` | `100` | Watcher 写入稳定窗口。 |

文档是提供方 id 到 `oauth` 标记凭据的 YAML 映射。其他任何内容在启动时响亮失败，在热重载时警告并保留上一份完好快照。写入是跨进程锁下的原子、仅所有者可替换。`llm/oauth-updated` 点名每个已变更的提供方。

## 模型体验

经由 pi-ai 适配器间接生效：已存储的 token 为该 catalog 路由的提供方请求授权，所有模型可见内容均由适配器负责。

#### KV Cache 影响

无直接失效；token 绝不进入请求前缀。

## 已知限制与暂缓事项

- **Web 没有登录界面** — `dsh login` 和 TUI `/login` 写入本存储；模型设置页仍无法启动 OAuth 流程。
- **同 UID 进程可以读取该文档** — 仅所有者权限挡住的是其他 OS 用户，不是模型或以同一用户运行的工具。
