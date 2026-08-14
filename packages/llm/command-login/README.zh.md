# @deepseek-ai/dsh-command-login

[English](README.md) | 中文

启动器拥有的 pi-ai 订阅登录 CLI。它通过 `@deepseek-ai/dsh-cmdline` 注册 `login [provider]`、`logout <provider>` 和 `auth`，并且只消费第一个内部参数是这些命令之一的调用。产品路径是 `dsh login` / `dsh logout` / `dsh auth`：CLI 启动一棵最小树（本插件加上 [`@deepseek-ai/dsh-llm-oauth`](../llm-oauth/README.md)），避免 profile 启动解析器与同一 argv 抢跑。Token 写入 `$DSH_HOME/.auth.yaml`，下一次 profile 启动会读到它。

```text
dsh login [provider]
dsh logout <provider>
dsh auth
```

`login` 省略提供方时，会在已安装 catalog 中带 OAuth 流程的提供方里弹出选择。终端交互打印认证 URL 或设备码，并一次读一行。

本包不是 base profile 行。把它和完整应用挂在一起时，除非内部参数以 `login`、`logout` 或 `auth` 开头，否则它什么也不做。

## 模型体验

经由 pi-ai 适配器间接生效：这些命令只持久化或删除 token，由这些 token 授权的模型可见请求均由适配器负责。

#### KV Cache 影响

无直接失效；这些命令绝不进入请求前缀。

## 已知限制与暂缓事项

- **没有进程内 TUI `/login`** — 流程在启动器的最小树里运行并退出；正在运行的 TUI 必须重启才能看到新存储的路由。
- **Web 没有对应界面** — 模型设置页仍无法启动 OAuth 流程。
