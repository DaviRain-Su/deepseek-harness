# Agent Note：TUI `/model` 档位 picker 与页脚档位显示

Status: implemented

English | [中文](2026-08-15-tui-model-effort-picker.md)

## 问题

reasoning-effort 能力在后端已端到端打通——`llm.resolveModelInfo` 报告每个模型的 `reasoning.efforts` 与 `defaultEffort`，`ModelSelection` 携带 `reasoningEffort`，`AgentDefaultModelConfig.saveSelection` 持久化 `{provider, model, reasoningEffort?}`——但交互式 TUI 从未暴露它。`openModelPicker` 用 `llm.listModels`（不含 reasoning 元数据）列出模型，`applyModelPick` 又把所选行解析成裸的 `{provider, model}`，用它覆盖 `selection.current` 后交给 `saveSelection`。于是切模型会丢掉已存的档位，用户既无法选择也看不到当前档位：页脚标签只有 `provider / model`，没有档位成分，也没有第二步来询问档位。

## 决策

`/model` 现在是两步流程。模型 picker 确认某行后，`chooseEffortThenApply` 调用 `llm.resolveModelInfo(provider, model)`。暴露非空 `reasoning.efforts` 的模型会再打开一个标题为 `Effort` 的 `OverlayPicker`，按 adapter 的展示顺序列出档位，并预选当前选择的档位（重新选中同一模型时）或模型的 `defaultEffort`。确认某档位即应用 `{provider, model, reasoningEffort}`；无档位的模型直接应用 `{provider, model}`。`applyModelSelection` 取代 `applyModelPick`，写入完整的 `ModelSelection`（含档位），因此切模型不再丢弃已存档位，而请求路径仍会在显式档位不被支持时拒绝。

档位 picker 的 Escape 取消整个切换，原选择不动——与模型 picker 的 Escape 对称。`resolveModelInfo` 失败（provider 不可达，或 adapter 无法描述该 exact route）被吞掉并按无档位应用；若选择确实不被支持，请求路径会拒绝。

`modelLabel` 把当前档位追加为 ` · <effort>`，因此页脚在有档位时显示 `openai / gpt-4.1 · high`，否则显示 `openai / gpt-4.1`。切换后的 notice 同样如此。

## 考虑过的替代方案

**把档位折进模型 picker 行。** 否决，因为 `listModels` 不带 reasoning 元数据，且一个扁平列表会把 per-model 能力藏在行后；第二个 picker 才是明确陈述 per-model 的可选档位。

**档位 picker 的 Escape 按 provider 默认档位应用模型。** 否决，因为档位列表已把 adapter 默认档位作为可选条目，所以“取消”应表示取消，而非“应用一个与我导航到的不同的选择”。

**构建模型 picker 时为每个模型调 `resolveModelInfo`。** 否决，因为那会为给行装饰而对每个列出的模型各发一次 exact-route 查询；该查询只对用户确认的那一个模型执行。

**把不被支持的已存档位 clamp 到最近的档位。** 否决——LLM seam 在 provider I/O 之前拒绝不被支持的档位而非别名，TUI 沿用此语义，只提供被支持的档位。

## 后果

TUI `/model` 流程现在会采集并显示 reasoning effort，符合 [default model follows the picker](2026-08-07-default-model-follows-the-picker.md) 已假设的持久化形态：`saveSelection` 收到完整的 user section，因此档位只在 picker 选了时才被存储，否则被清除。reasoning 模型不再可能被静默切换到裸选择；对暴露档位的模型，档位 picker 是强制步骤。页脚是会话进行中唯一能看到当前档位的位置。

## 测试

`tests/tui.spec.ts` 在 `pnpm run test:tui` 下覆盖三条路径：模型有档位时档位 picker 打开，预选的默认档位经 `agentDefaultModel.saveSelection` 持久化（通过 `settings.replace` 记录器断言），页脚显示 ` · high`；档位 picker 上 Escape 取消切换，`selection.current` 与页脚不变且不写入任何内容；非 reasoning 模型跳过 picker，页脚不含 `·`，直接应用。目前仍无 keyless 组装 TUI snapshot；按测试策略，`pnpm run test:tui` 下的包级语义矩阵钉住这一瞬态呈现。

## 相关

- [default model follows the picker](2026-08-07-default-model-follows-the-picker.md) —— 本流程现在带档位喂给 `saveSelection` 的持久化形态。
- [Per-Model Reasoning Declarations in llm-pi-ai](2026-08-08-pi-ai-per-model-reasoning-declarations.md) —— picker 所列的 per-model `reasoning.efforts`。
- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) —— 承载这套 chrome 的 bundle。