# Agent Note: TUI 源码启动直接走 bun

Status: implemented

[English](2026-08-14-tui-bun-first-source-launch.md) | 中文

## 问题

交互式 `pnpm dsh` 在 tui profile 能 `exec` bun 之前，先付一次 Node+tsx 的跳转。tsx 的 ESM 钩子是为了让 web / headless 在 Node 上加载不可擦除的 vendored 图；tui 进程不需要它，因为 bun 会原生加载同一份 TypeScript。这次跳转把启动做了两遍，并把 TTY 路径留在 OMP 引擎不用的运行时上。

## 决策

根目录 `dsh` 脚本运行 `node apps/cli/src/dsh-launch.mjs`。该文件是纯 ESM：不经过 tsx 分类 argv，对可以走 bun 的模式 `exec` `bun apps/cli/src/bin.ts`，否则走 `node --import tsx/esm apps/cli/src/bin.ts`。tui 是硬性要求：缺少 bun >= 1.3.14 会在加载 `bin.ts` 之前以退出码 1 退出。headless 以及 `login` / `logout` / `auth` 在 PATH 上有可用 bun 时走 bun；Node+tsx 仍是回退，因此只有 Node 的 CI 仍能启动。启动器 `--help` / `--version`、`--dump-config` / `--dump-default-config`、`web` 和 `plugin` 仍留在 Node+tsx。

当 `bin.ts` 是在 Node 下到达时（已安装的 `lib/bin.js`，或直接 `node --import tsx/esm`），`reexecTuiUnderBun` 仍是回退。源码 tui 路径上进程已经是 bun，因此它是空操作。已安装的 headless 与 login 仍留在 Node。

这不会把 `@oh-my-pi/pi-natives` 当作 harness 内核引入，不会替换 `landlock-run`，也不改 `engines.node`、pnpm 或 Node CI 矩阵。web 仍遵守 [tsx 源码启动契约](2026-07-29-dsh-source-launch-tsx-esm.md)。

## 考虑过的替代方案

**让 `pnpm dsh` 对每种模式都执行 `bun apps/cli/src/bin.ts`。** 否决：web、HMR（`loader.internal`）以及 Node 兼容冒烟仍需要 tsx 向量。

**仍在 tsx 加载 `bin.ts` 之后再分类。** 否决：要删掉的成本就是 tsx 这一跳本身。

**已发布 `bin` 的 shebang 改成 bun。** 否决：`dsh web` 必须能在只有 Node、没有 bun 的主机上启动。

## 后果

`pnpm dsh` 和 `pnpm dsh --resume <id>` 在 bun 下启动 TUI，不再经过 Node+tsx。没有 bun >= 1.3.14 的主机仍在加载 `bin.ts` 之前以退出码 1 指出 [https://bun.sh](https://bun.sh)。`pnpm dsh --profile headless` 和 `pnpm dsh auth` 在 PATH 上有 bun >= 1.3.14 时走 bun，否则走 Node+tsx。`pnpm dsh web` 仍走 Node+tsx。已安装的 CLI 仍从 Node 启动，仅对 tui re-exec bun。

## 测试

`apps/cli/tests/tui-hot-path.spec.ts` 用不会打印并退出的启动，把分类器钉在 `parseDshArgs` 上。`source-launch.compat.spec.ts` 跑生产向量 `dsh-launch.mjs`：非 TTY 的 tui 失败或缺少 bun、Node+tsx 上的启动器 `--help`、无密钥的 headless 用法/帮助、空 home 的 `auth`，以及 `node --import tsx/esm bin.ts` 回退。`bun-reexec.spec.ts` 仍钉住版本下限。

## 相关

- [TUI 的 bun 运行时与 pi-ai 目录](../feature/2026-08-14-tui-omp-engine-and-catalog.md) — tui 进程为什么需要 bun；本笔记负责源码这一跳。
- [通过 tsx ESM 钩子做 dsh 源码启动](2026-07-29-dsh-source-launch-tsx-esm.md) — web 仍使用、headless/login 回退到的 Node+tsx 向量。
