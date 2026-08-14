# Agent Note: TUI `/model` effort picker and footer effort

Status: implemented

English | [中文](2026-08-15-tui-model-effort-picker.zh.md)

## Problem

The reasoning-effort capability was already end-to-end in the backend — `llm.resolveModelInfo` reports each model's `reasoning.efforts` and `defaultEffort`, `ModelSelection` carries `reasoningEffort`, and `AgentDefaultModelConfig.saveSelection` persists `{provider, model, reasoningEffort?}` — but the interactive TUI never surfaced it. `openModelPicker` listed models from `llm.listModels` (which omits reasoning metadata), and `applyModelPick` parsed the picked row into a bare `{provider, model}`, overwrote `selection.current` with it, and called `saveSelection` on that. A model switch therefore dropped any stored effort, and a user could neither choose nor see the current effort: the footer label was `provider / model` with no effort component, and no second step asked for one.

## Decision

`/model` is now a two-step flow. After the model picker confirms a row, `chooseEffortThenApply` calls `llm.resolveModelInfo(provider, model)`. A model that exposes a non-empty `reasoning.efforts` opens a second `OverlayPicker` titled `Effort`, listing the efforts in adapter display order with the current selection's effort (when the same model is re-selected) or the model's `defaultEffort` preselected. Confirming an effort applies `{provider, model, reasoningEffort}`; a model with no efforts applies `{provider, model}` directly. `applyModelSelection` replaces `applyModelPick` and writes the complete `ModelSelection` — effort included — so a switch no longer drops a stored effort, and the request-path refusal still catches an unsupported explicit effort.

The effort picker's Escape cancels the whole switch, leaving the prior selection untouched — symmetric with the model picker's Escape. A `resolveModelInfo` failure (unreachable provider, adapter that cannot describe the exact route) is swallowed and applies without an effort; the request path refuses if the selection is genuinely unsupported.

`modelLabel` appends the current effort as ` · <effort>`, so the footer reads `openai / gpt-4.1 · high` when an effort is set and `openai / gpt-4.1` otherwise. The post-switch notice mirrors it.

## Alternatives considered

**Fold effort into the model picker rows.** Rejected because `listModels` does not carry reasoning metadata and the rows would hide a per-model capability behind one flat list; a second picker states the per-model offer explicitly.

**Escape on the effort picker applies the model with the provider default effort.** Rejected because the efforts list already includes the adapter default as a selectable entry, so "cancel" should mean cancel, not "apply a different choice than the one I navigated to".

**Call `resolveModelInfo` for every model while building the model picker.** Rejected because it would fan out one exact-route query per listed model just to decorate rows; the query runs only for the one model the user confirms.

**Clamp an unsupported stored effort to the nearest supported level.** Rejected — the LLM seam refuses unsupported efforts before provider I/O rather than aliasing, and the TUI follows that by offering only the supported levels.

## Consequences

The TUI `/model` flow now collects and displays the reasoning effort, conforming to the persistence shape [the default model follows the picker](2026-08-07-default-model-follows-the-picker.md) already assumed: `saveSelection` receives the complete user section, so an effort is stored only when the picker chose one and cleared otherwise. A reasoning model can no longer be switched silently to a bare selection; the effort picker is mandatory for models that expose efforts. The footer is the only place the current effort is visible mid-session.

## Testing

`tests/tui.spec.ts` covers the three paths under `pnpm run test:tui`: the effort picker opens for a model with efforts and the preselected default persists through `agentDefaultModel.saveSelection` (asserted via a `settings.replace` recorder) with the footer showing ` · high`; Escape on the effort picker cancels the switch, leaving `selection.current` and the footer unchanged and writing nothing; and a non-reasoning model skips the picker, keeps the footer free of `·`, and applies directly. There is still no keyless assembled TUI snapshot; the package-local semantic matrix under `pnpm run test:tui` pins this transient presentation per the testing policy.

## Related

- [The default model follows the picker](2026-08-07-default-model-follows-the-picker.md) — the `saveSelection` persistence shape this flow now feeds with an effort.
- [Per-Model Reasoning Declarations in llm-pi-ai](2026-08-08-pi-ai-per-model-reasoning-declarations.md) — the per-model `reasoning.efforts` the picker lists.
- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) — the bundle this chrome ships on.