# AgentTeam v0.7.0 核心重构方案书

> 更新时间：2026-06-23
> 版本口径：本文按产品路线 `v0.4.0 → v0.7.0` 编写；仓库当前 `package.json` 版本为 `0.6.8`，与产品路线口径、历史 GitHub checkpoint 标签、未来 npm package version 分开管理。
> 一句话目标：`v0.7.0 = core refactor + performance baseline + bug burn-down release`。
> 当前执行原则：历史 `v0.5` 命名的 checkpoint 文件只作为审计证据保留；新的计划、验收和 release-ready 判断一律以 v0.7.0 为最终目标。

---

## 0. 当前仓库事实

AgentTeam 当前不是一个独立 daemon，也不是 native binary 产品；它是 TypeScript/Node 形态的 pi npm extension。

### 0.1 包与入口事实

从当前仓库可确认：

- `package.json` 当前声明版本为 `0.6.8`，但本文仍按产品路线中的 v0.7 目标讨论。
- `package.json` 使用 `"type": "module"`。
- `package.json` 中 `pi.extensions` 指向 `./index.ts`。
- peer dependencies 包括：
  - `@earendil-works/pi-coding-agent`
  - `@earendil-works/pi-ai`
  - `@earendil-works/pi-tui`
  - `typebox`
- `index.ts` 负责初始化 state store，并注册 hooks、tools、commands、renderers。
- 当前公开工具和命令分布在：
  - `api/tools.ts`
  - `api/commands.ts`
  - `tools/`
  - `commands/`
- `/team` TUI 入口在 `commands/team.ts` 与 `teamPanel.ts`，panel 子模块在 `teamPanel/`。
- tmux 相关实现集中在 `tmux/` 与 `adapters/tmux/`。
- file-backed state 相关实现集中在 `state/` 与 `adapters/runtime/*Ports.ts`。
- task/message/report 应用逻辑集中在 `app/`。

结论：v0.7.0 必须保留 TypeScript/pi extension facade。Rust/Go 不能作为 v0.7 的整体重写方向，但 Go 可以成为被选中核心模块的 high-performance kernel。Slice 0-7 先把 Go helper contract、parity corpus 和 guardrails 建好；后续方向调整为“迁移期 fallback → 模块级 cutover → 删除 TS runtime fallback”。TypeScript/pi control plane 仍负责工具、命令、hooks、prompts、`/team`、治理和 npm 发布面；Go kernel 一旦通过某个模块的 cutover gate，就应成为该模块唯一 runtime implementation，缺失/不兼容时 fail closed，并通过 GitHub tag/npm 版本回滚，而不是长期保留双实现 runtime fallback。

#### Slice 0 决策记录与端口审计

- 决策记录：`docs/decisions/0001-replaceable-go-kernel.md`。
- 端口审计：`docs/go-kernel-port-audit.md`。
- 本 Slice 仅记录方向和边界，不实现 Go 代码、不引入 native binary、不改变 `package.json` version、不执行 `npm version` 或 `npm publish`。
- Go kernel 的候选职责仅限 profiling 证明的 compact deterministic hot path，例如 panel/read-model projection、fingerprint/diff、tmux snapshot parsing/indexing；不得成为第二个控制平面、daemon、worker、scheduler 或 full-text reader。
- 任意未来 Go slice 必须先补 TypeScript port contract、characterization fixture、missing/timeout/version-mismatch failure tests，并保持 legacy state compatibility；fallback 仅作为迁移脚手架，必须有明确删除条件和 cutover gate。

### 0.2 当前实现事实

当前代码中已经存在若干关键 seam，但还不够稳定：

- `config.ts` 已完成 v0.4.12 Config Bootstrap & Effective Runtime Config Hardening：
  - 首选 v1 schema：`version`、`agents`、`automation`、`ui`。
  - legacy `agentModels` 仍可读，并给出迁移 warning。
  - spawn 与 config/panel compact surfaces 暴露 effective model source：`v1 | legacy | null | default`。
- Team Identity / Name Scope Hardening 已完成 v0.4.13 GitHub-only checkpoint 行为：team slug 会 trim 外层 separator，中文-only/标点-only 名称安全拒绝并提示 ASCII slug/name；legacy `teams/-` 不会被自动删除、重命名、迁移、接管或恢复。
- `state/fsStore.ts` 当前使用同步文件 I/O、整文件 JSON parse/stringify、`.lock` 文件、atomic rename。
- `state/teamStore.ts` 仍以 `teams/<storageKey>/team.json` 为主要路径布局；新 team 带 `teamId/projectKey/displayName/slug` identity metadata，legacy no-identity team 通过 read model 暴露 read-only effective identity。
- `state/sessionBinding.ts` 当前持久化 identity-first session fields（`teamId/projectKey/identityKey/teamSlug`），并保留 legacy `teamName/memberName` 兼容读取和 fallback。
- `tmux/client.ts` 当前每次 tmux 调用都通过 `execFileSync` 或 `execFile('tmux')`。
- `teamPanel/dataSource.ts` 当前 panel load 会读取 team、tasks、leader mailbox/outbox diagnostics；v0.4.15 起 attached/global 普通 refresh 通过 `prepareTeamForPanel(..., { mode: 'light' })` 或等价 light intent 走非破坏性 reconcile，explicit force reconcile 只保留为手动/显式路径。
- `app/taskReportWorkflow.ts` 当前 worker `report_done/report_blocked` 会创建 durable TaskReport 并通知 leader，但 non-leader report 是 `reportOnly`，不会自动 close/block task；leader review 仍是治理边界。

这些事实说明：当前主要风险不是“TypeScript 语言本身慢”，而是 identity、file store/read model、tmux subprocess、panel refresh loop、report lifecycle 和 config bootstrap 这些核心 seam 没有完成。

### 0.3 当前产品事实与不可破坏边界

当前 AgentTeam 的核心产品模型必须保留：

```text
Team             = leader + visible tmux teammates
Task             = leader-gated shared facts
Mailbox          = directed full-text message boundary
TaskReport       = durable report artifact
TaskEvent        = compact lifecycle/progress history
TaskMessageRef   = no-body task-bound message index
/team            = read-mostly cockpit, not full-text mailbox reader
```

当前不可破坏边界：

- visible tmux teammate panes 必须保留。
- leader-gated task governance 必须保留。
- `agentteam_receive` 仍是 mailbox full-text/read boundary。
- non-leader `report_done/report_blocked` 只提交报告，不直接关闭任务。
- researcher/planner/implementer role separation 必须保留。
- 不允许 worker-spawns-worker。
- 不允许 peer report 自动触发 planner/implementer。
- 不允许 hidden terminal-key delivery fallback。
- 不允许破坏 legacy `teams/-`。

### 0.4 当前推进状态（截至 v0.6.43 evidence reconciliation）

当前状态必须按“事实已完成 / 仍需治理 / 明确禁止”三类阅读：

- 已完成并纳入 repo 轨道：v0.6.37 readiness burn-down map、v0.6.38 temp-home-bound RC harness、v0.6.38 p95/panel refresh runtime fix、post-fix p95 evidence reconciliation、worker launch provenance fix、真实 operator/model manual RC 主 checklist、v0.6.39/v0.6.40 task/message/report normal 与 large-mailbox focused p95 pass、v0.6.41 fsStore lock-wait focused p95 pass、v0.6.42 data-change render debounce focused pass、v0.6.42 spawn bookkeeping focused p95 pass、v0.6.43 readiness evidence reconciliation、v0.6.44 Go cutover candidate selection、v0.6.45 tmuxSnapshotParse cutover gate prep、v0.6.46 default-Go readiness approval gate、v0.6.47 non-mutating default-Go dry-run implementation、v0.6.48 actual default-Go cutover for `tmuxSnapshotParse`、v0.6.49 Go control-plane expansion gate、v0.6.50 Go tmuxSnapshotCapture cutover、v0.6.51 contract constants and artifact naming gate、v0.6.52 worker lifecycle contract gate、v0.6.53 Go inspectPane worker lifecycle slice、v0.6.54 Go listAgentTeamPanes worker lifecycle slice、v0.6.55 Go listAgentTeamPanes facade cutover、v0.6.56 Go inspectPane facade cutover、v0.6.57 Go paneExists facade cutover、v0.6.58 Go resolvePaneBinding facade cutover、v0.6.59 Go targetForPaneId facade cutover，以及 v0.6.60 Go captureCurrentPaneBinding facade cutover。
- 已完成但不能过度声明：真实 operator/model manual RC 主链路已通过 state-check 证据；T129 true operator PlanRun cancel follow-up 已在任务板验收为 pass，但其本地 ignored sanitized evidence 未 force-add 入 repo；focused p95 rows 已有 pass evidence；v0.6.44 只选择第一个 future Go-owned runtime 候选模块；v0.6.45 只准备 parity/fail-closed/no-leak/fallback-prereq/rollback-default-disable guardable prerequisites；v0.6.46 default-Go readiness approval gate 已启动/完成，GO for later non-mutating default-Go dry-run implementation；v0.6.47 已实现真实 non-mutating default-Go dry-run runtime/verifier path；v0.6.48 在 user-approved main-package embedded helper layout 下完成 `tmuxSnapshotParse` default/unset 与 explicit `go` 的 actual parser cutover，并删除 runtime TypeScript parser fallback；v0.6.49 在用户明确要求“继续将 Go 扩展到 tmux capture、worker lifecycle、state、task/report/PlanRun、UI、release/package control plane”后，新增 `docs/decisions/0003-go-control-plane-expansion.md` 与 `docs/perf/v0.6.49-go-control-plane-expansion-gate.md`，接受 user-authorized architecture direction to expand Go beyond the `tmuxSnapshotParse` parser，但仅作为 staged gate；v0.6.50 随后实现 first implementation slice：Go now owns the narrow tmux snapshot capture adapter，`captureTmuxSnapshot(capturedAt) delegates to createAgentTeamKernelAdapter().captureTmuxSnapshot(capturedAt)`；v0.6.51 新增 `core/kernelContract.ts` 与 `deferred-current-path-guarded` artifact naming gate，current embedded native path remains `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc`，future broader names such as `agentteamKernel` or `agentteamControlPlaneCore` remain decision options；v0.6.52 新增 worker lifecycle contract gate：`workerLifecycle` remains `design-only-not-runtime-capability`，per-call helper remains acceptable initially，long-lived helper is deferred until state/panel/high-frequency paths；v0.6.53 activates `workerLifecycle` only for read-only `inspectPane` with `advertise-workerLifecycle-for-inspectPane-only`，create/wake/label/kill remain TypeScript-owned and unmigrated；v0.6.54 adds read-only `listAgentTeamPanes` in Go with compact labeled-pane semantics；v0.6.55 cuts over `tmux/core.ts listAgentTeamPanes() delegates to createAgentTeamKernelAdapter().listAgentTeamPanes()` and the TypeScript tmux list-panes fallback for listAgentTeamPanes is removed；v0.6.56 cuts over `tmux/core.ts inspectPane(paneId) delegates to createAgentTeamKernelAdapter().inspectWorkerPane(paneId)` and the TypeScript display-message fallback for inspectPane is removed；v0.6.57 cuts over `tmux/core.ts paneExists(paneId) delegates to the Go-backed inspectPane(paneId) facade` and the TypeScript display-message fallback for paneExists is removed；v0.6.58 cuts over `resolvePaneBinding(paneId)` to Go-backed `workerLifecycle.inspectPane` after adding compact `target`；v0.6.59 cuts over `targetForPaneId(paneId)` to `resolvePaneBinding(paneId)?.target ?? null`；v0.6.60 cuts over `captureCurrentPaneBinding()` to narrow Go-backed `workerLifecycle.captureCurrentPaneBinding` while preserving the outside-tmux guard；`resolvePaneBindingAsync`、window helpers and mutating lifecycle remain TypeScript-owned；state repository、task/report/PlanRun、team panel view-model、package/release 仍未迁移。
- 证据已纳入或引用：`docs/perf/v0.6.38-p95-evidence.md`、`docs/perf/v0.6.38-true-operator-manual-rc-pass-evidence.md`、`docs/perf/v0.6.39-task-message-report-p95.md`、`docs/perf/v0.6.41-fsstore-lock-wait-p95.md`、`docs/perf/v0.6.42-data-change-render-debounce.md`、`docs/perf/v0.6.42-spawn-bookkeeping-p95.md`、`docs/perf/v0.6.43-readiness-evidence-reconciliation.md`、`docs/perf/v0.6.44-go-cutover-candidate-selection.md`、`docs/perf/v0.6.45-tmux-snapshot-cutover-gate-prep.md`、`docs/perf/v0.6.46-default-go-readiness-approval-gate.md`、`docs/perf/v0.6.47-non-mutating-default-go-dry-run.md`、`docs/perf/v0.6.48-default-go-cutover-tmux-snapshot.md`、`docs/perf/v0.6.49-go-control-plane-expansion-gate.md`、`docs/perf/v0.6.50-go-tmux-snapshot-capture-cutover.md`、`docs/perf/v0.6.51-contract-constants-artifact-naming-gate.md`、`docs/perf/v0.6.52-worker-lifecycle-contract-gate.md`、`docs/perf/v0.6.53-go-inspect-pane-worker-lifecycle.md`、`docs/perf/v0.6.54-go-list-agentteam-panes-worker-lifecycle.md`、`docs/perf/v0.6.55-go-list-agentteam-panes-facade-cutover.md`、`docs/perf/v0.6.56-go-inspect-pane-facade-cutover.md`、`docs/perf/v0.6.57-go-pane-exists-facade-cutover.md`、`docs/perf/v0.6.58-go-resolve-pane-binding-facade-cutover.md`、`docs/perf/v0.6.59-go-target-for-pane-facade-cutover.md`、`docs/perf/v0.6.60-go-current-pane-binding-facade-cutover.md`。其中 v0.6.39 的 large-mailbox fail 已被 v0.6.40 validation-cache optimization 后的 pass evidence supersede。
- 仍需治理：最终 v0.7 readiness checkpoint 仍未启动；release/tag/npm/package/signing/second-platform 决策仍未授权；任何 final `ready:true` 仍需单独的 leader/user release-governance task。v0.6.49 改变的是 post-v0.6.49 architecture direction，不自动迁移所有 runtime ownership。
- 明确禁止：当前状态仍不授权 `npm version`、`npm publish`、tag、GitHub release、second-platform、signing 或 package-manager native delivery；也不授权 hidden scheduler/autopilot、worker-spawns-worker、peer report auto-task creation 或破坏 legacy `teams/-`。

因此当前仍为 `ready:false`。v0.6.43 只对账并关闭/替换旧 evidence blocker 口径；它不是 v0.7 release-ready、tag、npm、default-Go、native 或 package approval。v0.6.44 在此基础上进入 Go cutover candidate selection：推荐 `tmuxSnapshotParse` / tmux snapshot parser 作为第一个 future Go-owned runtime 候选，但仍是 planning/evidence only。v0.6.45 在 v0.6.44 选中的 `tmuxSnapshotParse` 基础上准备 cutover gate。v0.6.46 default-Go readiness approval gate 已启动/完成。v0.6.47 在此基础上实现真实 non-mutating default-Go dry-run runtime/verifier path。v0.6.48 在 user-approved main-package embedded helper layout 下完成 actual default-Go cutover for `tmuxSnapshotParse`：default/unset 与 explicit `go` 进入 embedded helper cutover path，runtime TypeScript parser fallback 删除。v0.6.49 进一步将路线从 bounded helper 扩展为 staged Go control-plane expansion：`docs/decisions/0003-go-control-plane-expansion.md` supersedes the future-only “Go must not own control plane” boundary in ADR 0001/0002 for work after v0.6.49；后续迁移顺序为 tmux capture → worker lifecycle → state repository → task/report/PlanRun → team panel view-model → package/release verification；其中 v0.6.50 已完成 tmux capture narrow cutover。v0.6.51 在继续迁移前先新增 contract/constants consolidation 与 artifact naming/module path decision gate：`core/kernelContract.ts` centralizes TS-side constants，current embedded native path remains `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc`，future broader names such as `agentteamKernel` or `agentteamControlPlaneCore` remain decision options；no native path/binary rename、no runtime migration、no package/release action。v0.6.52 进一步把 worker lifecycle 先冻结为 design-only contract gate：`workerLifecycle` remains `design-only-not-runtime-capability`，per-call helper remains acceptable initially，long-lived helper is deferred until state/panel/high-frequency paths。v0.6.53 then activates `workerLifecycle` only for read-only `inspectPane`：Go uses read-only `tmux list-panes -a -F workerLifecycleInspectPaneFormat`，unsupported operations fail closed，create/wake/label/kill remain TypeScript-owned；no package/release/native rename action。v0.6.54 adds the second read-only operation, `listAgentTeamPanes`, via Go `tmux list-panes -a -F tmuxPaneSnapshotFormat` with compact labeled-pane filtering。v0.6.55 cuts over the TypeScript facade for `listAgentTeamPanes` to the Go adapter and removes that facade's TypeScript tmux fallback。v0.6.56 cuts over the TypeScript facade for `inspectPane` to the Go adapter and removes that facade's TypeScript `display-message` fallback。v0.6.57 cuts over the TypeScript facade for `paneExists` to the Go-backed `inspectPane` facade and removes that facade's TypeScript `display-message` fallback。v0.6.58 cuts over `resolvePaneBinding(paneId)` to Go-backed `workerLifecycle.inspectPane` after adding compact `target`。v0.6.59 cuts over `targetForPaneId(paneId)` to `resolvePaneBinding(paneId)?.target ?? null`。v0.6.60 cuts over `captureCurrentPaneBinding()` to narrow Go-backed `workerLifecycle.captureCurrentPaneBinding` while preserving the outside-tmux guard；`resolvePaneBindingAsync`、window helpers and mutating lifecycle remain TypeScript-owned。后续 broader worker lifecycle 实现仍需独立 parity/fail-closed/no-leak/rollback gate。

### 0.5 当前执行路线（唯一当前主计划）

新的推进顺序如下，后文历史 patch plan 只作为背景，不再覆盖此处：

1. **Evidence reconciliation**：v0.6.38-v0.6.43 evidence 已进入 repo 轨道；继续保持 pass/fail/blocked/not-covered 事实口径，不把 focused evidence 升格为 release approval。
2. **p95 evidence map 收口**：task/message/report normal 与 large-mailbox、fsStore lock wait、data-change render debounce、spawn bookkeeping 均已有 focused pass evidence 与 no-leak/governance guard；旧 large-mailbox blocker 与旧 missing-gate rows 标记为 superseded/covered，而不是删除历史审计记录。
3. **真实 manual RC**：真实 operator/model manual RC 主 checklist 已通过；T129 PlanRun cancel follow-up 已由任务板验收为 pass，但 ignored 本地 evidence 不纳入 repo，除非后续单独授权并加 no-leak guard。
4. **v0.7 runtime burn-down**：围绕 state/read-model、tmux adapter、panel loop、Task/Report/PlanRun 做实际 runtime 改进和 P0 bug burn-down；Go 只作为明确授权模块的 bounded helper/kernel。
5. **v0.7 readiness checkpoint**：只有 broad validation、manual RC、focused p95 evidence、P0 bug burn-down、package/runtime invariants 与 release governance 全部完成并被单独授权后，才进入 final readiness decision；release/tag/npm/default-Go/native 仍需单独授权。

---

## 1. v0.7.0 定位

```text
v0.7.0 = core refactor + performance baseline + bug burn-down release
```

v0.7.0 不是普通稳定化补丁；它必须在 v0.7 时完成 AgentTeam 核心协作链路的重构，并用可测数据证明性能改善。

v0.7.0 必须交付：

1. Team Identity 重构。
2. State Store/Read Model 重构。
3. Tmux Adapter 重构。
4. `/team` Panel Data Source / Render Loop 重构。
5. Task/Report/PlanRun 重构。
6. Config Bootstrap/Schema 重构。
7. 性能 baseline、profiling harness 和 release gate。
8. 已知 P0 bug burn-down。

v0.7.0 的 release 标准：

- 不能只写“显著缓解”，必须有 baseline、p95 指标和对比。
- 不能把 project/team identity、state read model、tmux/panel 重构推迟到 v0.8+。
- 不能用 Rust/Go rewrite 替代当前 TypeScript seam 重构。
- 不能把 Go kernel 作为默认控制平面；但允许把通过 cutover gate 的模块升级为 Go-owned runtime。迁移期 fallback 不能变成长期双轨实现，必须有删除计划。
- 不能通过默认 autopilot 掩盖 report/task governance 的可靠性问题。

---

## 2. 六条核心重构主线

### 2.1 Team Identity 重构（P0）

#### v0.4.13 已完成行为

v0.4.13 已把 Team Identity / Name Scope 的 P0 safety 行为落地为 GitHub-only checkpoint：

- 新 team name 会先生成 safe ASCII slug，并 trim 外层 `.`、`_`、`-` separator；例如 `---Shared Team---` / `...Shared Team...` 归一化为 `shared-team`。
- `---`、`!!!`、`。。。`、中文-only 等无法产生安全 ASCII slug 的名称会拒绝，并提示用户提供显式 ASCII slug/name；不会创建、查找、复用或 attach 到 `teams/-`。
- legacy `teams/-` 与 legacy no-identity teams 只读安全保留：不自动删除、重命名、迁移、接管或恢复；read/list/panel/session lookup 路径不写回 legacy `team.json`。
- 新 identity 使用 scoped shape：`teamId/projectKey/displayName/slug/legacyName?`。`legacyName?` 只用于 legacy/effective identity 标记，不会出现在普通新 team identity 中。
- create lookup 以 `projectKey + slug` 为主；不同 project 下同 display/slug 可共存，同 project duplicate/alreadyAttached/collision details 包含 existing `cwd/windowTarget/paneId/sessionFile`。
- session binding 持久化 identity-first fields：`teamId/projectKey/identityKey/teamSlug`，同时保留 legacy `teamName/memberName` compatibility 与 fallback。
- repository `/team` read model 与 global panel 对 legacy no-identity teams 暴露 compact/effective identity（display/name、slug/storage key、legacyName marker、stable legacy teamId/projectKey），但不读取 mailbox/report full body，不标记 read/delivered。

#### v0.7.0 目标

v0.7.0 从“全局 sanitized name”升级为内部 identity：

```ts
type TeamIdentity = {
  teamId: string
  projectKey: string
  displayName: string
  slug: string
  legacyName?: string
}
```

目标行为：

- create lookup 以 `projectKey + slug` 为主。
- session binding 内部存 `teamId`，兼容读取 legacy `teamName`。
- `/team` global console 仍能列出所有 teams。
- legacy `teams/<oldName>` 可读、可恢复，但不自动重命名、不自动接管、不自动删除。
- 新 team/member slug 必须 trim separators，并且至少包含 `[a-z0-9]`。
- 中文-only/标点-only 名称必须清晰拒绝，并提示用户提供显式 ASCII slug。
- active collision error 必须显示 existing `leaderCwd/windowTarget/paneId/sessionFile`。
- 不默认引导 `/team recover`；只有明确 stale team 场景才提示 recover。

#### 主要涉及区域

```text
core/teamIdentity.ts
adapters/runtime/rules.ts
state/paths.ts
state/teamStore.ts
state/sessionBinding.ts
tools/teamService.ts
tools/workerSpawnService.ts
commands/teamActions.ts
teamPanel/dataSource.ts
internalTypes.ts
```

#### 验收标准

- `team_name: "基础员工团队"` 不创建、不查找、不复用 `teams/-`。
- legacy `teams/-` 不被迁移脚本删除、重命名或接管。
- 不同 project 下同 display name 不互相阻塞。
- 如果 v0.7 最终仍保留 global uniqueness，必须有 explicit global conflict 文案；但推荐 v0.7 完成 scoped identity。
- collision error 中能看到 existing cwd/window/pane/sessionFile。

---

### 2.2 State Store / Read Model 重构（P0）

#### 当前问题

当前 state store 的基础实现是 file-backed JSON：

- 同步整文件 JSON read/write。
- `.lock` 文件保护更新。
- team/mailbox/outbox/runtime/task history 多处各自读写。
- panel 和 runtime 路径可能重复读取、排序、构造 full state。
- `/team` 当前容易越过 summary 边界读取过多 mailbox/report 数据。

这会放大 lock wait、parse time、write time 和 panel warm refresh 延迟。

#### v0.4.14 已完成行为

v0.4.14 已把 State Store / Read Model P0 的边界与 profiling baseline 建成 GitHub-only checkpoint：

- Panel compact sidecars 已落地：`teams/<team>/team-panel.json` 保存无 full report body 的 team/task/member/report/message-ref summary，`teams/<team>/inboxes/<member>.panel.json` 保存无 full mailbox body 的 mailbox summary。
- `/team`/repository panel read-model 路径优先读取 compact sidecars，不读取 full `MailboxMessage.text` 或 `TaskReport.text` source；compact snapshots 也不会把 raw `taskReports`、`taskEvents`、`taskMessageRefs` full state 泄漏成 panel model。
- 显式 full-text/read boundary 保持不变：`agentteam_receive` 仍是 mailbox full-text/read boundary，`agentteam_task action=report` 仍是 TaskReport full-text boundary。
- Hot `agentteam_task show` current-team lookup 改为 precise session identity lookup：先验证当前 session `teamId/projectKey/teamSlug/identityKey`，避免为了 show 当前任务扫描 decoy teams。
- `fsStore` operation-level profiling 已接入 `PI_AGENTTEAM_PROFILE=1`，事件字段包括 `lockWaitMs`、`readMs`、`parseMs`、`writeMs`、`bytes`、`callSite`，并保留 `category`/`operation` 方便 breakdown。
- Deterministic microbench baseline 已新增：fixture 为 1 leader、3 workers、100 tasks、500 mailbox items，stub tmux/runtime，包含 warm refresh iterations、JSON summary、fixture sizes、dataLoad/readModel/fsStore percentiles、bytes、callSite/category breakdown 和 tmux count；该结果是 baseline/profiling gate，不是 p95 target pass/fail 声明。

#### v0.7.0 目标

v0.7.0 必须建立清晰 StateRepository/RuntimeRepository seam：

- 业务层通过 ports/read model 访问 state，不散落 raw file calls。
- 为 panel 增加 compact read model：
  - team summary
  - member health summary
  - task counts/latest history
  - leader mailbox summary
  - outbox diagnostics summary
- panel summary 不读取 full mailbox body，不读取 full report body。
- `agentteam_receive` 与 `agentteam_task report` 仍是 full-text boundary。
- `fsStore` 增加 profiling：lock wait、read bytes、parse time、write time、call site。
- 为 mailbox/outbox append-only + compact/read-index 留后续 seam；v0.7 不强制引入 SQLite。

#### 主要涉及区域

```text
state/fsStore.ts
state/teamStore.ts
state/mailboxStore.ts
state/outboxStore.ts
state/runtimeStore.ts
state/taskHistoryReadModel.ts
app/ports.ts
adapters/runtime/*Ports.ts
teamPanel/dataSource.ts
```

#### 验收标准

- send/report/task mutation 输出与旧 fixture 等价。
- state profiling 可输出 p50/p95 lock/read/write 指标。
- 单个 action 不做无关 team 全量扫描。
- panel 数据读取不需要 full mailbox/report bodies。
- `agentteam_receive`/`agentteam_task report` 仍是 full-text read boundary。

---

### 2.3 Tmux Adapter 重构（P0）

#### 当前问题

当前 tmux client 每次调用都启动 tmux subprocess。panel/reconcile 路径如果对每个 member 执行 `display-message`/pane check，会直接造成：

- panel 打开慢。
- refresh 抖动。
- worker 输出期间 `/team` 闪烁。
- 无法判断性能瓶颈来自 tmux、state 还是 render。

#### v0.4.15 已完成行为

v0.4.15 已把 Tmux Adapter + `/team` Panel Refresh Stability Gate 的 P0 安全行为落地为 GitHub-only checkpoint：

- ordinary attached/global `/team` refresh 显式使用 light reconcile intent；无显式 force 时不会传 `force: true`，不会逐 member 执行昂贵 `display-message` 检查。
- global warm refresh 通过一次 tmux snapshot/list-panes 发现 panes/orphans，而不是对每个 team/member 启动 tmux subprocess。
- light mode 下 snapshot/list-panes failure 被视为 unknown/stale：不清空 `paneId/windowTarget`，不写 `lastWakeReason: 'pane lost'` 或 `lastError: 'tmux pane disappeared'`，不自动把 active worker 标为 `error`。
- explicit `{ mode: 'force' }` / force reconcile 仍保留为手动/显式路径，允许 expensive per-pane checks；它不属于普通 panel refresh。
- tmux profiling 继续记录 command count、duration、success/failure 和 command names，并进入 explicit bench/profiling 输出。

#### v0.7.0 目标

v0.7.0 必须继续把 tmux 访问深化为 adapter + snapshot/cache 模型：

- 新增 `TmuxSnapshot`：一次 `list-panes -a -F` 返回 paneId/target/currentCommand/labels 等必要字段。
- `paneExists`、`resolvePaneBinding`、`reconcileTeamPanes` 在 panel/reconcile 路径优先使用 snapshot/cache。
- 区分 light health check 与 explicit force reconcile。
- panel render 不触发 force reconcile。
- profiling 记录 tmux command count、duration、success/failure。

#### 主要涉及区域

```text
tmux/client.ts
tmux/core.ts
tmux/process.ts
adapters/tmux/index.ts
adapters/tmux/teamPanes.ts
adapters/runtime/session.ts
teamPanel/dataSource.ts
```

#### 验收标准

- `/team` attached warm refresh 在无手动 reconcile 时 tmux commands = 0 或极少。
- `/team` global warm refresh 使用一次 tmux snapshot，而不是对每个 member 调 tmux。
- 普通 refresh 不对每个 member 调 `display-message`。
- worker spawn 的 tmux pane create、waitForPaneAppStart、bridge ready wait 不被破坏。

---

### 2.4 `/team` Panel Data Source / Render Loop 重构（P0）

#### 当前问题

用户明确反馈：pi 正在工作时打开 `/team` 面板会持续闪烁。

历史候选根因包括：

- panel action 后 close/reopen（v0.4.15 已改为 refresh/sync in-place update）。
- 每次 load 强制 reconcile（v0.4.15 普通 refresh 已改为 explicit light intent，force 仅保留为手动/显式路径）。
- data source 每次重建完整 view model。
- mailbox projection、leader attention、`ui.notify` 与 panel render 竞争。
- tmux label/list-panes churn。
- 缺少 diff/debounce/cache（v0.4.15 已建立 fingerprint/cacheHit/diffChanged profiling gate）。

#### v0.4.15 已完成行为

v0.4.15 已把 `/team` Panel Refresh Stability Gate 的核心稳定性行为落地：

- refresh 与 sync/action 使用 in-place update：保持同一个 `ctx.ui.custom` mounted panel，刷新当前 panel data，不 close/reopen；`q`/close 仍显式调用 close/done。
- render loop 使用 data/state fingerprint：no-diff refresh 记录 cacheHit 并跳过 requestRender；semantic diffChanged 才 requestRender。
- worker-output-like/no-semantic invalidation 已有 coalescing guard，避免 requestRender/render count 无界增长；semantic changes 仍能触发 render。
- panel profiling 字段已接入 `PI_AGENTTEAM_PROFILE=1`：`dataLoad`、`readModelBuild`、`render`、`requestRender`、`cacheHit`、`diffChanged`，普通用户输出不污染。
- deterministic `npm run bench:team-panel-tmux` baseline 已新增，覆盖 attached/global warm refresh、render/dataLoad p50/p95、tmux command count、requestRender/cacheHit/diffChanged；它是 baseline/profiling gate，不是最终 p95 target pass/fail 声明。
- `/team` 继续保持 v0.4.14 compact/full-text boundary：不读取 `MailboxMessage.text` / `TaskReport.text` full bodies，不标记 mailbox `readAt` / `deliveredAt`。

#### v0.7.0 目标

`/team` 必须继续深化为稳定 cockpit：

- panel actions in-place 完成，不重开整屏组件。
- data source 做 cached snapshot、diff 和 debounce。
- state changed 才 requestRender。
- layout 输出高度稳定，避免无变化重绘。
- panel 打开期间将非关键 notify 收敛到 panel attention/status 行。
- 添加 debug flag：render count、data load time、tmux command count、cache hit。

#### 主要涉及区域

```text
commands/team.ts
teamPanel.ts
teamPanel/dataSource.ts
teamPanel/viewModel.ts
teamPanel/input.ts
teamPanel/layout.ts
teamPanel/layoutLists.ts
teamPanel/layoutFormat.ts
runtime/leaderProjectionService.ts
runtime/leaderAttention.ts
```

#### 验收标准

- worker 正在输出/bridge wake 时，leader 打开 `/team` 不持续闪烁。
- 手动 refresh/reconcile 仍可用。
- mailbox/task/member 状态在合理时间内更新。
- `/team` 不标记 mailbox read/delivered。
- `/team` 不成为 full-text mailbox reader。

---

### 2.5 Task/Report/PlanRun 重构（P0）

#### 当前问题

当前有两个相关可靠性问题：

1. worker 偶发完成工作但没有提交 `report_done/report_blocked`。
2. 用户批准 planner plan 后，leader 审核一个 report 后执行链容易停住，需要用户反复催促。

这不能靠默认 autopilot 解决。v0.7.0 要重构的是协议可靠性和受控执行状态，而不是放弃 leader governance。

#### v0.7.0 目标：Report reliability

- worker system prompt 和 assignment delivery 必须把 `report_done/report_blocked` 作为 completion contract。
- task-bound assignment 最后一屏也要明确 report instruction。
- worker idle/open owned task/no report 状态必须在 `/team` 可见。
- 提供 leader nudge：提醒 owner 提交报告。
- report side effect 要有 diagnostics。
- 不伪造 worker report。
- 不由 leader 代写 worker report 来掩盖协议失败。

#### v0.7.0 目标：Approved PlanRun

v0.4.9 已完成 Approved PlanRun MVP 的基础链路；v0.4.10 已补齐 completion/recovery hardening；v0.4.11 已补齐 first-class failure/limits hardening，使 PlanRun 能在 leader-gated、compact-only、无自动化的前提下完成多步闭环并显式处理失败/限制。当前显式 PlanRun 状态保持 compact：

```ts
type PlanRun = {
  id: string
  sourceReportId: string
  status: 'approved' | 'active' | 'waiting_review' | 'paused' | 'cancelled' | 'done'
  currentStepIndex: number
  activeTaskId?: string
  pauseReason?: 'report_blocked' | 'question' | 'watchdog' | 'waiting_for_report' | 'leader_paused' | 'validation_failed' | 'test_failed' | 'limit_reached'
  limits?: {
    maxSteps?: number
    maxConsecutiveSteps?: number
    deadlineAt?: number
    maxDurationMs?: number
  }
  limitState?: {
    stepsStarted: number
    consecutiveStepsStarted: number
    lastLimitCheckAt?: number
    lastLimitReached?: {
      kind: 'max_steps' | 'max_consecutive_steps' | 'deadline' | 'duration'
      at: number
      value?: number
      limit?: number
    }
  }
  steps: Array<{
    id: string
    index: number
    title: string
    owner?: string
    taskId?: string
    status: 'pending' | 'assigned' | 'open' | 'waiting_review' | 'done' | 'blocked' | 'skipped'
  }>
}
```

v0.4.9/v0.4.10/v0.4.11 已落地规则：

- `approve` 必须由 leader 明确指定 `sourceReportId` 且 `confirmApproved=true`；approve 只创建 compact PlanRun，不创建 task。
- `advance(planRunId)` 必须显式调用；每次只创建一个当前 step task，并写 compact created/assigned audit。
- 当前 step task 仍 `open`/`waiting_review`/`blocked` 时，重复 `advance` 被拒绝，不创建第二个 task。
- owner `report_done` 后 task 仍保持 `open`；PlanRun/step 进入 `waiting_review`，等待 leader review/close。
- leader `close` active step task 后，step 进入 `done`，`currentStepIndex` 指向下一 pending step；最后一步 close 后 PlanRun 进入 `done`。
- owner `report_blocked` 后 task 仍保持 `open`；PlanRun 进入 `paused` 且 `pauseReason=report_blocked`，不自动 block task。
- owner 对 active step task 发 task-bound `question` 后，PlanRun 进入 `paused` 且 `pauseReason=question`，task 不自动 block/close/reassign。
- leader-only `pause/resume/cancel` 已实现；`pauseReason=leader_paused` 默认，支持手动 pause。
- first-class `signal_failure` 已实现，支持 compact `validation_failed` / `test_failed`，不解析 report/test logs，不改 task 状态。
- `approve` 可存储 optional compact limits：`maxSteps`、`maxConsecutiveSteps`、`deadlineAt`、`maxDurationMs`，并初始化 compact `limitState`。
- explicit `check_limits` 已实现，只在 leader 显式调用时评估 limits；触发后 PlanRun `paused` 且 `pauseReason=limit_reached`，写 compact `limit_reached` event。
- `show/list/task show/digest` 和 `/team` 只显示 compact PlanRun hint/projection，不读取 `TaskReport.text` 或 `MailboxMessage.text`。
- `dryRun=true` 可预览 `advance/pause/resume/cancel/signal_failure/check_limits`，不分配 id、不改 seq、不写 event/mailbox、不改变 PlanRun/task 状态。
- watchdog/no-report 以 compact attention 暴露，不自动 nudge、不自动 advance。
- 不存在 hidden scheduler/autopilot/timer；deadline/duration limit 不后台检查，只在 explicit leader action 中检查；不自动 advance/close/block/reassign/nudge；不允许 worker 创建任务或派发 worker。

PlanRun 后续规则：

- 更丰富的外部 CI/test integration 可在 first-class `signal_failure` seam 之上继续扩展，但不得存储 raw logs/full text。
- step/time policy 的 config defaults 仍需单独设计，且不得引入 hidden scheduler/default autopilot。
- 所有动作写入 compact PlanRunEvent/task/report/history。

#### 主要涉及区域

```text
workerTurnPrompt.ts
tools/workerPrompt.ts
agents/*.md
runtime/bridgeDeliveryPump.ts
app/taskReportWorkflow.ts
app/taskSideEffects.ts
app/taskApplication.ts
runtime/leaderAttention.ts
runtime/leaderMailboxSignalRuntime.ts
teamPanel/viewModel.ts
teamPanel/layout.ts
```

#### 验收标准

- assignment prompt 清楚要求 owner 最终调用 `report_done/report_blocked`。
- worker 完成但不 report 的情形可见、可提醒、不会被 leader 伪造 report 掩盖。
- 无 approved PlanRun 时，不自动创建下游任务。
- `approve` 不创建 task；`advance` 才创建一个 step task。
- worker `report_done` 后 PlanRun compact `waiting_review` 可在 `agentteam_task show`、leader digest 和 `/team` compact projection 中看到。
- leader close 后显式 advance 到下一 step 的多步链路可完成，最后一步 close 后 PlanRun `done`。
- worker `report_blocked` 后 PlanRun compact `paused/report_blocked` 可在 `agentteam_task show`、leader digest 和 `/team` compact projection 中看到。
- owner task-bound question 可 pause active PlanRun step，且不会自动 block/close/reassign task。
- `pause/resume/cancel` leader-only，可审计且无 task/mailbox side effects。
- `signal_failure` 可 first-class 表达 validation/test failure，且不会自动 block/close/reassign task。
- `check_limits` 可显式评估 max steps/consecutive steps/deadline/duration，limit reached 时 pause 且不创建 task/mailbox/nudge。
- `dryRun=true` preview 不分配 id、不改 seq、不写 event/mailbox。
- 每步都有 task/report/PlanRunEvent 历史，且 compact surfaces 不泄漏 full body。
- 外部 CI/test source integration 和 limit config defaults 仍作为 v0.7 后续增强项。

---

### 2.6 Config Bootstrap / Schema 重构（P0）

#### 已解决的历史问题

v0.4.12 之前，runtime config 主要是 legacy `agentModels` 形态：

```json
{
  "agentModels": {
    "researcher": null,
    "planner": null,
    "implementer": null
  }
}
```

历史不足：

- 没有 version。
- 结构只覆盖 model，不方便承载 automation/ui/identity 等配置。
- fresh runtime 缺少 first-run bootstrap 策略。
- npm install/postinstall 不知道真实 `PI_AGENTTEAM_HOME`、pi runtime 和 workspace，不适合写用户 runtime state。

#### v0.4.12 已完成行为 / v0.7.0 目标 schema

v0.4.12 已把 Config Bootstrap / Schema 重构 P0 的 runtime-facing 行为落地为 v1 schema：

```json
{
  "version": 1,
  "agents": {
    "researcher": { "model": null },
    "planner": { "model": null },
    "implementer": { "model": null }
  },
  "automation": {
    "mode": "manual",
    "approvedPlan": {
      "enabled": true,
      "maxConsecutiveSteps": 5
    }
  },
  "ui": {
    "teamPanel": {
      "refreshMode": "debounced",
      "minRefreshMs": 250
    }
  }
}
```

已完成策略：

- first-run missing config UX：`/team config show` 显示 config path、`Exists: no` 和 `/team config init` 引导，但不隐式写文件。
- `/team config init` 使用 bundled `config.example.json` 创建完整 v1 config，且 non-overwrite，已有用户 config byte-for-byte 保留。
- npm/pi install 与 npm lifecycle 不写 runtime state；真实 runtime config 只在用户显式 init 或手动编辑时出现。
- legacy `agentModels` 可读，并输出 legacy/migration warning；unknown role、invalid shape/value、unsupported `deliveryMode` 继续 compact/actionable diagnostics。
- `agents.<role>.model` 是主 schema；已有 v1 值优先于 legacy；effective model source metadata 为 `v1 | legacy | null | default`，spawn output/details 和 config surfaces 可见。
- `/team config show|validate|init|migrate --dry-run` 已实现；`migrate --dry-run` 生成 proposed v1 preview（`version`/`agents`/`automation`/`ui`），不写文件、不覆盖、不删除 legacy `agentModels`、不改 mtime。
- 配置变更是 future-spawn-only，只影响未来 spawn/respawn，不偷偷改变 running workers。
- repository `/team` panel read model 暴露 compact config projection：`exists`、可选 path、`schemaVersion`、`diagnosticCount`、effective role model/source；不 dump raw/full config，不读取 mailbox/report full body。

#### 主要涉及区域

```text
config.ts
config.example.json
commands/config.ts
agents.ts
tools/workerRole.ts
tools/workerSpawnService.ts
state/repository.ts
teamPanel/readModel.ts
README.md
```

#### 验收标准

- clean `PI_AGENTTEAM_HOME` 首次加载后，config 缺失不再让用户迷路，且不会隐式创建 runtime config。
- `/team config init` 支持 explicit first-run bootstrap，并拒绝覆盖已有 config。
- `agentModels` legacy 可读并提示迁移；`agents.<role>.model` 是主 schema 且优先级高于 legacy。
- spawn researcher/planner/implementer 时使用 effective model，并在结果/details 中显示 `modelLabel` 与 `modelSource`。
- `/team config migrate --dry-run` 只预览 proposed v1 schema，不写文件、不改 mtime、不覆盖用户配置。
- `/team` read model 只暴露 compact config projection，不泄漏 arbitrary full config 或 mailbox/report full bodies。

---

## 3. 性能指标与 profiling

v0.7.0 必须先建立 baseline，再证明优化。不能在没有 profiling 的情况下宣称 Rust/Go 或数据库必要。

### 3.1 profiling harness

v0.7.0 前必须能记录以下信号：

```text
fsStore:
  lockWaitMs
  readMs
  parseMs
  writeMs
  bytes
  callSite

tmux:
  command
  count
  duration
  success/failure

panel:
  dataLoadMs
  renderMs
  requestRenderCount
  cacheHit
  diffChanged

outbox:
  effect kind
  status
  duration

message/task/report app:
  action duration excluding LLM/provider

worker spawn:
  tmux pane create
  pi start wait
  bridge ready wait
  agentteam bookkeeping/enqueue duration
```

推荐开关：

```bash
PI_AGENTTEAM_PROFILE=1
```

普通用户输出不能被 profiling 噪音污染；profiling 应进入 debug log、diagnostics 或明确的 bench 输出。

v0.4.14 已完成 State Store / Read Model baseline/profiling gate：`npm run bench:state-read-model`（等价于 `PI_AGENTTEAM_PROFILE=1 node tests/bench/team-read-model-baseline.cjs`）使用 deterministic fixture 和 stub tmux/runtime 输出 JSON；输出包含 fixture sizes、warm/measured iteration counts、panel dataLoad/readModel timing percentiles、fsStore lock/read/parse/write timing与 bytes、callSite/category breakdown、tmux count，并验证 full-body sentinel 不泄漏。该 baseline 只用于后续对比和回归定位，不表示已达成最终 release p95 目标。

v0.4.15 已新增 Runtime/Panel/Tmux profiling 与 deterministic panel/tmux refresh baseline：`npm run bench:team-panel-tmux`（等价于 `PI_AGENTTEAM_PROFILE=1 node tests/bench/team-panel-tmux-refresh-v0415.cjs`）使用 fake tmux client、fake TUI 和 deterministic fixture 输出 JSON；输出包含 attached/global fixture sizes、warm/measured iteration counts、panel `dataLoad`/`render` p50/p95、`requestRender`/`cacheHit`/`diffChanged` counts、tmux command count/duration/success/failure，并验证 full-body sentinel 不泄漏。该 baseline 只说明 profiling gate established，不声称已达成最终 p95 release target。

### 3.2 release 性能门禁

使用“绝对目标 + 相对改善目标”双门禁：若机器/环境无法稳定达到绝对目标，必须证明相对当前 baseline 改善至少 50%。

#### Attached `/team` warm refresh

fixture：

```text
1 leader
3 workers
100 tasks
500 mailbox items
```

目标：

- p95 data load <= 100ms。
- render <= 16ms。
- 无状态变化时不重复 requestRender。
- 普通 refresh 不做 force reconcile。
- tmux commands <= 1。

#### Global `/team` warm refresh

fixture：

```text
10 teams
每 team 3 workers
每 team 若干 tasks/mailbox
```

目标：

- p95 data load <= 200ms。
- tmux panes 使用一次 snapshot。
- 不对每个 team/member 逐个执行 tmux subprocess。

#### Task/message/report app action

范围不含 LLM/provider，不含 worker 实际处理时间。

目标：

- create/assign/send/receive/report_done side-effect enqueue 普通 fixture p95 <= 50ms。
- large mailbox fixture p95 <= 150ms。

#### State I/O

目标：

- lock wait p95 <= 25ms in unit fixture。
- 单 action 不做无关 team 全量扫描。
- panel summary 不读取 full report body。
- `agentteam_receive`/`agentteam_task report` 才是 full-text boundary。

#### Flicker/redraw

目标：

- panel idle 时 render count 不随 worker output 持续增长。
- 数据变更 debounce <= 4 renders/sec。
- action 后不出现 close/reopen 全屏闪烁。

#### Worker spawn

目标：

- 不承诺缩短 `pi`/LLM 外部启动时间。
- 必须记录分段耗时。
- agentteam 自身 spawn bookkeeping/enqueue 部分 p95 <= 100ms。

### 3.3 验证方式

- 新增 tests/bench 或测试 helper，用 stub tmux + fixture state 跑 deterministic microbench。
- real tmux/pi smoke 验证交互体验。
- profiling 输出必须能定位 state、tmux、panel、outbox、spawn 的各自耗时。

---

## 4. 已知 bug 修复范围

### 4.1 Config/model/bootstrap

修复范围：

- versioned v1 config schema（`version`、`agents`、`automation`、`ui`）。
- first-run missing config UX 与 explicit non-overwrite bootstrap。
- legacy `agentModels` compatibility 与 migration warning。
- `/team config show|validate|init|migrate --dry-run` diagnostics/preview。
- effective model source metadata：`v1 | legacy | null | default`。
- future-spawn-only config behavior 与 `/team` compact config projection。

验收：

- clean `PI_AGENTTEAM_HOME` 首次加载后 config 缺失不再让用户迷路，也不隐式写 runtime config。
- `agentModels` legacy 可读，并提示迁移。
- `agents.<role>.model` 是主 schema，且优先于 legacy。
- validate 能报 unknown role、invalid shape/value、unsupported deliveryMode。
- migrate dry-run 可预览完整 proposed v1 config，且 no-write/no-overwrite/no-mtime-change。
- `/team` panel 只显示 compact config status/source summary，不 dump full config。

### 4.2 Team isolation / Chinese sanitizer

v0.4.13 已完成修复范围：

- slug hardening：separator-wrapped safe name trim 为 safe ASCII slug；中文-only/标点-only 安全拒绝并给 ASCII guidance。
- legacy safety：legacy `teams/-` 与 no-identity teams 不被误删、误迁移、误重命名、误接管或误恢复。
- scoped identity：`teamId/projectKey/displayName/slug/legacyName?`，跨 project 同 display/slug 可共存。
- safer collision copy：same-project duplicate/alreadyAttached/active collision details 显示 existing cwd/windowTarget/paneId/sessionFile。
- identity-first sessions：持久化 `teamId/projectKey/identityKey/teamSlug`，兼容 legacy `teamName/memberName`。
- legacy effective identity visibility：read model/global panel 可显示 legacy marker/legacyName/identity fields，read-only 路径不写回 legacy state。

验收：

- 中文-only team name 不变成 `-`，且不会创建/复用/attach `teams/-`。
- legacy `teams/-` 不被误删、误迁移、误重命名、误接管或误恢复。
- 不同 project 的同名 team 不互相阻塞。
- collision details 显示 cwd/windowTarget/paneId/sessionFile。

### 4.3 `/team` flicker

修复范围：

- panel in-place action。
- cached/debounced data source。
- tmux snapshot/cache。
- notification/status 收敛。
- layout stability。

验收：

- worker busy/outputting 时 `/team` 不持续闪烁。
- refresh/action 后不关闭重开 panel。
- 状态仍能在合理时间更新。
- `/team` 不读取 full text，不标记 mailbox read/delivered。

### 4.4 Worker no-report

修复范围：

- completion contract。
- task-bound final instruction。
- waiting-for-report attention。
- nudge action。
- report side-effect diagnostics。

验收：

- worker assignment prompt 明确 `report_done/report_blocked`。
- worker idle/open owned task/no report 状态在 `/team` 可见。
- leader 可发送 report reminder。
- 不伪造 worker report。
- 不自动 close。

### 4.5 Controlled PlanRun chain

修复范围：

- explicit user approval。
- PlanRun state。
- one-step-at-a-time leader progression。
- stop/pause conditions。
- `/team` PlanRun visibility。

验收：

- 没批准时不自动推进。
- 批准后可连续完成至少两步 implementer task。
- 每步有 task/report/close 历史。
- blocked/no report/test failure 立即 pause。

### 4.6 性能误判为语言问题

修复范围：

- 写入 Rust/Go 评估结论与 Slice 0 Go kernel decision record。
- profiling-first。
- TypeScript seam refactor。
- native helper 先作为按 profiling 触发的 replaceable optional kernel/helper 候选；进入模块 cutover 后，目标是删除该模块 TS runtime fallback。
- port audit 明确哪些 seam 可做 compact deterministic acceleration，哪些 seam 因治理/full-text/worker lifecycle 必须保留在 TypeScript control plane。

验收：

- 方案和 release plan 不承诺整体 Rust/Go。
- 方案和 release plan 明确 Go kernel 不是默认 runtime、不是 daemon、不是 worker、不是 hidden scheduler/autopilot。
- 性能改善必须通过 baseline/profiling 证明。
- native binary 发布矩阵不进入 v0.7 scope；任何未来 Go helper 在迁移期必须保持 TypeScript fallback 和 legacy compatibility，但 cutover 完成后应删除该模块 runtime fallback，改为 fail-closed diagnostics + release rollback。

---

## 5. 明确不做事项

v0.7.0 不做：

- 不整体 Rust rewrite。
- 不整体 Go rewrite。
- 不把 Go kernel 作为必需 runtime、独立 daemon、第二控制平面或 worker lifecycle owner。
- 不引入 native binary 发布矩阵。
- 不默认 autopilot。
- 不做 hidden scheduler。
- 不允许 worker-spawns-worker。
- 不允许 peer report 自动触发 planner/implementer。
- 不让 `/team` 成为 full-text mailbox reader 或 read boundary。
- 不改变 `report_done/report_blocked` 的治理含义。
- 不破坏 legacy `teams/-`。
- 不做破坏性 legacy migration。
- 不自动删除、重命名、接管旧 team state。

原因：

- pi extension/tool/command/TUI/hook/npm loading 强绑定 TypeScript/Node facade。
- 当前 P0 问题来自 identity、state/tmux/panel seam、report lifecycle、config bootstrap，而不是单纯语言选择。
- 默认 autopilot 和 worker-spawns-worker 会绕过 leader governance。
- `/team` 若成为 full-text read boundary，会破坏 `agentteam_receive` 的 mailbox readAt/deliveredAt 语义。
- legacy `teams/-` 可能仍承载真实用户 state，不能被 v0.7 自动迁移误伤。

---

## 6. 版本切片与 patch plan

### 6.0 当前路线总览（v0.6.38 → v0.7.0）

本节优先级高于后续历史 checkpoint 账本。后续 `v0.4.x`、`v0.6.x` 段落保留为审计背景，用来说明已经做过哪些 guard、fixtures、docs 和边界决策；它们不再定义当前下一步。

当前路线按可验证进展排序：

1. **v0.6.89 Go worker delivery boundary gate**：gate-only evidence that AgentTeam worker delivery is bridge-only TypeScript-owned outbox/bridge orchestration, not legacy terminal/tmux `send-keys` delivery；`deliveryPolicy.ts` remains `AgentTeamDeliveryPolicyName = 'bridge-only'`, config rejects legacy `deliveryMode`, `app/messageApplication.ts` / `app/taskSideEffects.ts` / `tools/workerSpawnService.ts` enqueue `worker_delivery_requested`, and `app/outbox.ts` / bridge runtime route to `requestWorkerDelivery` without terminal transport；this does not authorize Go `send-keys`, Go `wakePane`, terminal transport revival, or runtime cutover；future terminal/tmux wake/send-keys requires a separate explicit design gate with exact command surface, redaction/leak policy, state side effects, idempotency/rollback, bridge-only policy interaction, security model, and tests/manual evidence；no Go source/native rebuild, adapter method, native smoke key, package/release action, state/task/mailbox/governance migration, or UI migration，证据见 `docs/perf/v0.6.89-go-worker-delivery-boundary-gate.md`。
1. **v0.6.88 Go clearPaneLabelSync cutover**：`tmux/panes.ts clearPaneLabelSync(paneId)` delegates to synchronous `createAgentTeamKernelAdapter().clearPaneLabel(paneId)` while preserving the public no-throw/void facade；this reuses existing Go `workerLifecycle.clearPaneLabel` operation and its existing `tmux set-option -up -t <paneId> @agentteam-name` / `tmux select-pane -t <paneId> -T ''` argv-only command pair with compact `%123` pane-id validation and compact diagnostics/no raw stdout/stderr/helper output leakage；the hidden direct TypeScript `runTmuxNoThrow(['set-option', '-up', '-t', paneId, '@agentteam-name'])` and `runTmuxNoThrow(['select-pane', '-t', paneId, '-T', ''])` fallbacks are removed；no Go source/native rebuild or new native smoke key；`tmux/labels.ts clearPaneLabel(paneId, signal)`, clear-label/team kill orchestration, `killPane`, createTeammatePane, new-session/new-window, wake/send-keys, kill-window/kill-session/respawn, state/task/UI/release/package remain out of scope，证据见 `docs/perf/v0.6.88-go-clear-pane-label-sync-cutover.md`。
1. **v0.6.87 Go clearPaneLabelSync gate**：gate-only synchronous pane label cleanup contract；candidate is only `tmux/panes.ts clearPaneLabelSync(paneId)` replacing its two direct `runTmuxNoThrow(...)` calls (`runTmuxNoThrow(['set-option', '-up', '-t', paneId, '@agentteam-name'])` and `runTmuxNoThrow(['select-pane', '-t', paneId, '-T', ''])`)；future cutover should reuse existing Go `workerLifecycle.clearPaneLabel` rather than add a second operation；future Go may use only `tmux set-option -up -t <paneId> @agentteam-name` and `tmux select-pane -t <paneId> -T ''` with argv-only execution, compact `%123`-style pane-id validation, compact diagnostics/no raw stdout/stderr/helper output leakage, and current synchronous TypeScript no-throw/void behavior remains unchanged；`tmux/labels.ts clearPaneLabel(paneId, signal)`, `killPane`, createTeammatePane, new-session/new-window, clear-label/team kill orchestration, wake/send-keys, kill-window/kill-session/respawn, state/task/UI/release/package remain out of scope；no runtime migration, Go handler, adapter method, native rebuild, package/release action, or artifact rename，证据见 `docs/perf/v0.6.87-go-clear-pane-label-sync-gate.md`。
1. **v0.6.86 Go kill-pane cutover**：`tmux/panes.ts killPane(paneId)` delegates to synchronous `createAgentTeamKernelAdapter().killPane(paneId)` while preserving the public no-throw/void facade；Go `workerLifecycle.killPane` uses only `tmux kill-pane -t <paneId>` with argv-only execution, compact `%123`-style pane-id validation, compact diagnostics/no raw stdout/stderr/helper output leakage, and fail-closed adapter results；the hidden direct TypeScript `runTmuxNoThrow(['kill-pane', '-t', paneId])` fallback is removed for this kill-pane behavior；`clearPaneLabelSync(paneId)`, clear-label/team kill orchestration, wake/send-keys, kill-window/kill-session/respawn, state/task/UI/release/package remain out of scope；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.86-go-kill-pane-cutover.md`。
1. **v0.6.85 Go kill-pane gate**：gate-only destructive pane lifecycle contract；candidate is only `tmux/panes.ts killPane(paneId)` replacing `runTmuxNoThrow(['kill-pane', '-t', paneId])`；future Go may use only `tmux kill-pane -t <paneId>` with argv-only execution, compact `%123`-style pane-id validation, compact diagnostics/no raw stdout/stderr/helper output leakage, and preserve current no-throw/void public behavior through the TypeScript facade；current TypeScript-owned `killPane(paneId)` remains unchanged；`clearPaneLabelSync(paneId)`, clear-label/team kill orchestration, wake/send-keys, kill-window/kill-session/respawn, state/task/UI/release/package remain out of scope；no runtime migration, Go handler, adapter method, native rebuild, package/release action, or artifact rename，证据见 `docs/perf/v0.6.85-go-kill-pane-gate.md`。
1. **v0.6.84 Go detached new-window cutover**：`tmux/windows.ts ensureSwarmWindow(...)` delegates only the detached missing-agentteam-window `new-window` command to `createAgentTeamKernelAdapter().createDetachedSwarmWindowAsync(SWARM_SESSION, SWARM_WINDOW, signal)` after `findAgentTeamWindowTarget(SWARM_SESSION, signal)` cannot find the agentteam window；Go `workerLifecycle.createDetachedSwarmWindow` uses only `tmux new-window -t <SWARM_SESSION> -n <SWARM_WINDOW>` with argv-only execution, compact session/window validation, compact diagnostics/no raw stdout/stderr/helper output leakage, and current thrown create failure semantics preserved through the TypeScript facade；direct TypeScript `runTmuxAsync(['new-window'...])` fallback is removed for that detached missing-window behavior；post-create `findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)`, `Failed to locate agentteam tmux window after creation`, and `markWindowAsAgentTeam(initialTarget, signal)` remain TypeScript-owned/unchanged；detached `new-session`, inside-tmux branch, broader `ensureSwarmWindow(...)` orchestration, labels, createTeammatePane, wake/kill/state/task/UI/release/package remain out of scope；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.84-go-detached-new-window-cutover.md`。
1. **v0.6.83 Go detached new-window gate**：gate-only high-risk detached window creation contract；candidate is only the detached-branch `tmux/windows.ts ensureSwarmWindow(...)` `new-window` call when `findAgentTeamWindowTarget(SWARM_SESSION, signal)` cannot find the agentteam window after session handling；future Go may use only `tmux new-window -t <SWARM_SESSION> -n <SWARM_WINDOW>` with argv-only execution, compact `SWARM_SESSION`/`SWARM_WINDOW` validation, compact diagnostics/no raw stdout/stderr/helper output leakage, and current thrown create failure semantics preserved through the TypeScript facade；current TypeScript-owned `runTmuxAsync(['new-window', '-t', SWARM_SESSION, '-n', SWARM_WINDOW], undefined, signal)` remains unchanged；`new-session` changes, inside-tmux branch, broader `ensureSwarmWindow(...)` orchestration, post-creation lookup, marking/labels, and createTeammatePane remain out of scope；no runtime migration, Go handler, adapter method, native rebuild, package/release action, or artifact rename，证据见 `docs/perf/v0.6.83-go-detached-new-window-gate.md`。
1. **v0.6.82 Go detached new-session cutover**：`tmux/windows.ts ensureSwarmWindow(...)` delegates only the detached missing-session `new-session` command to `createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)`；Go `workerLifecycle.createDetachedSwarmSession` uses only `tmux new-session -d -s <SWARM_SESSION> -n <SWARM_WINDOW>` with argv-only execution, compact session/window validation, compact diagnostics/no raw stdout/stderr/helper output leakage, and current thrown create failure semantics preserved through the TypeScript facade；direct TypeScript `runTmuxAsync(['new-session'...])` fallback is removed for that detached missing-session behavior；`markWindowAsAgentTeam(`${SWARM_SESSION}:${SWARM_WINDOW}`, signal)` still runs after successful session creation；`new-window`, inside-tmux branch, broader `ensureSwarmWindow(...)` orchestration, post-creation lookup, marking/labels, and createTeammatePane remain out of scope；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.82-go-detached-new-session-cutover.md`。
1. **v0.6.81 Go detached new-session gate**：gate-only high-risk detached session creation contract；candidate is only the detached-branch `tmux/windows.ts ensureSwarmWindow(...)` `new-session` call when `createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)` reports the swarm session absent；future Go may use only `tmux new-session -d -s <SWARM_SESSION> -n <SWARM_WINDOW>` with argv-only execution, compact `SWARM_SESSION`/`SWARM_WINDOW` validation, compact diagnostics/no raw stdout/stderr/helper output leakage, and current thrown create failure semantics preserved through the TypeScript facade；current TypeScript-owned `runTmuxAsync(['new-session', '-d', '-s', SWARM_SESSION, '-n', SWARM_WINDOW], undefined, signal)` remains unchanged；`new-window`, inside-tmux branch, broader `ensureSwarmWindow(...)` orchestration, post-creation lookup, marking/labels, and createTeammatePane remain out of scope；no runtime migration, Go handler, adapter method, native rebuild, package/release action, or artifact rename，证据见 `docs/perf/v0.6.81-go-detached-new-session-gate.md`。
1. **v0.6.80 Go createTeammatePane cutover**：`tmux/panes.ts createTeammatePane(...)` delegates pane discovery/creation/layout/resize to `createAgentTeamKernelAdapter().createTeammatePaneAsync(...)` after keeping `ensureSwarmWindow(input.preferred, signal)` TypeScript-owned；Go `workerLifecycle.createTeammatePane` uses only `tmux list-panes -t <target> -F '#{pane_id}'`, the two `split-window` shapes, `select-layout main-vertical|tiled`, and `resize-pane -t <leaderPaneId> -x 66%`；`cwd` and `startCommand` remain opaque high-risk argv-only values with compact diagnostics/no raw-value leakage；direct TypeScript `runTmuxAsync` fallback for list/split/layout/resize is removed；post-create labels reuse the already Go-backed `setPaneLabel(...)` helper and refresh uses `refreshWindowPaneLabels(...)`；`ensureSwarmWindow(...)`, new-session/new-window, wake/send-keys, kill/destructive lifecycle, state/task/UI/release/package remain out of scope；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.80-go-create-teammate-pane-cutover.md`。
1. **v0.6.79 Go createTeammatePane gate**：gate-only high-risk pane creation/layout contract；candidate is only `tmux/panes.ts createTeammatePane(...)`；future Go may use only `tmux list-panes -t <swarm.target> -F '#{pane_id}'`, the two `split-window` shapes, `select-layout main-vertical|tiled`, and `resize-pane -t <leaderPaneId> -x 66%`；`cwd` and `startCommand` are opaque high-risk argv-only values with compact diagnostics/no raw-value leakage；`ensureSwarmWindow(...)` remains TypeScript-owned and new-session/new-window stay out of scope；labeling/refresh helpers remain already-Go-backed/unchanged；no runtime migration, Go handler, adapter method, native rebuild, package/release action, or artifact rename，证据见 `docs/perf/v0.6.79-go-create-teammate-pane-gate.md`。
1. **v0.6.78 Go pane label clearing cutover**：private `tmux/labels.ts clearPaneLabel(paneId, signal)` delegates to `createAgentTeamKernelAdapter().clearPaneLabelAsync(paneId, signal)`；Go `workerLifecycle.clearPaneLabel` uses only `tmux set-option -up -t <paneId> @agentteam-name` and `tmux select-pane -t <paneId> -T ''`；compact `%123` pane-id validation and compact diagnostics/no raw helper output leakage are preserved；direct TypeScript `set-option -up`/`select-pane -T ''` fallback is removed for `clearPaneLabel`；`clearPaneLabelsForTeam(...)` remains TypeScript-owned orchestration；setPaneLabel/window marking/refresh remain already-Go-backed and unchanged；new-session/new-window/pane creation/layout/wake/kill/state/task/UI/release/package remain out of scope；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.78-go-pane-label-clearing-cutover.md`。
1. **v0.6.77 Go pane label clearing gate**：defines the next narrow mutating tmux Go cutover gate without runtime mutation；authorized next runtime candidate is only private `clearPaneLabel(paneId, signal)`；future Go may use only `tmux set-option -up -t <paneId> @agentteam-name` and `tmux select-pane -t <paneId> -T ''`；current `clearPaneLabel` stays TypeScript-owned with the two direct no-throw calls；`clearPaneLabelsForTeam(...)` remains TypeScript-owned orchestration and still refreshes window pane labels afterward；setPaneLabel/window marking/refresh remain already-Go-backed and unchanged；new-session/new-window/pane creation/layout/wake/kill/state/task/UI/release/package remain forbidden；no Go source/native artifact rebuild，证据见 `docs/perf/v0.6.77-go-pane-label-clearing-gate.md`。
1. **v0.6.76 Go pane label setting cutover**：private `tmux/labels.ts setPaneLabel(paneId, label, signal)` delegates to `createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)`；Go `workerLifecycle.setPaneLabel` uses only `tmux set-option -p -t <paneId> @agentteam-name <label>` and `tmux select-pane -t <paneId> -T <label>`；label remains opaque Unicode/user-visible argv data and raw label diagnostics are forbidden；direct TypeScript `set-option -p`/`select-pane -T label` fallback is removed for `setPaneLabel`；`syncPaneLabelsForTeam(...)` remains TypeScript-owned orchestration；`clearPaneLabel`, new-session/new-window, pane creation/layout, wake/kill, state/task/UI/release/package remain TypeScript-owned/out of scope；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.76-go-pane-label-setting-cutover.md`。
1. **v0.6.75 Go pane label setting gate**：defines the next narrow mutating tmux Go cutover gate without runtime mutation；authorized next runtime candidate is only private `setPaneLabel(paneId, label, signal)`；future Go may use only `tmux set-option -p -t <paneId> @agentteam-name <label>` and `tmux select-pane -t <paneId> -T <label>`；label remains opaque Unicode/user-visible argv data and must not leak raw label diagnostics；at v0.6.75 current `setPaneLabel` and `clearPaneLabel` direct TypeScript calls remained in place, and v0.6.76 later implemented the authorized `setPaneLabel` cutover without migrating `clearPaneLabel`；after the actual cutover `tmux/labels.ts setPaneLabel` must not keep direct TypeScript `runTmuxNoThrowAsync(['set-option', '-p'...])` or `runTmuxNoThrowAsync(['select-pane', '-t', paneId, '-T', label]...)` fallback for the same behavior；clearPaneLabel/new-session/new-window/pane creation/layout/wake/kill/state/task/UI/release/package remain forbidden；no Go source/native artifact rebuild in the gate itself，证据见 `docs/perf/v0.6.75-go-pane-label-setting-gate.md`。
1. **v0.6.74 Go refresh window pane labels cutover**：`tmux/labels.ts refreshWindowPaneLabels(target, signal)` keeps `windowExists(target, signal)` and delegates to `createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)`；Go `workerLifecycle.refreshWindowPaneLabels` uses only `tmux set-option -w -t <target> pane-border-status top` and `tmux set-option -w -t <target> pane-border-format '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'`；direct TypeScript `runTmuxNoThrowAsync(['set-option', '-w'...])` fallback is removed for the same pane-border behavior；`markWindowAsAgentTeam(target, signal)` remains v0.6.72 Go-backed；public facade remains no-throw `Promise<void>`；pane labels/pane titles/new-session/new-window/pane creation/layout/wake/kill/state/task/UI/release/package remain TypeScript-owned；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.74-go-refresh-window-pane-labels-cutover.md`。
1. **v0.6.73 Go refresh window pane labels gate**：defines the second explicit mutating tmux Go cutover gate without runtime mutation；current Go source has `markWindowAsAgentTeam` as the only mutating tmux operation；authorized next runtime candidate is only `refreshWindowPaneLabels(target, signal)`；future Go may use only `tmux set-option -w -t <target> pane-border-status top` and `tmux set-option -w -t <target> pane-border-format '#{?@agentteam-name,#{@agentteam-name},#{pane_title}}'`；after the actual cutover `tmux/labels.ts refreshWindowPaneLabels` must not keep direct TypeScript `runTmuxNoThrowAsync(['set-option', '-w'...])` fallback；TypeScript/pi facade remains the pi extension compliance boundary；pane labels/pane titles/new-session/new-window/pane creation/layout/wake/kill/state/task/UI/release/package remain forbidden；no Go source/native artifact rebuild，证据见 `docs/perf/v0.6.73-go-refresh-window-pane-labels-gate.md`。
1. **v0.6.72 Go window marking cutover**：`tmux/labels.ts markWindowAsAgentTeam(target, signal)` keeps `windowExists(target, signal)` and delegates to `createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)`；Go `workerLifecycle.markWindowAsAgentTeam` uses only `tmux set-option -w -t <target> automatic-rename off`, `tmux set-option -w -t <target> allow-rename off`, and `tmux set-option -w -t <target> @agentteam-window 1`；direct TypeScript `runTmuxNoThrowAsync(['set-option', '-w'...])` fallback is removed for the same marking behavior；public facade remains no-throw `Promise<void>`；refreshWindowPaneLabels/pane labels/pane titles/new-session/new-window/pane creation/layout/wake/kill/state/task/UI/release/package remain TypeScript-owned；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.72-go-window-marking-cutover.md`。
1. **v0.6.71 Go mutating window marking gate**：defines the first explicit mutating tmux Go cutover gate without runtime mutation；current Go source still has no mutating tmux commands；authorized next runtime candidate is only `markWindowAsAgentTeam(target, signal)`；future Go may use only `tmux set-option -w -t <target> automatic-rename off`, `tmux set-option -w -t <target> allow-rename off`, and `tmux set-option -w -t <target> @agentteam-window 1`；after the actual cutover `tmux/labels.ts markWindowAsAgentTeam` must not keep direct TypeScript `runTmuxNoThrowAsync(['set-option', '-w'...])` fallback；TypeScript/pi facade remains the pi extension compliance boundary；new-session/new-window/pane creation/split/layout/resize/wake/send-keys/kill/clear labels/state/task/UI/release/package remain forbidden；no Go source/native artifact rebuild，证据见 `docs/perf/v0.6.71-go-mutating-window-marking-gate.md`。
1. **v0.6.70 Go window name lookup cutover**：`tmux/windows.ts detached ensureSwarmWindow()` post-new-window lookup uses `findWindowTargetByName(SWARM_SESSION, SWARM_WINDOW, signal)`；Go `workerLifecycle.findWindowTargetByName` uses only `tmux list-windows -t <sessionName> -F workerLifecycleWindowNameFormat` with compact `#{window_id}\t#{window_name}` output；direct TypeScript post-creation `list-windows -t SWARM_SESSION -F #{window_id}\t#{window_name}` parsing is removed；missing/invalid lookup throws compact `Failed to locate agentteam tmux window after creation`；new-session/new-window/marking/labels remain TypeScript-owned；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.70-go-window-name-lookup-cutover.md`。
1. **v0.6.69 Go detached first pane cutover**：`tmux/windows.ts detached ensureSwarmWindow()` uses `firstPaneInWindow(initialTarget, signal)` as the sole leader pane source；direct TypeScript `list-panes -t initialTarget -F #{pane_id}` parsing is removed；missing first pane throws compact `Failed to resolve agentteam leader pane`；post-creation list-windows lookup is superseded by v0.6.70 while new-session/new-window/marking/labels remain TypeScript-owned；no Go source/native artifact rebuild，证据见 `docs/perf/v0.6.69-go-detached-first-pane-cutover.md`。
1. **v0.6.68 Go detached leader binding cutover**：`tmux/windows.ts detached ensureSwarmWindow()` uses `resolvePaneBindingAsync(leaderPaneId, signal)` as the sole leader target source after pane setup；direct TypeScript target-based `display-message -p -t leaderPaneId #{window_id}` fallback is removed；missing leader binding throws compact `Failed to resolve agentteam leader pane binding`；pane setup list-panes is superseded by v0.6.69 and post-creation list-windows is superseded by v0.6.70 while new-session/new-window/marking/labels remain TypeScript-owned；no Go source/native artifact rebuild，证据见 `docs/perf/v0.6.68-go-detached-leader-binding-cutover.md`。
1. **v0.6.67 Go current binding window fallback cutover**：`tmux/windows.ts ensureSwarmWindow()` inside-tmux branch reuses `captureCurrentPaneBinding()` for current target/current pane fallbacks；direct TypeScript current target `display-message -p #{session_name}:#{window_id}` fallback is removed；direct TypeScript current pane `display-message -p #{pane_id}` fallback is removed；preferred binding/preferred target/`firstPaneInWindow(target, signal)` still win first；missing current binding throws compact `Failed to resolve current tmux pane binding` only when no preferred/first-pane equivalent can provide values；target-based detached `display-message -p -t leaderPaneId #{window_id}` fallback is superseded by v0.6.68；new-session/new-window/marking/labels remain TypeScript-owned；pane setup list-panes is superseded by v0.6.69；post-creation list-windows is superseded by v0.6.70；no Go source/native artifact rebuild，证据见 `docs/perf/v0.6.67-go-current-binding-window-fallback-cutover.md`。
1. **v0.6.66 Go session existence cutover**：`tmux/windows.ts ensureSwarmWindow()` checks `createAgentTeamKernelAdapter().sessionExistsAsync(SWARM_SESSION, signal)` instead of direct TypeScript `runTmuxNoThrowAsync(['has-session', '-t', SWARM_SESSION], undefined, signal)`；Go `workerLifecycle.sessionExists` uses only exact `tmux has-session -t <sessionName>`；positive confirmation skips `new-session` as before, while missing session/helper failure/invalid response/empty session/pre-aborted/in-flight aborted signals fail closed to false so existing TypeScript creation remains in charge；new-session/new-window/marking/labels remain TypeScript-owned；inside-tmux current binding display-message fallbacks are superseded by v0.6.67；detached target-based leader-pane display-message is superseded by v0.6.68；pane setup list-panes is superseded by v0.6.69；post-creation list-windows is superseded by v0.6.70；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.66-go-session-existence-cutover.md`。
1. **v0.6.65 Go agentteam window discovery cutover**：`tmux/windows.ts findAgentTeamWindowTarget(sessionName, signal) delegates to createAgentTeamKernelAdapter().findAgentTeamWindowTargetAsync(sessionName, signal)`；Go `workerLifecycle.findAgentTeamWindowTarget` uses only `tmux list-windows -t <sessionName> -F workerLifecycleAgentTeamWindowFormat` with compact `#{window_id}\t#{@agentteam-window}` output；marked window returns `${sessionName}:${windowId}`；missing session/no marked window/helper failure/empty session/pre-aborted/in-flight aborted signals fail closed to null；new-session/new-window/marking/labels remain TypeScript-owned while has-session is superseded by v0.6.66, inside-tmux current binding display-message fallbacks are superseded by v0.6.67, detached target-based leader-pane display-message is superseded by v0.6.68, pane setup list-panes is superseded by v0.6.69, and post-creation list-windows is superseded by v0.6.70；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.65-go-agentteam-window-discovery-cutover.md`。
1. **v0.6.64 Go pane app-start wait cutover**：`tmux/process.ts waitForPaneAppStart(paneId, timeoutMs, signal) polls createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)`；`SHELL_COMMANDS` remains the shell filter and the 200ms-capped polling cadence is preserved；timeout/helper failure/missing command/empty pane id/pre-aborted/in-flight aborted signals return false without throwing；the TypeScript target-based display-message pane_current_command fallback is removed；no Go source/native rebuild because workerLifecycle.inspectPane already returns compact currentCommand；spawn、labels、kill、window/session creation、state/task/UI/release/package remain TypeScript-owned，证据见 `docs/perf/v0.6.64-go-pane-app-start-wait-cutover.md`。
1. **v0.6.63 Go tmux availability facade cutover**：`tmux/core.ts ensureTmuxAvailable(signal) delegates to createAgentTeamKernelAdapter().checkTmuxAvailableAsync(signal)`；Go `tmuxAvailability` uses only exact `tmux -V` via `exec.CommandContext(ctx, "tmux", "-V")`；available tmux resolves `void` and unavailable/helper failure/invalid response/pre-aborted/in-flight aborted signals throw compact tmux-required errors without raw output/path/body leakage；pre-aborted and in-flight aborted signals throw compact tmux-required errors without raw output/path/body leakage；window creation、labels、mutating lifecycle、state/task/UI/release/package remain TypeScript-owned；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.63-go-tmux-availability-facade-cutover.md`。
1. **v0.6.62 Go window pane lookup facade cutover**：`tmux/core.ts windowExists(target, signal) and firstPaneInWindow(target, signal) delegate to createAgentTeamKernelAdapter().listPanesInWindowAsync(target, signal)`；Go `workerLifecycle.listPanesInWindow` uses only target-based `tmux list-panes -t <target> -F workerLifecycleWindowPaneFormat` with compact `#{pane_id}` output；pre-aborted and in-flight aborted signals fail closed to `false`/`null` at the public facades with compact diagnostics；the TypeScript target-based async list-panes fallback is removed；listAgentTeamPanes remains label-filtered and global `list-panes -a` only；mutating lifecycle remains TypeScript-owned；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.62-go-window-pane-lookup-facade-cutover.md`。
2. **v0.6.61 Go resolvePaneBindingAsync facade cutover**：`tmux/core.ts resolvePaneBindingAsync(paneId, signal) delegates to createAgentTeamKernelAdapter().inspectWorkerPaneAsync(paneId, signal)`；`core/kernel.ts` adds a cancellable async helper seam using stdin JSON-RPC and `AbortSignal` propagation；pre-aborted and in-flight aborted signals fail closed to `null` at the public facade with compact diagnostics；the TypeScript async display-message fallback for resolvePaneBindingAsync is removed；window helpers are cut over separately by v0.6.62 through a cancellable async Go listPanesInWindow seam；mutating lifecycle remains TypeScript-owned；no Go/native helper rebuild in v0.6.61 itself、no package/release/native rename action，证据见 `docs/perf/v0.6.61-go-async-pane-binding-facade-cutover.md`。
3. **v0.6.60 Go captureCurrentPaneBinding facade cutover**：`tmux/core.ts captureCurrentPaneBinding() keeps the isInsideTmux guard and delegates to createAgentTeamKernelAdapter().captureCurrentPaneBinding()`；Go `workerLifecycle.captureCurrentPaneBinding` uses only `tmux display-message -p workerLifecycleCurrentPaneBindingFormat` with compact `#{pane_id}\t#{session_name}:#{window_id}` output；the TypeScript display-message fallback for captureCurrentPaneBinding is removed；helper failure/outside-tmux/missing pane id or target fails closed to `null`；resolvePaneBindingAsync is cut over separately by v0.6.61 through a cancellable async helper seam；window helpers are cut over separately by v0.6.62 through a cancellable async Go listPanesInWindow seam；mutating lifecycle remains TypeScript-owned；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.60-go-current-pane-binding-facade-cutover.md`。
4. **v0.6.59 Go targetForPaneId facade cutover**：`tmux/core.ts targetForPaneId(paneId) delegates to resolvePaneBinding(paneId)?.target ?? null`；the TypeScript display-message fallback for targetForPaneId is removed；public facade returns `string | null` and helper failure/missing target/empty pane id fails closed to `null`；resolvePaneBindingAsync is cut over separately by v0.6.61 because that later slice adds a cancellable async helper seam；captureCurrentPaneBinding is cut over separately by v0.6.60 and window helpers by v0.6.62；mutating lifecycle remains TypeScript-owned；no Go/native helper rebuild in v0.6.59 itself、no package/release/native rename action，证据见 `docs/perf/v0.6.59-go-target-for-pane-facade-cutover.md`。
4. **v0.6.58 Go resolvePaneBinding facade cutover**：`tmux/core.ts resolvePaneBinding(paneId) delegates to createAgentTeamKernelAdapter().inspectWorkerPane(paneId)`；workerLifecycle.inspectPane compact result includes target (`#{session_name}:#{window_id}`) for arbitrary pane ids；the TypeScript display-message fallback for resolvePaneBinding is removed；success returns `{ paneId, target }` and helper failure/missing target fails closed to `null`；listAgentTeamPanes still filters labeled panes only；targetForPaneId, captureCurrentPaneBinding, resolvePaneBindingAsync, and window helpers are later cut over by v0.6.59-v0.6.62；mutating lifecycle remains TypeScript-owned；existing native helper path/name is preserved with rebuilt metadata/checksums only，证据见 `docs/perf/v0.6.58-go-resolve-pane-binding-facade-cutover.md`。
5. **v0.6.57 Go paneExists facade cutover**：`tmux/core.ts paneExists(paneId) delegates to the Go-backed inspectPane(paneId) facade`；the TypeScript display-message fallback for paneExists is removed；public facade returns boolean only and fails closed to `false`；resolvePaneBinding is cut over separately by v0.6.58 and window helpers by v0.6.62；mutating lifecycle remains TypeScript-owned；no Go/native helper rebuild、no package/release/native rename action，证据见 `docs/perf/v0.6.57-go-pane-exists-facade-cutover.md`。
6. **v0.6.56 Go inspectPane facade cutover**：`tmux/core.ts inspectPane(paneId) delegates to createAgentTeamKernelAdapter().inspectWorkerPane(paneId)`；the TypeScript display-message fallback for inspectPane is removed；successful adapter results preserve compact `PaneInspection` fields and failed adapter results return `exists:false`；paneExists is cut over separately by v0.6.57；`resolvePaneBinding()`、`targetForPaneId()`、`captureCurrentPaneBinding()`、and `resolvePaneBindingAsync()` are later cut over by v0.6.58-v0.6.61；mutating lifecycle remains TypeScript-owned；no Go/native helper rebuild、no package/release/native rename action，证据见 `docs/perf/v0.6.56-go-inspect-pane-facade-cutover.md`。
7. **v0.6.55 Go listAgentTeamPanes facade cutover**：`tmux/core.ts listAgentTeamPanes() delegates to createAgentTeamKernelAdapter().listAgentTeamPanes()`；the TypeScript tmux list-panes fallback for listAgentTeamPanes is removed；failure returns `[]` at the public facade while compact diagnostics remain on the kernel adapter result；`listAgentTeamPanesFromSnapshot()` keeps `item.paneId && item.label` semantics；inspectPane is cut over separately by v0.6.56；mutating lifecycle remains TypeScript-owned；no Go/native helper rebuild、no package/release/native rename action，证据见 `docs/perf/v0.6.55-go-list-agentteam-panes-facade-cutover.md`。
8. **v0.6.54 Go listAgentTeamPanes worker lifecycle slice**：`workerLifecycle` active operations are exactly read-only `inspectPane` and `listAgentTeamPanes` with `advertise-workerLifecycle-for-read-only-inspect-and-list-agentteam-panes`；Go helper supports `operation:"listAgentTeamPanes"` via read-only `tmux list-panes -a -F tmuxPaneSnapshotFormat` and returns compact `panes`/`byPaneId` identity fields；unsupported mutating operations fail closed；create/wake/label/kill remain TypeScript-owned and unmigrated；no state/task/PlanRun/UI/package/release/native rename action，证据见 `docs/perf/v0.6.54-go-list-agentteam-panes-worker-lifecycle.md`。
9. **v0.6.53 Go inspectPane worker lifecycle slice**：`workerLifecycle` is active only for read-only `inspectPane` with `advertise-workerLifecycle-for-inspectPane-only`；Go helper exposes the capability and supports only `operation:"inspectPane"` via read-only `tmux list-panes -a -F workerLifecycleInspectPaneFormat`；unsupported operations fail closed；create/wake/label/kill remain TypeScript-owned and unmigrated；no state/task/PlanRun/UI/package/release/native rename action，证据见 `docs/perf/v0.6.53-go-inspect-pane-worker-lifecycle.md`。
10. **v0.6.52 worker lifecycle contract gate**：新增 design-only future `workerLifecycle` JSON-RPC contract 与 helper connection model；`workerLifecycle` remains `design-only-not-runtime-capability`，per-call helper remains acceptable initially，long-lived helper is deferred until state/panel/high-frequency paths；read-only first (`inspectPane`, `listAgentTeamPanes`), mutating later (`wakePane`, `syncPaneLabels`, `createTeammatePane`), `killPane` last/highest-risk；no worker lifecycle runtime migration、no Go handler、no package/release/native rename action，证据见 `docs/perf/v0.6.52-worker-lifecycle-contract-gate.md`。
11. **v0.6.51 contract constants and artifact naming gate**：新增 `core/kernelContract.ts` 作为 package/helper/protocol/capability/native artifact constants 的 TS source of truth，并让 `core/kernel.ts` 与 `core/kernelPackagedResolver.ts` 消费该 contract；artifact naming decision status 为 `deferred-current-path-guarded`，current embedded native path remains `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc`，future broader names such as `agentteamKernel` or `agentteamControlPlaneCore` remain decision options；no native path/binary rename、no runtime migration、no package/release action，证据见 `docs/perf/v0.6.51-contract-constants-artifact-naming-gate.md`。
11. **v0.6.50 Go tmuxSnapshotCapture cutover**：实现 v0.6.49 后的第一条实际控制面扩展切片：Go now owns the narrow tmux snapshot capture adapter。`captureTmuxSnapshot(capturedAt) delegates to createAgentTeamKernelAdapter().captureTmuxSnapshot(capturedAt)`；Go helper 仅执行 `tmux list-panes -a -F tmuxPaneSnapshotFormat` 并复用 Go parser 返回 compact `TmuxSnapshot`；失败为 explicit unknown/stale no-leak diagnostics；worker lifecycle、state repository、task/report/PlanRun、team panel view-model、package/release 仍未迁移，证据见 `docs/perf/v0.6.50-go-tmux-snapshot-capture-cutover.md`。
12. **v0.6.49 Go control-plane expansion gate**：在用户明确要求继续将 Go 扩展到 tmux capture、worker lifecycle、state、task/report/PlanRun、UI、release/package control plane 后，新增 `docs/decisions/0003-go-control-plane-expansion.md` 与 `docs/perf/v0.6.49-go-control-plane-expansion-gate.md`。本切片接受 user-authorized architecture direction to expand Go beyond the `tmuxSnapshotParse` parser，但仅作为 staged gate：TypeScript/pi facade remains public product entry；first implementation slice is `tmuxSnapshotCapture`；后续顺序为 tmux capture → worker lifecycle → state repository → task/report/PlanRun → team panel view-model → package/release verification；仍不授权 `npm version`、`npm publish`、tag、GitHub release、second-platform、signing 或 package-manager native delivery。
13. **v0.6.48 actual default-Go cutover for `tmuxSnapshotParse`**：在 user-approved main-package embedded helper layout 下，default/unset 与 explicit `go` 进入 embedded helper cutover path，删除 runtime TypeScript parser fallback；该切片历史事实仍限定为 parser-only，随后由 v0.6.49 对 post-v0.6.49 future-only boundary 做架构 supersede；rollback/default-disable 仍通过 `disabled` 或 `typescript` 模式完成，证据见 `docs/perf/v0.6.48-default-go-cutover-tmux-snapshot.md`。
14. **v0.6.47 non-mutating default-Go dry-run implementation**：在 v0.6.46 GO-for-later-dry-run 的前提下，新增真实 non-mutating default-Go dry-run runtime/verifier path，使用 clean temp helper build、package-preview/default-layout fixture、future resolver simulation、parity/fail-closed/no-leak checks；当时仍 `ready:false`，actual default Go NO-GO，随后由 v0.6.48 actual cutover supersede；证据见 `docs/perf/v0.6.47-non-mutating-default-go-dry-run.md`。
15. **v0.6.46 default-Go readiness approval gate**：在 v0.6.44/v0.6.45 的 `tmuxSnapshotParse` 选择与 cutover gate prep 基础上，产出 clean-temp smoke evidence map、default resolver approval checklist、blocker ledger 与 GO/NO-GO recommendation；default-Go readiness approval gate 已启动/完成，仍 `ready:false`，default Go 未启用；GO for later non-mutating default-Go dry-run implementation，NO-GO for actual default enablement/fallback deletion/release-ready；证据见 `docs/perf/v0.6.46-default-go-readiness-approval-gate.md`。
16. **v0.6.45 tmuxSnapshotParse cutover gate prep**：在 v0.6.44 已选中的 `tmuxSnapshotParse` 基础上，补齐 future module cutover gate 的 parity/fail-closed/no-leak/fallback-prereq/rollback-default-disable guardable prerequisites（guardable prerequisites for a future module cutover gate）；当时是 implementation-prep evidence only，只做 docs/fixture/guard，不启用 default Go、不启用 default resolver、不删除 TypeScript fallback、不把 tmux execution/capture/lifecycle/state/governance 移到 Go、不做 tag/release/npm/native/package 工作；结果仍为 `ready:false`，证据见 `docs/perf/v0.6.45-tmux-snapshot-cutover-gate-prep.md`。
16. **v0.6.44 Go cutover candidate selection**：选择 `tmuxSnapshotParse` / tmux snapshot parser 作为第一个 future Go-owned runtime 候选；Go 只处理 TypeScript 已捕获的 snapshot text，不执行 tmux、不拥有 pane/session lifecycle、不写 state、不做 task/report/PlanRun governance、不读 full mailbox/report bodies、不参与 UI/control plane；结果仍为 `ready:false`。
17. **v0.6.43 evidence reconciliation**：对齐 v0.6.38-v0.6.42 evidence，保留 raw artifact path/hash/no-leak 检查，明确 focused p95 主 gate 均已有 pass evidence，同时保持结果 `ready:false`。
18. **Manual RC execution**：真实 operator/model manual RC 主 checklist 已通过并纳入 sanitized repo evidence；T129 PlanRun cancel follow-up 已由任务板验收为 pass，但 ignored 本地 evidence 不 force-add。
19. **p95 coverage completion**：task/message/report action、large mailbox、fsStore lock wait、data-change debounce、spawn bookkeeping 均已有 focused harness pass；每个 gate 的历史 fail/not-covered rows 通过 v0.6.43 reconciliation 标记为 covered/superseded，而不是删除历史审计记录。
20. **v0.7 Go-backed runtime burn-down**：以方案书六条 P0 主线为准做真实 runtime 改进；v0.6.49 后 Go 可以作为 staged control-plane core 承接实现，但每个 capability 必须有独立 parity/fail-closed/no-leak/rollback gate，且不得引入 hidden scheduler/autopilot、worker-spawns-worker 或 peer report auto-task creation。
21. **v0.7 readiness checkpoint**：最终 checkpoint 只在证据、runtime burn-down、broad validation、manual governance、package/runtime invariants 与 release-governance 授权齐全后生成，并继续区分 `ready:false` / `ready:true`；它本身不自动授权 tag、npm、release asset、default Go、native package 或 fallback deletion。

历史 checkpoint 文件名中出现的 `v0.5` 只代表当时的历史命名，不代表当前最终目标。当前最终目标始终是 v0.7.0 的 `core refactor + performance baseline + bug burn-down release`。

### Slice 0 — Baseline, characterization, and Go-kernel decision

目标：先测量，不猜瓶颈；同时把 JS/TS control plane + replaceable Go high-performance kernel/helper 的方向正式记录为文档决策。

交付：

- 当前 `/team` attached/global warm refresh baseline。
- 当前 tmux command count/time baseline。
- 当前 fsStore lock/read/parse/write baseline。
- 当前 known bug fixtures。
- 当前 task/message/report 行为快照。
- Go kernel decision record：保留 TypeScript/pi facade；Go 初期作为可替换、可禁用、可回退的 optional helper，但该 fallback 是迁移脚手架，不是最终架构。
- Go kernel port audit：梳理 `app/ports.ts`、`state/repository.ts`、runtime/tmux/outbox/config seams，区分 compact acceleration 候选与必须留在 TypeScript 的治理/full-text/worker lifecycle 边界。

验证：

- profiling 开关可用。
- fixture 可重复运行。
- 当前行为输出被记录，用于后续等价性对比。
- 文档 lint/链接/grep 检查确认决策记录和端口审计被方案书与 release planning docs 引用。
- 不改 `package.json` version，不执行 `npm version`、`npm publish`，不实现 Go code。

### Go Kernel Prep Slice 1 — Profiling parity scaffolding

目标：保持 TypeScript path 为默认实现，同时让未来 `PI_AGENTTEAM_KERNEL=go` 与 TypeScript fallback 的 benchmark/parity 对比有稳定 JSON metadata 和 stress fixture。

交付：

- State/read-model 与 panel/tmux bench JSON 输出 `implementation`、`kernel`、`fixtureProfile` metadata。
- 当前实现固定为 `implementation: "typescript"`；`PI_AGENTTEAM_KERNEL=go` 在 Go 未实现时只记录 requested mode/fallback reason，不调用 native helper。
- `AGENTTEAM_BENCH_FIXTURE=stress` 提供较大 state/panel fixture，用于 scalability shape，不声明 release pass/fail。
- perf 文档说明未来 Go parity run 必须与 `PI_AGENTTEAM_KERNEL=typescript` 使用相同 fixture/iterations 对比，并先验证 compact output equivalence。

验证：

- 保留 full-body sentinel leak checks、tmux command count expectations、compact/read-only boundary assertions。
- 增加 focused bench contract tests 锁定 metadata shape 与 stress fixture shape。
- 不改 `package.json` version，不执行 `npm version`、`npm publish`，不实现 Go code/native binary。

### Go Kernel Slice 7 — Perf checkpoint summary（GitHub-only）

目标：把 Go kernel Slice 0-6 的 optional/helper/shadow 工作整理为可 review 的 benchmark/perf checkpoint，而不是 runtime UI 或 npm release 指南。

交付：

- `docs/perf/go-kernel-slice7-checkpoint.md` 汇总 Slice 0-6 artifacts：决策记录、端口审计、benchmark metadata、source-only helper、tmux parser seam、read-model shadow parity、benchmark-only shadow reporting、failure/fallback diagnostics。
- 记录 reviewer commands：default benches、stress benches、`PI_AGENTTEAM_KERNEL=go` missing-helper fallback bench、可选本地 helper build shadow bench、Go helper smoke、typecheck、boundary check、`git diff --check`、package/native sanity。
- 说明 compact `shadow` fields、`fallbackKind` vocabulary 与解读规则：diagnostic-only，不进入 `/team`，不作为 p95 hard gate，除非后续 release checklist 明确门槛。
- README 只轻量链接 checkpoint，不把 Go kernel 描述为默认 runtime、authoritative path 或 npm/package release surface。

验证：

- 文档/reference test 确认 checkpoint 引用关键文件且包含 non-default/non-authoritative/no-runtime-UI 约束。
- 继续保持 Go 不接管 repository writes、sidecar writes、task/report/PlanRun governance、full-text boundaries、tmux pane lifecycle 或 npm package/version control。
- 不改 `package.json` version，不执行 `npm version`、`npm publish`、commit、tag 或 push。

### v0.4.17 — Go Kernel Contract Hardening（Slice 0）

目标：在扩展 parity corpus 前，把 v0.4.16 GitHub-only Go kernel checkpoint 的 optional-helper contract 明确冻结为文档/reference-test 事实，而不是改变 runtime 行为。

交付：

- `docs/perf/v0.4.17-kernel-contract-hardening.md` 记录 `protocolVersion=1`、`0.3.0-read-model-shadow` adapter/helper label、capabilities、`businessPathsConnected=false`、modes、`fallbackKind` vocabulary、benchmark-only shadow reporting 与 source-only helper posture。
- freeze line：protocol version 保持 `1`；adapter/helper label 只有在 wire/result shape 变化时才允许后续 slice 有意识地修改。
- compatibility/non-authority 边界保持：TypeScript/pi control plane 继续权威；Go 仍是 optional/read-only/source-only helper，不接管 state writes、runtime `/team` diagnostics、task/report/PlanRun governance、full-text boundaries 或 npm/native packaging。

验证：

- 轻量 docs/reference test 确认 freeze doc 引用关键 constants/files，并且不暗示 Go default、authoritative、packaged、npm publish 或 p95 gate。
- 不实现 Slice 1+ fixture corpus；不改 `package.json` version；不执行 `npm version`、`npm publish`；不添加 `go.mod`、`go.sum`、native binaries 或 lifecycle hooks。

### v0.4.17 — Go Kernel Contract & Parity Corpus Hardening（Slice 7 checklist）

目标：把 v0.4.17 Slice 0-6 的 contract freeze、JSON-RPC corpus、compatibility matrix、tmux parser corpus、read-model corpus、fallback/fail-closed policy、boundary guardrails 汇总成 GitHub-only reviewer checklist，而不是发布流程。

交付：

- `docs/perf/v0.4.17-kernel-release-checklist.md` 汇总 reviewer commands、expected signals、optional Go helper smokes、package/native sanity、boundary scans 与 review outcome template。
- checklist 明确：不执行 `npm version`、不执行 `npm publish`、不 commit/tag/push；`package.json` version 保持 `0.6.8`；Go 仍是 optional/source-only/non-authoritative，不进入 runtime `/team` diagnostics，不引入 native packaging。

验证：

- `tests/suites/go-kernel-release-checklist-docs.cjs` 作为轻量 docs/reference guard，确保 checklist 引用关键 slice/files/commands，并且不暗示 Go default、packaged、authoritative 或 p95 hard gate。

### v0.4.18 — Go Kernel Cutover Strategy & Fallback Deletion Plan（下一小版本方向）

目标：把 v0.4.16-v0.4.17 建立的 optional helper/fallback 体系重新定位为迁移脚手架，制定模块级 Go cutover 与 TS runtime fallback 删除策略。v0.4.18 不应继续扩大 fallback 面，而应回答“哪个模块值得 Go-owned、何时切换、如何删除旧 TS runtime path、失败时如何 fail closed”。

核心原则：

- fallback 是迁移工具，不是最终架构。
- 每个 Go 化模块必须有 owner boundary、cutover gate、fallback deletion issue/checklist、rollback plan。
- cutover 前：允许 TS/Go parity、shadow、fallback，用来降低迁移风险。
- cutover 后：该模块 runtime 只保留 Go-owned path；缺失/版本不兼容时 fail closed，并提供明确诊断和 release rollback 指引。
- release rollback 通过 GitHub tag/npm version，而不是 runtime 中长期偷偷走旧 TS path。
- v0.4.19 runtime prerequisite matrix：`docs/perf/v0.4.19-go-runtime-prerequisites.md` 是删除 TS runtime fallback 前的 stop/go gate；source-only/manual helper path 只代表 GitHub-only readiness，explicit user-provided helper path 只用于 local smoke，native packaging matrix 暂缓。

建议首个 cutover 候选：

1. `tmuxSnapshotParse` / tmux snapshot parser：最低风险，只处理 TypeScript 已捕获 stdout，不执行 tmux、不接 state、不接治理。
2. `compactReadModelFingerprint`：仍可作为第二候选，但在进入 runtime 前要确认 projection/fingerprint 不会成为 `/team` 权威数据源。
3. state/sidecar/outbox writes：暂缓，必须等 fail-closed、锁协议、回滚、idempotency 设计完成后再评估。

v0.4.18 交付：

- 新增 Go cutover decision record：`docs/decisions/0002-module-owned-go-kernel-cutover.md` 明确 transitional fallback、module-owned Go runtime、fail-closed diagnostics、rollback model。
- 新增 per-module cutover checklist：`docs/perf/v0.4.18-go-module-cutover-checklist.md` 定义 parity corpus PASS、bench/smoke PASS、packaging/runtime prerequisites、fallback deletion plan、rollback docs。
- 新增 fail-closed diagnostics contract：`docs/perf/v0.4.18-go-cutover-fail-closed-diagnostics.md` 定义 post-cutover compact fields、safe unavailable/unknown result、leak prohibitions、surface policy 与 release rollback pointer。
- 选定第一个 cutover candidate（建议 tmux parser）：`docs/perf/v0.4.18-tmux-snapshot-parse-cutover.md` 记录 `tmuxSnapshotParse` readiness、parser semantics、unknown/stale failure handling 与未来 fallback deletion target；v0.4.18 不强行删除 fallback。
- 更新 v0.4.17 docs 中“optional/source-only/non-authoritative”的表述：它描述迁移期，不是最终目标。

验收：

- 方案书明确“不长期保留 TS/Go 双 runtime fallback”。
- 每个未来 Go-owned 模块必须有 fallback deletion plan。
- fail closed diagnostics 与 release rollback 取代永久 runtime fallback。
- 仍不做 `npm version`、不做 `npm publish`、不引入 native binary 发布矩阵。

### v0.4.19 — Go Runtime Prerequisites & tmuxSnapshotParse Cutover Readiness（Slice 1）

目标：在任何 Go-owned runtime 真正删除 TS fallback 前，先明确 helper runtime availability 的可接受模型，避免把 source-only/manual helper readiness 误当成 shipped/default runtime 能力。

交付：

- 新增 runtime prerequisite decision matrix：`docs/perf/v0.4.19-go-runtime-prerequisites.md`。
- Model A：source-only/manual helper path 只作为 pre-cutover/GitHub-only readiness；runtime availability 未解决前不发布 Go-owned runtime，也不删除 TS fallback。
- Model B：explicit user-provided helper path 只允许 experimental/local cutover smoke；不是 packaged/default release path。
- Model C：native packaging matrix 是 shipped/default cutover 前置条件，但明确 deferred/out of v0.4.19 scope。
- stop/go gate：fallback deletion is blocked until runtime prerequisite signoff；继续保持 no package version change、no `npm version`、no `npm publish`、no lifecycle hooks、no package locks、no `go.mod`/`go.sum`、no checked-in native binaries、no `kernel/` package inclusion。

验收：

- `tests/suites/go-kernel-v0419-runtime-prereq-docs.cjs` 作为 docs/reference guard，确认 v0.4.19 doc 被 v0.4.18 cutover docs 链接，并且没有把 Go 变成 default runtime、native package、control plane、tmux/worker lifecycle owner、state/governance/full-text owner。

### v0.4.19 — tmuxSnapshotParse Fail-Closed Readiness（Slice 2）

目标：在不删除 TS parser fallback、不改变 default runtime behavior 的前提下，定义 `tmuxSnapshotParse` 未来 cutover-owned parser mode 的 fail-closed readiness。

交付：

- 新增 readiness doc：`docs/perf/v0.4.19-tmux-snapshot-fail-closed-readiness.md`。
- 明确 operation class：current migration parser mode may fail open to TypeScript；future cutover-owned parser mode must fail closed with compact diagnostics。
- 覆盖 future cutover failure classes：missing/disabled helper、unsupported protocol/version/capability、timeout、spawn error/crash/nonzero exit、empty response、malformed JSON、JSON-RPC error、incompatible/unsafe response shape、previous helper failure。
- 定义 safe unavailable/unknown result shape：`ok:false` or equivalent、compact `cutoverFailureKind`、short sanitized reason、no false successful empty snapshot。
- 明确 leak prohibitions：no helper stdout/stderr bodies、no full helper/repo paths、no mailbox/report text、no sidecar/cache/index/raw state contents、no hidden runtime state。
- 继续引用 parity coverage：`tests/fixtures/kernel/tmux/snapshotCases.cjs` 与 `tests/suites/go-kernel-tmux-snapshot-parser.cjs`；fallback deletion remains blocked until runtime prerequisite signoff。

验收：

- `tests/suites/go-kernel-v0419-tmux-readiness-docs.cjs` 作为 docs/reference guard，确认 readiness doc 被 prerequisite/cutover docs 链接，并且不暗示 runtime fallback deletion、Go default runtime、native packaging、tmux/worker lifecycle movement 或 state/governance/full-text movement。

### v0.4.19 — Team Refresh Parser-Unavailable Safety（Slice 3）

目标：证明 future `tmuxSnapshotParse` parser-unavailable snapshot 是 unknown/stale，不是 pane disappearance；ordinary light/global `/team` refresh 不能因 parser failure destructively mutate pane/worker state。

交付：

- 新增 safety doc：`docs/perf/v0.4.19-team-refresh-parser-unavailable-safety.md`。
- 区分 tmux capture failure、parser failure、successful empty snapshot；parser failure/capture failure 都不能被当成 false successful empty pane list。
- Guard light attached refresh：`snapshot.ok === false` 时不得 clear `paneId/windowTarget`、mark workers `error`、写 `pane lost`/`tmux pane disappeared`、kill panes、force reconcile 或 destructively mutate members。
- Guard global refresh：parser failure 不得清空 known pane bindings；live tmux fallback/retry 若存在必须是 explicit TypeScript/pi behavior，不是 hidden parser success。
- 继续保持 TypeScript/pi owner：tmux execution、pane lifecycle、worker lifecycle、`/team`、state/governance/full-text boundaries。

验收：

- `tests/suites/go-kernel-v0419-refresh-parser-unavailable-safety.cjs` 作为 focused docs/characterization guard，确认 docs/source/runtime injection 下的 `ok:false` refresh safety；不改 runtime behavior、不删除 fallback、不让 Go default。

### v0.4.19 — Go Helper Smoke Command Normalization（Slice 4）

目标：规范 reviewer source-only Go helper smoke/readiness commands，避免把临时本地 helper build 扩大成 package/native release scope。

交付：

- 新增 helper smoke readiness doc：`docs/perf/v0.4.19-go-helper-smoke-readiness.md`。
- 规范 temp helper build under `/tmp`：`helper="$(mktemp /tmp/agentteam-v0419-kernel.XXXXXX)"`；`(cd kernel/go/agentteam-kernel && GO111MODULE=off go build -o "$helper" .)`；使用后 `rm -f "$helper"`。
- 只允许显式 env 使用 helper：`PI_AGENTTEAM_KERNEL=go PI_AGENTTEAM_KERNEL_HELPER="$helper"`；missing Go toolchain 记为 optional-skip/manual-smoke unavailable，不是 default TypeScript runtime failure。
- 记录 expected health/smoke signals：`protocolVersion=1`、`helperVersion=0.3.0-read-model-shadow`、capabilities include `health/profile/tmuxSnapshotParse/compactReadModelFingerprint`、`businessPathsConnected=false`、enabled true with helper、fallbacks 0、parity matched where applicable、`readOnly:true`、`fullTextIncluded:false`、`stateFilesRead:false`、`stateFilesWritten:false`、no runtime `/team` diagnostics。
- 记录 package/native sanity：package version `0.6.8`、package files exclude `kernel/`、no package scripts、no lifecycle hooks、no package locks/npm-shrinkwrap、no `go.mod`/`go.sum`、no checked-in native artifacts。

验收：

- `tests/suites/go-kernel-v0419-helper-smoke-docs.cjs` 作为 docs/reference guard；不要求 Go toolchain，不新增 package scripts，不改 runtime behavior。

### v0.4.19 — Go Kernel Readiness Checkpoint（Slice 5）

目标：汇总 Slice 1-4 readiness results，给出 stop/go recommendation，并运行最终 validation；该 Slice 仍是 docs/tests/checkpoint summary only。

交付：

- 新增 checkpoint doc：`docs/perf/v0.4.19-go-kernel-readiness-checkpoint.md`。
- 汇总 runtime prerequisites：Model A GitHub-only readiness、Model B local smoke only、Model C deferred、fallback deletion blocked until runtime prerequisite signoff。
- 汇总 tmux fail-closed readiness：future cutover failure classes、safe unavailable/unknown shape、no leaks、parity references。
- 汇总 refresh safety：parser unavailable = unknown/stale not pane disappearance；light/global refresh non-destructive；explicit TypeScript/pi live tmux fallback behavior。
- 汇总 helper smoke commands：`/tmp` helper、`GO111MODULE=off`、explicit env、cleanup、expected health/bench/package-native signals。
- 记录 package/native sanity：package version `0.6.8`、package files exclude `kernel/`、no lifecycle hooks/package locks/npm-shrinkwrap/`go.mod`/`go.sum`/native artifacts。
- Stop/go recommendation：Do NOT proceed to actual `tmuxSnapshotParse` fallback deletion in v0.4.19；v0.4.20 cutover only if user explicitly approves and runtime prerequisite signoff is accepted；otherwise return to broader v0.7 core refactor。

验收：

- `tests/suites/go-kernel-v0419-readiness-checkpoint-docs.cjs` 作为 docs/reference guard；最终 validation 包括 `node tests/run.cjs`、`npm run typecheck`、`npm run -s check:boundaries`、`git diff --check`、package/native sanity，optional `npm run --silent bench:team-panel-tmux`。

### v0.4.20 — tmuxSnapshotParse Experimental Go-Owned Cutover（Slice 7 checkpoint）

目标：汇总 v0.4.20 Slice 1-6 的 `PI_AGENTTEAM_KERNEL=go-cutover` 实现、fail-closed 行为、refresh safety、boundary guardrails、helper smoke 和 package/native sanity，给出 GitHub-only checkpoint readiness，而不是 npm/default/native cutover approval。

交付：

- 新增 final checkpoint doc：`docs/perf/v0.4.20-go-cutover-checkpoint.md`。
- 确认 `go-cutover` 仍是 explicit/local-only mode，unset/default 仍是 disabled/TypeScript，`go`/`auto`/`typescript` 保持 migration fail-open。
- 确认唯一 cutover-owned module 是 `tmuxSnapshotParse`；`compactReadModelFingerprint` 在 `go-cutover` 下仍是 TypeScript fallback / non-cutover。
- 汇总 fail-closed shape：`ok:false`、`status:"unknown"`、`resultMarker:"stale"`、`module/capability:"tmuxSnapshotParse"`、compact `cutoverFailureKind`、empty panes/byPaneId、no TypeScript parser fallback callback。
- 汇总 `/team` attached/global refresh 与 orphan discovery safety：cutover parser unavailable 不等于 pane disappearance；generic non-cutover `ok:false` orphan fallback 保持 prior behavior。
- 汇总 Go helper boundary：parser-only/stdin-stdout；no tmux execution、state/repository writes、network、worker lifecycle、PlanRun/governance/full-text/package/release authority。
- 汇总 package/native sanity：package version `0.6.8`、package files exclude `kernel/`、no helper build/download/package scripts、no lifecycle hooks、no lockfiles、no `go.mod`/`go.sum`、no checked-in native artifacts。
- Decision：GO for GitHub-only experimental checkpoint after leader approval；STOP for npm/default/native cutover until separate native packaging/runtime prerequisite signoff。

验收：

- `tests/suites/go-kernel-v0420-checkpoint-docs.cjs` 作为 docs/reference guard；最终 validation 包括 `node tests/run.cjs`、`npm run typecheck`、`npm run -s check:boundaries`、`git diff --check`、`npm run --silent bench:team-panel-tmux`、package/native sanity，以及可用时的 `/tmp` source-only helper smoke。

### v0.4.21 — Go Runtime Availability Decision Matrix（Slice 1）

目标：把 v0.4.19 runtime prerequisites、v0.4.20 GitHub-only `go-cutover` checkpoint、以及 T154 planner signoff 整理为 Model C0 normal-user availability decision；该 Slice 只做 docs/tests，不实现 native packaging/runtime resolver。

交付：

- 新增 decision matrix doc：`docs/perf/v0.4.21-go-runtime-availability.md`。
- 明确 Model B explicit helper path 仍是 local/reviewer-only，不能证明 normal-user availability，也不能 justify default fallback deletion。
- 明确 v0.4.21 Slice 1 是 Model C0 design/signoff only；preferred future Model C 是 companion native packages 或 generated release artifacts with checksum/provenance，而不是 postinstall downloads 或 install-time Go builds。
- 比较 Model B、Model C0、future companion native packages、future bundled prebuilt binaries、source/user builds、postinstall/preinstall/prepare download、install-time `go build`。
- 定义 minimum normal-user evidence：fresh install on supported OS/arch can locate/execute compatible helper without Go toolchain/source checkout/manual `/tmp` build/helper env override；platform/libc matrix、unsupported-platform policy、health/protocol/capability/version check、version-skew detection、offline/CI behavior。
- 保持 package/native policy unchanged：package version `0.6.8`、no npm version/publish、no lifecycle hooks、no lockfiles、no `go.mod`/`go.sum`、no native binaries、no `kernel/` package inclusion、no helper build/download/package scripts。
- STOP gates：no TS fallback deletion until normal-user availability signoff；future diagnostics can be compact but must not leak helper path/stdout/stderr/repo path/mailbox/report text/raw cutover reason；rollback via GitHub tag/npm corrected release, not hidden runtime fallback。

验收：

- `tests/suites/go-kernel-v0421-runtime-availability-docs.cjs` 作为 docs/reference guard；确认 docs 链接 v0.4.19 prerequisites 与 v0.4.20 checkpoint、不暗示 Go default/native packaging approval/npm publish/version/postinstall download/install-time Go build/checked-in binaries/fallback deletion approval，并保持 package/native sanity unchanged。

### v0.4.21 — Go Native Artifact Contract（Slice 2）

目标：在任何 native packaging/resolver implementation 前，定义 future generated helper artifact contract；该 Slice 只做 docs/tests，不改 package metadata、不加入 native artifacts、不实现 resolver、不 publish/version。

交付：

- 新增 native artifact contract doc：`docs/perf/v0.4.21-go-native-artifact-contract.md`。
- 定义 future helper artifact naming/path convention：module/platform/version scoped，当前只属于 `tmuxSnapshotParse`，`compactReadModelFingerprint` 保持 non-cutover。
- 定义 platform matrix requirements：OS、CPU arch、Linux libc target、executable extension/permissions、tmux/pi support assumptions、unsupported-platform fail-closed policy。
- 定义 version/protocol/capability contract：JSON-RPC protocol version `1`、helper version `0.3.0-read-model-shadow` or approved successor、capability includes `tmuxSnapshotParse`、`businessPathsConnected:false`、package/helper version skew detection。
- 定义 health/smoke and fail-closed contract：direct `health`、direct `tmuxSnapshotParse`、missing/corrupt/wrong-platform/non-executable/wrong-version/incompatible helper fail closed、future packaged/default path no silent TS parser fallback。
- 定义 integrity/provenance and install behavior：checksums/manifest、provenance/attestation、license metadata、executable-bit validation、generated artifacts only/no checked-in binaries、offline/CI tarball/cache workflow、clean install future requirement、uninstall/upgrade cleanup。
- 保持 Go helper boundary：parser-only/stdin-stdout；no tmux execution/capture、state/repository writes、network/listeners、worker lifecycle、PlanRun/governance、full-text、package/release authority。

验收：

- `tests/suites/go-kernel-v0421-native-artifact-contract-docs.cjs` 作为 docs/reference guard；确认 contract 链接 Slice 1 availability doc 与 v0.4.20 checkpoint，不暗示 native packaging approved/implemented、Go default、fallback deletion、npm publish/version、lifecycle downloads、install-time Go builds 或 checked-in binaries，并保持 package/native sanity unchanged。

### v0.4.21 — Go Package Policy Guardrails（Slice 3）

目标：冻结 v0.4.21 package/native policy，并定义 future Model C package implementation slice 才能有意改变的内容；该 Slice 只做 docs/tests，不改 package metadata、不加 package scripts/native artifacts/package inclusion/resolver、不 publish/version。

交付：

- 新增 package policy doc：`docs/perf/v0.4.21-go-package-policy-guardrails.md`。
- 冻结当前 policy：package version `0.6.8`、`package.json#files` excludes `kernel/`、no lifecycle hooks、no helper build/install/download/package/version/publish scripts、no lockfiles、no root/helper `go.mod`/`go.sum`、no checked-in native artifacts、no optionalDependencies/native companion packages yet。
- 定义 future package slice change-control：optional companion package metadata、package files for generated artifacts、resolver path、checksum manifests、CI artifact production、package dry-run/install smokes 只能在 explicit owner slice + docs guard + package/native sanity update + rollback story 下改变。
- 明确 prohibited-by-default patterns：postinstall/preinstall/prepare downloads、install-time `go build`、checked-in generated binaries、implicit network fetch、default Go enablement、fallback deletion、broadening Go authority。
- 记录 package sanity checklist：script scans、package files excludes `kernel/`、native artifact scan excluding node_modules/.git、lock/go module existence checks。

验收：

- `tests/suites/go-kernel-v0421-package-policy-guardrails.cjs` 作为 docs/reference/package-native guard；确认链接 Slice 1/2 docs、冻结 policy、package facts unchanged、no lock/go module/native artifacts，并且 docs 不暗示 native packaging approved、npm publish/version、lifecycle downloads、install-time builds、checked-in binaries、Go default 或 fallback deletion。

### v0.4.21 — Go Resolver and Diagnostics UX Design（Slice 4）

目标：在 future packaged-helper resolver implementation 前，指定 resolver precedence、preview/default-native mode constraints、compact `/team` diagnostics policy、failure vocabulary 和 STOP gates；该 Slice 只做 docs/tests，不实现 resolver/runtime behavior，不改 package/native behavior。

交付：

- 新增 resolver diagnostics design doc：`docs/perf/v0.4.21-go-resolver-diagnostics-design.md`。
- 明确 current behavior unchanged：`go-cutover` 仍是 explicit/local-only helper-path mode；default/disabled/typescript/go/auto unchanged；`tmuxSnapshotParse` only cutover-owned module；`compactReadModelFingerprint` non-cutover。
- 定义 future resolver precedence：explicit helper path remains Model B local/reviewer path；packaged helper resolver only active in separately approved preview/default-native mode；runtime authority paths must not read helper env directly except adapter/resolver seam。
- 定义 future preview mode placeholder（例如 `go-packaged-preview`）和 gates：explicit opt-in only、package/native signoff required、no Go default、no TS fallback deletion、no silent TS parser fallback in packaged/default cutover path。
- 定义 diagnostics UX：current `/team` quiet；future compact signal only after signoff；safe fields module/status/failure kind/remediation/platform hint/rollback pointer；forbidden helper path/stdout/stderr/repo/cwd/mailbox/report/raw cutover reason/raw state/sidecar/cache/index/worker prompts/stack traces/package internals。
- 定义 failure vocabulary：existing cutover kinds remain compact；future candidates `unsupported-platform`、`helper-integrity-failed`、`helper-permission-denied` require docs/tests gate before runtime use。
- 保持 Go helper boundary：parser-only/stdin-stdout；no tmux execution/capture、state/repository writes、network/listeners、worker lifecycle、PlanRun/governance、full-text、package/release authority。

验收：

- `tests/suites/go-kernel-v0421-resolver-diagnostics-docs.cjs` 作为 docs/reference/package-native guard；确认链接 Slice 1/2/3 和 v0.4.20 checkpoint、包含 resolver precedence/diagnostics/no-leak/failure vocabulary/STOP gates，并且不暗示 resolver implemented、Go default、native packaging approved、npm publish/version、package changes、fallback deletion、lifecycle downloads、install-time builds 或 checked-in binaries。

### v0.4.21 — Go Packaged Helper Preview Resolver（Slice 5）

目标：在 Slice 1-4 signoff 后实现 explicit/non-default packaged-helper preview resolver path；只允许 `go-packaged-preview` 本地显式启用，仍不改 package metadata/native artifacts/npm version/publish/default Go，不删除 TypeScript fallback。

交付：

- 新增 implementation doc：`docs/perf/v0.4.21-go-packaged-preview-resolver.md`。
- `core/kernel.ts` 增加 known mode `go-packaged-preview`，只在该 mode 且无 explicit helper path 时读取 packaged preview helper path/status；default/disabled/typescript/go/auto/current `go-cutover` 不触发 packaged discovery。
- resolver precedence：`PI_AGENTTEAM_KERNEL_HELPER` / `AGENTTEAM_GO_KERNEL_HELPER` / adapter `helperPath` 仍优先于 packaged preview path；packaged env 只在 kernel adapter seam 读取。
- `go-packaged-preview` 对 `tmuxSnapshotParse` 使用 cutover/fail-closed behavior：missing/unsupported/integrity/permission/version/malformed/unsafe helper failure 返回 unknown/stale compact diagnostics，不调用 TypeScript parser fallback callback，不记录 migration fallback。
- `compactReadModelFingerprint` 保持 TypeScript fallback/non-cutover，不调用 packaged helper。
- 保持 package/native policy unchanged：package version `0.6.8`、no package scripts/lifecycle hooks/optionalDependencies/lockfiles/go modules/native artifacts/`kernel/` package inclusion/npm version/npm publish/commit/tag/push。

验收：

- `tests/suites/go-kernel-v0421-packaged-preview-resolver.cjs` 覆盖 mode normalization、default unchanged、explicit precedence、packaged success、missing/unsupported/integrity/permission/version/malformed/unsafe fail-closed、no-leak diagnostics、runtime authority env-boundary、package/native sanity。
- existing boundary/bench guards 确认 `go-packaged-preview` 是 known metadata mode 但不启用 read-model shadow、不影响 `go-cutover` 或默认行为。

### v0.4.21 — Go CI Package Artifact Prototype（Slice 6）

目标：用 docs/tests/temp fixtures 原型化 future Go helper artifact、manifest、package dry-run 和 clean-install smoke 形状；只证明 CI/package artifact workflow 的 test-only shape，不改变当前 package/native/runtime 行为。

交付：

- 新增 prototype doc：`docs/perf/v0.4.21-go-artifact-prototype.md`。
- 新增 `tests/suites/go-kernel-v0421-artifact-prototype.cjs`，在 `/tmp`/test temp dir 创建 fake executable helper、计算 size/sha256、生成 manifest、验证 executable bit，并在测试结束清理。
- manifest shape 覆盖 package name/version、helper version、protocol version、module `tmuxSnapshotParse`、os/arch/libc tuple、filename、size、sha256、source revision/provenance placeholder、license metadata。
- package dry-run shape 用 test helper 模拟 future companion/generated artifact package contents，只允许 `package.json`、`README.md`、`LICENSE`、manifest、helper executable；不包含 raw `kernel/` source，不含 scripts/lifecycle hooks/optionalDependencies。
- clean-install smoke shape 从 temp installed layout 验证 manifest/integrity/executable/platform 后，只通过 explicit `go-packaged-preview` + packaged path injection 使用 helper；direct `health` 和 `tmuxSnapshotParse` smoke 通过；default/disabled/typescript/go/auto/current `go-cutover` 不触发 packaged discovery。
- failure coverage：checksum mismatch/integrity failure、unsupported platform、wrong helper version/protocol/capability、non-executable helper fail closed；preview packaged path 不 silent invoke TypeScript parser fallback。
- 保持 package/native policy unchanged：不改 `package.json`，无 optionalDependencies、lifecycle hooks/scripts、lockfiles、go modules、checked-in native artifacts、npm version/publish/commit/tag/push、default Go、fallback deletion。

验收：

- `tests/suites/go-kernel-v0421-artifact-prototype.cjs` 覆盖 artifact/manifest/package dry-run/clean-install/failure/cleanup/package-native sanity。
- validation 包括 `node tests/run.cjs`、`npm run typecheck`、`npm run -s check:boundaries`、`git diff --check`、package/native sanity；可行时运行 `npm run --silent bench:team-panel-tmux`。

### v0.4.21 — Go Runtime Availability Checkpoint（Slice 7）

目标：汇总 Slice 1-6 runtime availability/native packaging evidence，给出 final signoff checkpoint recommendation；该 Slice 只做 docs/tests/checkpoint review，不实现 npm/default/native cutover，不删除 TypeScript fallback，不改 package/native metadata。

交付：

- 新增 final checkpoint doc：`docs/perf/v0.4.21-go-runtime-availability-checkpoint.md`。
- 明确 decision split：GO for GitHub-only v0.4.21 runtime availability/signoff checkpoint after leader approval；STOP for npm/default/native cutover；STOP for TypeScript parser fallback deletion。
- 汇总 Slice 1-6：Model C0 availability decision、native artifact contract、package policy guardrails、resolver diagnostics UX design、explicit/non-default `go-packaged-preview` resolver skeleton、temp-fixture artifact/package/install prototype。
- 记录 runtime/package state unchanged：default/disabled/typescript/go/auto/current `go-cutover` unchanged；`go-packaged-preview` explicit-only/non-default/not normal-user availability proof；`tmuxSnapshotParse` only cutover-owned；`compactReadModelFingerprint` non-cutover；runtime `/team` quiet。
- 记录 package/native policy unchanged：package version `0.6.8`、no optionalDependencies、lifecycle hooks、helper scripts、lockfiles、go.mod/go.sum、native artifacts、`kernel/` package inclusion、npm version/publish/commit/tag/push。
- 记录 evidence：docs/tests guards、preview resolver tests、artifact manifest/prototype temp fixture tests、package/native sanity、bench metadata TypeScript/default and preview known/no-shadow。
- 记录 remaining STOP gates：real package metadata owner slice、generated artifacts with provenance/checksums、supported platform clean install smokes、compact diagnostics/no-leak if needed、rollback/release process、no hidden TS fallback for future default cutover。

验收：

- `tests/suites/go-kernel-v0421-runtime-availability-checkpoint-docs.cjs` 确认 final checkpoint doc 链接 v0.4.20 checkpoint 与 Slice 1-6 docs，GO/STOP decision explicit，不暗示 npm publish/version、native/default cutover approval、fallback deletion approval、package metadata changes 或 checked-in native artifacts。
- validation 包括 `node tests/run.cjs`、`npm run typecheck`、`npm run -s check:boundaries`、`git diff --check`、`npm run --silent bench:team-panel-tmux`、可行时 `PI_AGENTTEAM_KERNEL=go-packaged-preview npm run --silent bench:team-panel-tmux`、package/native sanity。

### v0.4.22 — Native Helper Package Metadata Owner Decision（Slice 1）

目标：定义 future Native Helper Package Metadata Owner Slice 的 metadata ownership boundary；该 Slice 只做 docs/tests decision，不改 runtime resolver，不改 `package.json`/package metadata，不发布，不加入 native artifacts，不做 default/native cutover 或 TypeScript fallback deletion。

交付：

- 新增 metadata owner decision doc：`docs/perf/v0.4.22-native-helper-package-metadata.md`。
- 链接 v0.4.21 prerequisites：runtime availability checkpoint、native artifact contract、package policy guardrails、artifact prototype、packaged preview resolver。
- 明确 in-scope：package metadata schema、dry-run fixtures、manifest/package identity validation requirements、test-only package-layout fixtures、package/native sanity guards。
- 明确 out-of-scope：package publication、resolver defaulting、real `package.json` metadata changes、optionalDependencies/native companion deps、lifecycle hooks/downloads、lockfiles/go modules/native artifacts、`kernel/` package inclusion、default/native cutover、TypeScript fallback deletion。
- 记录 current runtime facts unchanged：default/unset disabled/TypeScript；`go`/`auto` migration unchanged；current `go-cutover` unchanged；`go-packaged-preview` explicit-only；`tmuxSnapshotParse` only cutover-owned；`compactReadModelFingerprint` non-cutover。
- 保持 STOP gates：no npm version/publish、no package.json/version/package metadata changes、no optional native deps、no lifecycle hooks/downloads、no lockfiles/go.mod/go.sum、no checked-in native binaries/tarballs/artifacts、no `kernel/` package inclusion、no default/native cutover、no fallback deletion。

验收：

- `tests/suites/go-kernel-v0422-native-package-metadata-docs.cjs` 确认 doc exists/links prerequisites、GO/STOP language、package/native sanity unchanged、no lock/go module/native artifacts introduced。
- validation 包括 focused guard、syntax check、可行时 `node tests/run.cjs`、`git diff --check`、package/native sanity。

### v0.4.22 — Companion Package Metadata Schema Fixture（Slice 2）

目标：用 temp/generated fixtures 定义并验证 future companion native package `package.json` metadata shape；该 Slice 只做测试夹具，不改 main `package.json`，不改 runtime resolver，不加入 native artifacts，不做 default/native cutover 或 fallback deletion。

交付：

- 新增 focused fixture suite：`tests/suites/go-kernel-v0422-native-package-metadata-fixtures.cjs`。
- 在 `/tmp`/test temp dir 生成 sample companion package manifests，例如 `@earendil-works/pi-agentteam-go-helper-linux-x64`、Linux arm64、Darwin arm64、Windows x64。
- fixture metadata 覆盖 `name`、`version: 0.6.8`、`license`、`os`、`cpu`、exact `files` allowlist（README/LICENSE/manifest/bin layout）、helper manifest/platform tuple 和 optional Linux libc marker。
- fixture guard 拒绝 `scripts`、lifecycle hooks、`optionalDependencies`、dependencies/devDependencies、build/download/install metadata、raw `kernel/` paths，并验证 package name/platform tuple consistency。
- 验证 main repo package/native state unchanged：package version `0.6.8`、no optionalDependencies、no lifecycle hooks、no `kernel/` files inclusion、no lockfiles/go modules/native artifacts。
- 更新 `docs/perf/v0.4.22-native-helper-package-metadata.md` 的 Slice 2 fixture details，同时保持 Slice 1 STOP gates。

验收：

- syntax check 和 focused suite 通过；可行时 `node tests/run.cjs` 与 `git diff --check` 通过；temp fixture root cleaned up；source checkout 无 checked-in native artifacts/lockfiles/go modules。

### v0.4.22 — Package Dry-Run Owner Simulation（Slice 3）

目标：从 metadata fixtures 前进到 owner-verified companion package dry-run shape；继续只使用 temp/generated fixtures，不改 main package metadata/runtime，不产生 repo artifacts。

交付：

- 新增 focused dry-run suite：`tests/suites/go-kernel-v0422-native-package-dry-run.cjs`。
- 在 temp package layout 中模拟 future companion package contents：`package.json`、`README.md`、`LICENSE`、`manifest/agentteam-go-helper-manifest.json`、`bin/agentteam-tmux-snapshot-helper`，Windows row 可使用 `.exe` helper filename。
- 用 test helper 模拟 `npm pack --dry-run --ignore-scripts` contents，不运行 npm version/publish，不向 repo 写 tarball。
- 强制 exact dry-run file list；拒绝 raw `kernel/` source、extra package files、package scripts/lifecycle hooks、optional deps、helper build/download/install metadata、tarballs、lockfiles/go modules、broad package contents。
- 断言 README/license/manifest/helper placeholder 存在，helper placeholder 只在 temp root 下创建并 cleanup。
- 验证 main package unchanged：no package.json changes、package version `0.6.8`、no optionalDependencies、no lifecycle hooks、no `kernel/` inclusion、no checked-in native artifacts/lockfiles/go modules。
- 更新 `docs/perf/v0.4.22-native-helper-package-metadata.md` 的 Slice 3 dry-run evidence/requirements，同时保持 Slice 1/2 STOP gates。

验收：

- syntax check 和 focused dry-run suite 通过；可行时 `node tests/run.cjs` 与 `git diff --check` 通过；不启动 Slice 4。

### v0.4.22 — Manifest Compatibility and Provenance Guard（Slice 4）

目标：用 docs/tests/temp fixtures 强化 future helper manifest compatibility、provenance、license、checksum metadata validation；不改 runtime resolver，不改 main `package.json`，不加入真实 artifacts，不启动 Slice 5。

交付：

- 新增 focused manifest guard suite：`tests/suites/go-kernel-v0422-manifest-compatibility-guard.cjs`。
- manifest schema 验证字段：`schemaVersion`、`package.name/version`、`helper.version/protocolVersion/module/os/arch/libc/filename/size/sha256/executable`、`provenance.sourceRevision/generatedBy/attestation`、`licenses`。
- compatibility assertions：main package version `0.6.8`、helper version `0.3.0-read-model-shadow`、protocol `1`、module `tmuxSnapshotParse`、supported platform tuple、Linux libc marker、filename 与 package files 一致、size/sha256 匹配 temp helper placeholder、executable true。
- rejection cases：mismatched package version、wrong helper version/protocol/module、unsupported platform、missing Linux libc/license/provenance/helper、non-executable helper、size mismatch、checksum mismatch、filename/package files mismatch。
- 记录 version/protocol/package/platform/checksum skew must fail closed in future preview/native resolver paths；仅做概念映射到 compact fail-closed preview diagnostics vocabulary，不实现 resolver changes。
- 更新 `docs/perf/v0.4.22-native-helper-package-metadata.md` 的 Slice 4 manifest compatibility/provenance/license/checksum requirements，同时保持 Slice 1-3 STOP gates。

验收：

- syntax check 和 focused manifest guard suite 通过；可行时 `node tests/run.cjs` 与 `git diff --check` 通过；不启动 Slice 5。

### v0.4.22 — go-packaged-preview Runtime Invariants（Slice 5）

目标：证明 metadata-owner work from Slices 1-4 不改变 runtime preview/cutover/default/read-model behavior；该 Slice 只做 tests/docs，不改 production runtime，不改 package metadata，不启动 Slice 6。

交付：

- 新增 focused invariant suite：`tests/suites/go-kernel-v0422-packaged-preview-invariants.cjs`。
- 断言 default/unset remains disabled/TypeScript 且不 discover packaged helper。
- 断言 `disabled`、`typescript`、`go`、`auto`、current `go-cutover` 不读取 packaged helper path/status、不调用 temp packaged helper；`go-cutover` explicit helper-path behavior unchanged。
- 断言 `go-packaged-preview` explicit-only/non-default；explicit helper path still wins over packaged preview path；packaged helper only in explicit preview mode。
- 断言 preview/cutover `tmuxSnapshotParse` failure stays fail-closed：`ok:false`、`status:'unknown'`、`resultMarker:'stale'`、module/capability `tmuxSnapshotParse`、compact `cutoverFailureKind`、no migration `fallbackKind`/`fallbackReason`、no TypeScript parser fallback callback。
- 断言 `compactReadModelFingerprint` remains TypeScript fallback/non-cutover in `go-cutover` and `go-packaged-preview`。
- 断言 `/team` runtime remains quiet per nearby guard conventions：不渲染 cutoverReason/helper path/packaged helper env/preview branch。
- 更新 `docs/perf/v0.4.22-native-helper-package-metadata.md` 的 Slice 5 invariant requirements/evidence，同时保持 Slice 1-4 STOP gates。

验收：

- syntax check 和 focused invariant suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不启动 Slice 6。

### v0.4.22 — Package/Native Guardrails（Slice 6）

目标：新增 package/native guardrails，明确区分 allowed temp metadata/dry-run fixture text 与 forbidden source repo/package metadata changes；该 Slice 只做 docs/tests，不改 main `package.json`，不改 runtime resolver，不启动 Slice 7。

交付：

- 新增 focused package/native guard suite：`tests/suites/go-kernel-v0422-package-native-guardrails.cjs`。
- 守住 main `package.json`：version `0.6.8`、`files` excludes `kernel/` and native/helper/generated artifact paths、no optionalDependencies、no native companion metadata、no lifecycle hooks、no helper build/install/download/package/version/publish scripts。
- 扫描 scripts：不得调用 `npm version`、`npm publish`、`go build`、`go install`、`curl`、`wget`、`node-gyp`、`prebuild` 或 package `kernel/`。
- 扫描 repo：no package lockfiles/npm shrinkwrap/root/helper go.mod/go.sum；no checked-in `.exe`、`.dll`、`.so`、`.dylib`、helper binary、package tarball、generated manifest/package artifact、native package fixture outside allowed docs/tests fixture sources。
- 明确 allowed：JS test suites/docs 可以包含 temp fixture definitions/placeholder strings；temp roots 必须在 repo 外并由相关 suites assert cleanup；v0.4.22 metadata fixtures are not real package inclusion。
- 更新 `docs/perf/v0.4.22-native-helper-package-metadata.md` 的 Slice 6 package/native guardrail requirements/evidence，同时保持 Slice 1-5 STOP gates。

验收：

- syntax check 和 focused package/native guard suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不启动 Slice 7。

### v0.4.22 — Native Helper Package Metadata Checkpoint（Slice 7）

目标：新增 GitHub-only native helper package metadata checkpoint，汇总 Slices 1-6 evidence、runtime/package unchanged facts、GO/STOP decision、validation commands 与 real native/package/default cutover 前 blockers；该 Slice 只做 docs/tests，不改 main `package.json`，不改 runtime resolver，不 commit/tag/push。

交付：

- 新增 checkpoint doc：`docs/perf/v0.4.22-native-helper-package-metadata-checkpoint.md`。
- 新增 checkpoint guard suite：`tests/suites/go-kernel-v0422-native-package-metadata-checkpoint-docs.cjs`。
- checkpoint link all v0.4.22 artifacts：metadata doc、metadata docs guard、metadata fixture suite、package dry-run suite、manifest compatibility guard、packaged preview invariants、package/native guardrails。
- checkpoint link prior checkpoint：`docs/perf/v0.4.21-go-runtime-availability-checkpoint.md`。
- 明确 GO only for GitHub-only v0.4.22 metadata-owner dry-run checkpoint after leader approval。
- 明确 STOP for npm/default/native cutover、real package inclusion、`package.json` metadata/version changes、optionalDependencies、lifecycle hooks/downloads、lockfiles/go modules/native artifacts、preview/dry-run as normal-user availability proof、default Go、current `go-cutover` behavior changes、TypeScript fallback deletion。
- 记录 remaining blockers before real native package metadata/default cutover，并包含 validation matrix：`node tests/run.cjs`、`npm run typecheck`、`npm run -s check:boundaries`、`git diff --check`、default bench、`PI_AGENTTEAM_KERNEL=go-packaged-preview` bench、package/native sanity。

验收：

- syntax check 和 focused checkpoint suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`npm run -s check:boundaries`、`git diff --check` 通过；不 commit/tag/push。

### v0.4.23 — Compact Native Failure Diagnostics and Release Decision Gate（Slice 1）

目标：新增 diagnostics surface audit and contract，定义 future compact native failure diagnostics 与 release decision gate foundation；该 Slice 只做 docs/tests，不实现 runtime UI diagnostics，不改 native/package/default behavior，不启动 Slice 2。

交付：

- 新增 diagnostics/audit doc：`docs/perf/v0.4.23-compact-native-failure-diagnostics.md`。
- 新增 docs/reference guard suite：`tests/suites/go-kernel-v0423-compact-diagnostics-docs.cjs`。
- 链接 prior checkpoint：`docs/perf/v0.4.22-native-helper-package-metadata-checkpoint.md`，并引用 relevant v0.4.20/v0.4.21 docs。
- 记录 current-state audit：default/unset disabled/TypeScript；`go-cutover` 与 explicit-only `go-packaged-preview` 对 `tmuxSnapshotParse` fail closed；`compactReadModelFingerprint` non-cutover；runtime `/team` currently quiet。
- 定义 safe compact diagnostic fields：module、capability、status/resultMarker、failure kind、short remediation、supported-platform/freshness hint、release decision pointer。
- 定义 forbidden leaks：helper path、stdout/stderr、repo/cwd、raw `cutoverReason`、raw state/team JSON、sidecar/cache/index contents、raw manifests/checksums/provenance payloads、worker prompts、stack traces、mailbox/report text、package internals。
- 明确 release decision gate：real package metadata/native artifact/default resolver/fallback deletion require explicit user approval after diagnostics、generated artifacts、clean install、unsupported-platform behavior、rollback proven。

验收：

- syntax check 和 focused diagnostics suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不改 main `package.json`、optionalDependencies、lifecycle hooks、lockfiles、Go modules、native artifacts、npm version/publish、default Go、current `go-cutover`、`go-packaged-preview` availability semantics 或 TypeScript fallback。

### v0.4.23 — Compact Diagnostics Model / Failure Mapping（Slice 2）

目标：新增 compact internal diagnostics model/failure mapping for `tmuxSnapshotParse` cutover/packaged-preview parser unavailability；该 Slice 只做 pure/read-only model 与 no-leak tests，不实现 runtime UI/panel diagnostics，不启动 Slice 3。

交付：

- 新增 pure internal helper：`core/kernelDiagnostics.ts`。
- 新增 focused guard suite：`tests/suites/go-kernel-v0423-compact-diagnostics-model.cjs`。
- 更新 diagnostics/audit doc：`docs/perf/v0.4.23-compact-native-failure-diagnostics.md` 的 Slice 2 model/mapping evidence。
- 覆盖 representative failure kinds：`missing-helper`、`helper-unsupported-version`、`helper-unsupported-protocol`、`helper-unsupported-capability`、`helper-timeout`、`helper-spawn-error`、`helper-crash`、`helper-nonzero-exit`、`helper-empty-response`、`helper-malformed-json`、`helper-jsonrpc-error`、`helper-incompatible-response`、`helper-unsafe-response-shape`、`previous-helper-failure`。
- 断言 diagnostics only safe fields：module、capability、status/resultMarker、failureKind、short remediation、optional platform/freshness hint、release decision pointer；forbidden leak sentinels 不出现在 serialized diagnostics。
- 断言 default/unset disabled/TypeScript、`go-packaged-preview` explicit-only、current `go-cutover` unchanged、`compactReadModelFingerprint` non-cutover、runtime `/team` quiet、package/native sanity unchanged。

验收：

- syntax check 和 focused model suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不改 package/default/native behavior，不改 `go-cutover` 或 `go-packaged-preview` availability semantics，不删除 TypeScript fallback。

### v0.4.23 — Parser Failure Policy / No-Leak Regression（Slice 3）

目标：新增 parser failure policy/no-leak regression，绑定 compact diagnostics contract 与 current `tmuxSnapshotParse` fail-closed behavior；覆盖 `go-cutover` 和 `go-packaged-preview` failure paths，不实现 runtime UI/panel diagnostics，不启动 Slice 4。

交付：

- 新增 focused regression suite：`tests/suites/go-kernel-v0423-parser-failure-policy.cjs`。
- 更新 diagnostics/audit doc：`docs/perf/v0.4.23-compact-native-failure-diagnostics.md` 的 Slice 3 failure-policy evidence。
- 覆盖 representative failure paths：missing helper、wrong version packaged helper、unsafe helper response。
- 使用 throwing TypeScript parser fallback callback，断言 cutover/preview failure paths 不调用 fallback。
- 断言 fail-closed snapshot shape：`ok:false`、`status:"unknown"`、`resultMarker:"stale"`、empty `panes`/`byPaneId`、module/capability `tmuxSnapshotParse`、compact `cutoverFailureKind`。
- 断言 no migration `fallbackKind`/`fallbackReason`、`fallbacks:0`、compact diagnostic mapping exists for same failure kind and only safe fields。
- 断言 forbidden sentinels 不泄漏到 snapshot、metadata、diagnostic、readiness-relevant serialized surfaces；`/team` remains quiet，不渲染 helper path、raw cutover reason、releaseDecision、platform/freshness hints 或 remediation。
- 断言 parser-unavailable panel/orphan boundary remains safe：不 hidden live TS parser fallback、不 false successful empty snapshot、不 force reconcile/kill panes/worker lifecycle mutation。

验收：

- syntax check 和 focused policy suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不改 package/default/native behavior，不改 `go-cutover` 或 `go-packaged-preview` availability semantics，不删除 TypeScript fallback，不扩大 Go authority。

### v0.4.23 — Compact Diagnostics Readiness / Summary Surface（Slice 4）

目标：新增 constrained read-only readiness/summary formatter/helper，把 internal compact diagnostics model 转成 safe compact object/string，供 future commands/tests 使用；不渲染 `/team`，不改变 runtime panel behavior，不启动 Slice 5。

交付：

- 在 `core/kernelDiagnostics.ts` 增加 pure readiness helpers：`summarizeTmuxSnapshotParseFailureDiagnostic()` 和 `formatTmuxSnapshotParseFailureReadiness()`。
- 新增 focused guard suite：`tests/suites/go-kernel-v0423-compact-diagnostics-readiness.cjs`。
- 更新 diagnostics/audit doc：`docs/perf/v0.4.23-compact-native-failure-diagnostics.md` 的 Slice 4 readiness/summary evidence。
- 覆盖 representative diagnostics：missing helper、unsupported version/protocol/capability、timeout/spawn/crash、malformed/incompatible/unsafe response、previous-helper-failure。
- 断言 readiness output compact/stable，包含 remediation 与 release decision pointer，仅使用 safe diagnostic contract text，不泄漏 forbidden sentinels。
- 断言 helper pure/read-only：无 fs/tmux/process/env/state/package/panel access。
- 断言 default/preview/cutover/read-model/package invariants unchanged，`/team` panel/runtime surfaces remain quiet。

验收：

- syntax check 和 focused readiness suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不改 package/default/native behavior，不改 `go-cutover` 或 `go-packaged-preview` availability semantics，不删除 TypeScript fallback，不渲染 runtime UI diagnostics，不扩大 Go authority。

### v0.4.23 — Compact Diagnostics Release Decision Checkpoint（Slice 5）

目标：新增 final GitHub-only compact native failure diagnostics + release decision gate checkpoint，汇总 Slice 1-4 evidence、runtime/package unchanged facts、GO/STOP decision、remaining blockers、validation matrix；不 commit/tag/push。

交付：

- 新增 final checkpoint doc：`docs/perf/v0.4.23-compact-native-failure-diagnostics-checkpoint.md`。
- 新增 checkpoint guard suite：`tests/suites/go-kernel-v0423-compact-diagnostics-checkpoint-docs.cjs`。
- checkpoint link prior checkpoint：`docs/perf/v0.4.22-native-helper-package-metadata-checkpoint.md`。
- checkpoint link all v0.4.23 artifacts：`docs/perf/v0.4.23-compact-native-failure-diagnostics.md`、`core/kernelDiagnostics.ts`、Slice 1 docs guard、Slice 2 model guard、Slice 3 parser failure policy guard、Slice 4 readiness guard。
- 明确 GO only for GitHub-only v0.4.23 compact diagnostics/release decision gate checkpoint after leader approval。
- 明确 STOP for runtime UI diagnostics rendering、command integration、npm/default/native cutover、real package inclusion、`package.json` metadata/version changes、optionalDependencies、lifecycle hooks/downloads、lockfiles/go modules/native artifacts、diagnostics/readiness as normal-user native availability proof、default Go、current `go-cutover` changes、`go-packaged-preview` availability semantics changes、TypeScript fallback deletion。
- 记录 remaining blockers：user approval、generated artifacts/checksums/provenance/license/executable validation、clean install smokes、unsupported-platform remediation、rollback story、command/UI diagnostics design if desired、package release ownership、parser failure policy in normal-user default path。
- 包含 validation matrix：focused v0.4.23 suites、`node tests/run.cjs`、`npm run typecheck`、`npm run -s check:boundaries`、`git diff --check`、default bench、preview bench、package/native sanity。

验收：

- syntax check 和 focused checkpoint suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`npm run -s check:boundaries`、`git diff --check` 通过；不改 package/default/native behavior，不改 `go-cutover` 或 `go-packaged-preview` availability semantics，不删除 TypeScript fallback，不渲染 runtime UI diagnostics，不扩大 Go authority，不 commit/tag/push。

### v0.4.24 — Explicit Readiness Command Integration Contract（Slice 1）

目标：启动 v0.4.24 Explicit Readiness Command Integration Checkpoint，定义 explicit opt-in reviewer command/readiness surface for compact diagnostics；该 Slice 只做 docs/tests，不实现 command integration，不渲染 `/team`，不启动 Slice 2。

交付：

- 新增 contract doc：`docs/perf/v0.4.24-explicit-readiness-command-integration.md`。
- 新增 docs/reference guard：`tests/suites/go-kernel-v0424-readiness-command-contract-docs.cjs`。
- 链接 v0.4.23 final checkpoint：`docs/perf/v0.4.23-compact-native-failure-diagnostics-checkpoint.md`。
- 链接 compact diagnostics helper：`core/kernelDiagnostics.ts`。
- 定义 allowed command/readiness output：module、capability、status、resultMarker、failureKind、remediation、hint、releaseDecision fields/text from v0.4.23 helpers。
- 定义 forbidden leaks：helper path、stdout/stderr、repo/cwd、raw cutoverReason、raw state/team JSON、sidecar/cache/index、raw manifests/checksums/provenance、worker prompts、stack traces、mailbox/report text、package internals、env bodies、full-text content。
- 定义 read-only behavior：no state writes、no mailbox/report full-text reads、no task/report governance mutation、no tmux execution/capture beyond existing product paths、no worker lifecycle mutation、no pane reconcile/kill。
- 记录 runtime/package invariants：default disabled/TypeScript、`go-packaged-preview` explicit-only/non-default、current `go-cutover` unchanged、`compactReadModelFingerprint` non-cutover、`/team` quiet、no package/native/default/fallback changes。

验收：

- syntax check 和 focused contract suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不实现 command integration，不渲染 `/team`，不改 package/default/native behavior，不改 `go-cutover` 或 `go-packaged-preview` availability semantics，不删除 TypeScript fallback，不扩大 Go authority。

### v0.4.24 — Command Surface Discovery and Seam Selection（Slice 2）

目标：audit existing command/tool surfaces and choose smallest explicit read-only readiness command integration seam for future Slice 3；该 Slice 只做 docs/tests，不实现 command integration，不渲染 `/team`，不启动 Slice 3。

交付：

- 更新 contract doc：`docs/perf/v0.4.24-explicit-readiness-command-integration.md` 的 Slice 2 seam audit。
- 新增 focused guard：`tests/suites/go-kernel-v0424-readiness-command-seam-docs.cjs`。
- 记录 audited surfaces：`api/commands.ts`、`commands/team.ts`、`commands/config.ts`、`commands/shared.ts`、`api/tools.ts`、`tools/`、`tests/suites/commands.cjs`、`tests/suites/public-output-leak-guards.cjs`。
- 推荐 smallest future seam：explicit `/team readiness` subcommand handled before `openTeamPanel()`，沿用 `/team config` subcommand dispatch style，输出 compact reviewer-facing notification text，不进入 `/team` panel rendering。
- 说明 why not tools/panel/package seams：tools authority too broad；`/team` ambient rendering violates quiet invariant；package/native resolver behavior remains out of scope。
- 定义 Slice 3 may/must-not：may add explicit read-only command using `core/kernelDiagnostics.ts` safe fields；must not implement ambient UI、model-callable tool、runtime behavior changes、state writes、full-text reads、task/report mutation、tmux capture/reconcile/kill、package/native/default changes。

验收：

- syntax check 和 focused seam suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；command/tool public surfaces remain unchanged；不实现 command integration，不渲染 `/team`，不改 runtime/package/default/native behavior，不删除 TypeScript fallback，不扩大 Go authority。

### v0.4.24 — Explicit Readiness Command Integration（Slice 3）

目标：实现最小 explicit read-only `/team readiness` subcommand integration，使用 v0.4.23 compact diagnostics readiness helpers；必须 opt-in/deterministic，不由 normal `/team` panel refresh 触发，不启动 Slice 4。

交付：

- 新增 command handler：`commands/readiness.ts`。
- 在 `commands/team.ts` 中 before `openTeamPanel()` 路由 `/team readiness`。
- 输出 compact reviewer-facing notification text，来源于 `listTmuxSnapshotParseFailureDiagnostics()` 和 `formatTmuxSnapshotParseFailureReadiness()`。
- 输出仅包含 safe fields/text：module、capability、status、resultMarker、failureKind、remediation、hint、releaseDecision，并声明 readiness diagnostics are not normal-user native availability proof。
- 新增 focused integration guard：`tests/suites/go-kernel-v0424-readiness-command-integration.cjs`。
- 更新 `docs/perf/v0.4.24-explicit-readiness-command-integration.md` 的 Slice 3 implementation evidence 和 STOP gates。
- 保持 `/team` ambient UI quiet；normal `/team` 仍打开 panel；不读 mailbox/report full text，不写 state，不改 task/report governance，不执行/capture tmux，不 reconcile/kill panes，不改 worker lifecycle。

验收：

- syntax check 和 focused integration suite 通过；affected command/seam suites 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不改 runtime resolver/default/package/native behavior，不改 `go-cutover` 或 `go-packaged-preview` availability semantics，不删除 TypeScript fallback，不扩大 Go authority。

### v0.4.24 — Readiness Command Sunset and Containment Plan（Slice 4）

目标：纠正路线方向，明确 `/team readiness` 是 transitional reviewer/readiness tooling，不是 long-term product feature；新增 sunset/containment/deletion guardrails，防止扩展到 ambient `/team` UI、model-callable tools、runtime control plane、package/native/default behavior 或 permanent user-facing feature；不启动 Slice 5。

交付：

- 更新 `docs/perf/v0.4.24-explicit-readiness-command-integration.md` 的 Slice 4 sunset/containment section。
- 新增 focused guard：`tests/suites/go-kernel-v0424-readiness-command-sunset-docs.cjs`。
- 记录 Go mainline：replace proven deterministic hot-path modules with Go-owned implementations after cutover gates, not add product features。
- 定义 containment rules：no additional readiness subcommands without explicit user approval、no ambient `/team` panel rendering、no model-callable tool surface、no package/native/default behavior、no state writes/full-text reads/tmux execution/worker lifecycle/task governance/pane reconcile/kill、no broad Go authority。
- 定义 sunset paths：delete `/team readiness` after formal native diagnostics/default path matures；or merge into separately approved diagnostics UX；or keep developer/reviewer-only hidden/internal only if explicitly approved。
- 定义 deletion criteria：generated artifacts and clean-install proof、unsupported-platform remediation and rollback、normal-user diagnostics UX if needed、separate TypeScript fallback deletion/default cutover decision。

验收：

- syntax check 和 focused sunset suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不移除 `/team readiness`，不新增 command features/tools，不渲染 `/team`，不改 runtime/package/default/native behavior，不删除 TypeScript fallback，不扩大 Go authority。

### v0.4.24 — Explicit Readiness Command Integration Checkpoint（Slice 5）

目标：新增 final GitHub-only explicit readiness command integration checkpoint，汇总 Slice 1-4 evidence、validation matrix、GO/STOP decision、readiness sunset/containment、runtime/package/default/native/fallback invariants；docs/tests only，不启动后续 slice。

交付：

- 新增 final checkpoint doc：`docs/perf/v0.4.24-explicit-readiness-command-integration-checkpoint.md`。
- 新增 checkpoint guard：`tests/suites/go-kernel-v0424-readiness-command-checkpoint-docs.cjs`。
- checkpoint link prior checkpoint：`docs/perf/v0.4.23-compact-native-failure-diagnostics-checkpoint.md`。
- checkpoint link v0.4.24 artifacts：contract doc、`commands/readiness.ts`、`commands/team.ts`、Slice 1 contract guard、Slice 2 seam guard、Slice 3 integration guard、Slice 4 sunset guard。
- 汇总 Slice 1-4：contract、seam selection、minimal read-only implementation、transitional containment/sunset/deletion/merge paths。
- 明确 GO only for GitHub-only v0.4.24 checkpoint after leader/user approval。
- 明确 STOP for expanding `/team readiness`、additional subcommands/options、ambient `/team` UI/panel diagnostics、model-callable tools、runtime control plane、npm/default/native cutover、package/native artifacts、package metadata/version changes、diagnostics/readiness as normal-user native availability proof、default Go、current `go-cutover` changes、`go-packaged-preview` semantics changes、TypeScript fallback deletion、broader Go authority。
- 重申 Go mainline：future work returns to Go core replacement、generated artifacts、clean install proof、module cutover gate、separately approved fallback deletion/default cutover plan。
- 包含 validation matrix：focused v0.4.24 suites、`node tests/run.cjs`、`npm run typecheck`、`npm run -s check:boundaries`、`git diff --check`、default bench、preview bench、package/native sanity。

验收：

- syntax check 和 focused checkpoint suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`npm run -s check:boundaries`、`git diff --check` 通过；不扩展或移除 `/team readiness`，不新增 command features/tools，不渲染 `/team`，不改 runtime/package/default/native behavior，不删除 TypeScript fallback，不扩大 Go authority，不 commit/tag/push。

### v0.4.25 — Native Helper Availability Proof Checkpoint（Slice 1）

目标：启动 v0.4.25 Native Helper Availability Proof Checkpoint，新增 docs/tests-only native availability owner contract，定义 default/native/fallback deletion 讨论前必须证明的 native helper availability evidence；冻结 TS/pi control-plane boundary 与 Go helper subprocess/stdin-stdout boundary；不启动 Slice 2。

交付：

- 新增 owner contract doc：`docs/perf/v0.4.25-native-helper-availability-proof.md`。
- 新增 focused docs guard：`tests/suites/go-kernel-v0425-native-availability-contract-docs.cjs`。
- 链接 prior artifacts：v0.4.21 runtime availability/native artifact/artifact prototype、v0.4.22 metadata checkpoint、v0.4.23 diagnostics checkpoint、v0.4.24 readiness checkpoint、Go kernel ADRs。
- 记录 T013 pi runtime finding：pi extension/provider/tool surfaces are TS/JS/Node-based；no native Go pi extension/provider ABI assumed；TS/pi control plane mandatory；Go helper behind TS adapter/ports via subprocess/RPC/stdin-stdout。
- 定义 in-scope proof areas：generated artifact shape、manifest/checksum/provenance/license/executable validation、clean-install smoke simulation、unsupported-platform behavior、rollback/version skew、resolver/default gate、module cutover/fallback deletion gate documentation。
- 定义 out-of-scope/STOP gates：real artifacts/package metadata/default behavior、npm version/publish、native Go pi extension、default Go、TypeScript fallback deletion、`/team readiness` expansion、broad Go authority、package/runtime behavior changes。
- 包含 native availability decision matrix：generated artifacts、clean install、diagnostics、unsupported platform、rollback、package release ownership、parser failure policy、user approval、current state / required before default/native/fallback deletion。

验收：

- syntax check 和 focused contract suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不实现 artifact validator/runtime resolver，不改 runtime/package/default/native behavior，不扩展 `/team readiness`，不删除 TypeScript fallback，不扩大 Go authority。

### v0.4.25 — Generated Artifact Shape and Manifest Validator Prototype（Slice 2）

目标：在 temp roots only 下证明 future generated Go helper artifact for `tmuxSnapshotParse` 可被 strict manifest/checksum/provenance/license/executable rules 描述和验证；该 Slice 是 docs/tests/temp-fixture prototype，不创建 real package/native behavior，不启动 Slice 3。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.25-native-helper-availability-proof.md` 的 Slice 2 prototype evidence。
- 新增 focused prototype suite：`tests/suites/go-kernel-v0425-artifact-manifest-prototype.cjs`。
- suite 只在 OS temp dirs runtime 创建 fake helper artifact，验证 manifest shape：schemaVersion、packageName/packageVersion、module、helperVersion、protocolVersion、capability、os/arch/linux libc、allowlisted path、size、sha256、executable、provenance、license metadata。
- suite 验证 valid manifest passes，并 reject missing helper、wrong module/packageVersion/helperVersion/protocolVersion、missing capability、unsupported platform、missing linux libc、non-executable POSIX helper、size/checksum mismatch、missing provenance/license、outside allowlist、path traversal。
- failure results 使用 compact availability/fail-closed vocabulary，不泄漏 helper path、repo/cwd、stdout/stderr、raw stack、raw manifest/provenance/license body。
- 保持 T013 boundary：TS/pi control plane mandatory；no native Go pi extension/provider ABI assumed；Go helper behind TS adapter/ports via subprocess/RPC/stdin-stdout；parser-only `tmuxSnapshotParse` authority。

验收：

- syntax check 和 focused prototype suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不实现 production runtime resolver，不改 package metadata，不 check in native binaries/tarballs/generated manifests/artifacts，不启用 default Go，不改 `go-cutover` 或 `go-packaged-preview` semantics，不删除 TypeScript fallback，不扩展 `/team readiness`，不扩大 Go authority。

### v0.4.25 — Clean-Install Smoke Simulation（Slice 3）

目标：在 temp dirs only 下证明 future installed helper layout 可被定位并 smoke-tested，且不需要 Go toolchain、source checkout、manual helper env、lifecycle download、install-time build 或 hidden network fetch；该 Slice 是 docs/tests/temp-fixture simulation，不改 production resolver/default/package/native behavior，不启动 Slice 4。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.25-native-helper-availability-proof.md` 的 Slice 3 clean-install smoke evidence。
- 新增 focused smoke suite：`tests/suites/go-kernel-v0425-clean-install-smoke.cjs`。
- suite 只在 OS temp dirs runtime 创建 installed layout 和 fake helper，使用 package-relative manifest/helper paths。
- suite 验证 explicit test/preview injection only 的 success case：locate + smoke helper；no Go toolchain；no source checkout；no manual helper env；no lifecycle download/install-time build/network fetch；no default resolver activation。
- suite 验证 fail-closed cases：missing installed package/helper、corrupt helper output/malformed JSON、wrong platform helper、non-executable POSIX helper、wrong helper version、wrong protocol version、missing `tmuxSnapshotParse` capability、checksum mismatch、manifest/helper mismatch。
- failure results 使用 compact availability/fail-closed vocabulary，不泄漏 helper absolute path、temp root、repo/cwd、stdout/stderr、raw manifest/helper output、stack traces、package internals；simulated explicit preview path 不 silent TS parser fallback。
- 保持 T013 boundary 与 Slice 2 manifest context：TS/pi control plane mandatory；no native Go pi extension/provider ABI assumed；Go helper behind TS adapter/ports via subprocess/RPC/stdin-stdout；parser-only `tmuxSnapshotParse` authority。

验收：

- syntax check 和 focused smoke suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不实现 production runtime resolver，不改 package metadata，不 check in native binaries/tarballs/generated manifests/artifacts，不启用 default Go，不改 `go-cutover` 或 `go-packaged-preview` semantics，不删除 TypeScript fallback，不扩展 `/team readiness`，不扩大 Go authority，不启动 Slice 4。

### v0.4.25 — Unsupported Platform and Rollback/Version-Skew Policy（Slice 4）

目标：定义 unsupported platforms 与 unsafe helper/package states 的 fail-closed compact diagnostics/remediation，并明确 rollback/version-skew policy；该 Slice 是 docs/tests policy guard work，不实现 production resolver/default/package/native behavior，不启动 Slice 5。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.25-native-helper-availability-proof.md` 的 Slice 4 unsupported-platform/rollback/version-skew policy evidence。
- 新增 focused policy suite：`tests/suites/go-kernel-v0425-unsupported-rollback-policy.cjs`。
- 定义 unsupported-platform matrix rows/remediation：unsupported os/arch/libc、missing helper package/artifact、bad package metadata、checksum/provenance/license mismatch/missing、non-executable helper、stale helper、helper/package version skew、protocol skew、capability skew、corrupt helper output、broken diagnostics、bad resolver default、package unpublish/deprecation。
- 定义 rollback scenarios/owners：bad metadata、bad helper artifact、checksum/provenance mismatch、unsupported platform、broken diagnostics、package unpublish/deprecation、stale helper、bad default resolver decision；owners include release/package/diagnostics/runtime/support-policy owners。
- 明确 rollback 是 corrected release/tag/package/deprecation/default-disable policy，不是 hidden runtime TS fallback after cutover。
- 明确 unsupported platforms fail closed with compact no-leak diagnostics，并继续 block default/native/fallback deletion，除非 support policy narrowed and approved。
- future normal-user diagnostics UX 如需要，不能泄漏 helper path/stdout/stderr/repo/cwd/raw manifest/checksum/provenance/package internals/stack/mailbox/report text。

验收：

- syntax check 和 focused policy suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不实现 production runtime resolver，不改 package metadata，不 check in native binaries/tarballs/generated manifests/artifacts，不启用 default Go，不改 `go-cutover` 或 `go-packaged-preview` semantics，不删除 TypeScript fallback，不使用 hidden TS fallback as rollback，不扩展 `/team readiness`，不扩大 Go authority，不启动 Slice 5。

### v0.4.25 — Resolver/Default and Module Cutover Gate（Slice 5）

目标：将 v0.4.25 Slice 1-4 evidence 转换为 future gate，定义 `tmuxSnapshotParse` 何时可被考虑从 explicit preview/local cutover 走向 normal-user packaged/default availability 以及后续 TypeScript fallback deletion；该 Slice 是 docs/tests gate work，不实现 production resolver/default behavior，不启动 Slice 6。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.25-native-helper-availability-proof.md` 的 Slice 5 resolver/default and module cutover gate evidence。
- 新增 focused gate suite：`tests/suites/go-kernel-v0425-resolver-default-cutover-gate.cjs`。
- 定义 gate matrix：generated artifacts、manifest/checksum/provenance/license/executable validation、clean install、compact diagnostics/no-leak、unsupported-platform policy、rollback/default-disable/deprecation、package release ownership、parser failure policy in normal-user default path、package metadata/companion package ownership、explicit user approval、fallback deletion readiness。
- 每个 gate 包含 current state、required evidence before packaged/default resolver can be considered、required evidence before `tmuxSnapshotParse` TypeScript fallback deletion can be considered。
- 明确 v0.4.25 does not pass the gate；只定义 gate 并收集 temp/prototype evidence；不 approve packaged/default resolver 或 fallback deletion。
- 保持 runtime/module invariants：default/unset disabled/TypeScript；`go-packaged-preview` explicit-only/non-default；current `go-cutover` helper-path based unchanged；packaged discovery 不在 default/disabled/typescript/go/auto/current `go-cutover` 运行；`tmuxSnapshotParse` only cutover-owned module；`compactReadModelFingerprint` TypeScript fallback/non-cutover。
- 明确 Go authority stays parser-only stdin/stdout，不拥有 tmux execution/capture、state、worker lifecycle、task/report governance、PlanRun、full-text boundaries、package/release authority、UI rendering、command control plane；no hidden TS fallback after cutover。

验收：

- syntax check 和 focused gate suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不实现 production runtime resolver，不改 package metadata，不 check in native binaries/tarballs/generated manifests/artifacts，不启用 default Go，不改 `go-cutover` 或 `go-packaged-preview` semantics，不删除 TypeScript fallback，不使用 hidden TS fallback as rollback，不扩展 `/team readiness`，不扩大 Go authority，不启动 Slice 6。

### v0.4.25 — Package/Native Guardrail and Final Checkpoint Hardening（Slice 6）

目标：新增 final GitHub-only v0.4.25 native helper availability proof checkpoint docs/tests，总结 Slice 1-5 evidence、validation matrix、GO/STOP decision、remaining blockers，并冻结 runtime/package/default/native/fallback/readiness invariants；该 Slice 是 docs/tests only，不 commit/tag/push，不启动 later work。

交付：

- 新增 final checkpoint doc：`docs/perf/v0.4.25-native-helper-availability-proof-checkpoint.md`。
- 新增 focused checkpoint guard：`tests/suites/go-kernel-v0425-native-availability-checkpoint-docs.cjs`。
- 更新 owner contract doc：`docs/perf/v0.4.25-native-helper-availability-proof.md` 链接 final checkpoint，并更新 Slice 1-6 final recommendation。
- checkpoint link prior checkpoint：`docs/perf/v0.4.24-explicit-readiness-command-integration-checkpoint.md`。
- checkpoint link v0.4.25 artifacts/guards：owner doc、Slice 1 contract guard、Slice 2 artifact manifest prototype、Slice 3 clean-install smoke、Slice 4 unsupported rollback policy、Slice 5 resolver/default gate、Slice 6 checkpoint guard。
- 总结 Slice 1-5 outcomes：owner contract/T013 TS-pi boundary、temp artifact/manifest prototype、temp clean-install smoke simulation、unsupported rollback/version-skew policy、resolver/default module cutover gate。
- 明确 GO only for GitHub-only checkpoint after leader/user approval；GO for evidence only；STOP for npm/version/package metadata/optionalDependencies/lifecycle/downloads/scripts/lockfiles/go modules/native binaries/tarballs/generated artifacts/real package inclusion/default Go/go-cutover/go-packaged-preview/fallback deletion/hidden TS fallback/compactReadModelFingerprint cutover/broad Go authority/native Go pi extension/readiness expansion/commit-tag-push。
- 明确 v0.4.25 still does not prove normal-user native availability and does not pass packaged/default/fallback deletion gate；列出 remaining blockers 与 validation matrix。

验收：

- syntax check 和 focused checkpoint suite 通过；`node tests/run.cjs`、`npm run typecheck`、`npm run -s check:boundaries`、`git diff --check` 通过；可行时 default bench 与 `PI_AGENTTEAM_KERNEL=go-packaged-preview` bench 通过；不实现 production runtime resolver，不改 package metadata，不 check in native binaries/tarballs/generated manifests/artifacts，不启用 default Go，不改 `go-cutover` 或 `go-packaged-preview` semantics，不删除 TypeScript fallback，不使用 hidden TS fallback as rollback，不扩展 `/team readiness`，不扩大 Go authority，不 commit/tag/push，不启动 later work。

### v0.4.26 — Pipeline Owner Contract / Release Boundary（Slice 1）

目标：启动 v0.4.26 Go Helper Artifact Generation Pipeline Prototype Checkpoint，新增 docs/tests-only pipeline owner contract / release boundary，定义 artifact generation pipeline prototype scope 与 GitHub-only release/package boundary；该 Slice 是 GitHub-only evidence，不是 npm/package/default/native/fallback approval，不启动 Slice 2。

交付：

- 新增 owner contract doc：`docs/perf/v0.4.26-go-helper-artifact-pipeline.md`。
- 新增 focused docs guard：`tests/suites/go-kernel-v0426-artifact-pipeline-contract-docs.cjs`。
- 链接 v0.4.25 final checkpoint、owner doc、Slice 1-6 focused guards。
- 记录 T013 runtime boundary：TS/pi control plane mandatory；Go helper behind TS adapter/ports via subprocess/RPC/stdin-stdout；no native Go pi extension/provider ABI assumption；Go authority parser-only `tmuxSnapshotParse`。
- 定义 in-scope pipeline areas：build matrix definition、helper build command policy、artifact output path policy、local/CI artifact output prototype、manifest/checksum/provenance/license/executable generation prototype、attestation/signing placeholders、direct artifact smoke and clean-install handoff、storage/release/rollback policy、final checkpoint guardrail。
- 定义 release/package boundary：GitHub-only checkpoint；no npm package metadata by default；GitHub Actions artifacts future prototype storage after approval；GitHub release assets future explicit release-policy gate；npm companion packages future package-owner gate；no postinstall/download/install-time build policy remains binding。
- 定义 build matrix placeholders：linux-x64-glibc、linux-arm64-glibc、darwin-arm64、darwin-x64、win32-x64 as candidate rows；musl/win32-arm64/others future unsupported until proven；no support claim yet。
- 定义 STOP gates：no helper build implementation、no CI workflow implementation、no generated artifacts/manifests、no npm/version/package metadata/optionalDependencies/lifecycle/downloads/scripts/lockfiles/go modules/native binaries/tarballs/GitHub release assets/npm package inclusion/default Go/go-cutover/go-packaged-preview/fallback deletion/native Go pi extension/readiness expansion/Slice 2。

验收：

- syntax check 和 focused contract suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不实现 helper build commands，不新增 CI workflow，不生成 artifacts/manifests，不实现 production runtime resolver，不改 package metadata，不 check in native binaries/tarballs/generated manifests/artifacts，不启用 default Go，不改 `go-cutover` 或 `go-packaged-preview` semantics，不删除 TypeScript fallback，不使用 hidden TS fallback as rollback，不扩展 `/team readiness`，不扩大 Go authority，不启动 Slice 2。

### v0.4.26 — Build Matrix and Build Command Policy（Slice 2）

目标：docs/tests-only 地定义 future Go helper artifact pipeline 的 build matrix 与 build command policy，冻结 candidate OS/arch/libc rows、executable naming、runner/toolchain assumptions、cross-compile vs native-runner policy，以及 `go build` 只能用于 explicit artifact-generation CI/local prototype after approval；不实现 helper build，不新增 CI workflow，不启动 Slice 3。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.26-go-helper-artifact-pipeline.md` 的 Slice 2 build matrix and command policy。
- 新增 focused policy guard：`tests/suites/go-kernel-v0426-build-matrix-policy-docs.cjs`。
- candidate/prototype rows：linux-x64-glibc、linux-arm64-glibc、darwin-arm64、darwin-x64、win32-x64；每行定义 OS、arch、libc/n/a、executable filename、permission behavior、runner assumption、validation expectation。
- unsupported rows：linux-x64-musl、linux-arm64-musl、win32-arm64、other os/arch/libc targets；future unsupported until proven，fail-closed，no normal-user support claim。
- build command policy：`go build` may be used only in explicit artifact-generation CI/local prototype after approval；never in npm lifecycle/package install/runtime resolver/default user path；no hidden network fetch、lifecycle download、install-time build、package scripts。
- Go module policy：adding go.mod/go.sum remains STOP unless separately approved；future module need requires separate owner decision。
- 保持 release/package boundary：GitHub-only checkpoint；no npm package metadata by default；GitHub Actions artifacts future prototype storage after approval；GitHub release assets future release-policy gate；npm companion packages future package-owner gate；no postinstall/download/install-time build policy remains binding。

验收：

- syntax check 和 focused build matrix policy suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不运行 `go build`，不实现 helper build commands，不新增 CI workflow，不生成 artifacts/manifests，不新增 go.mod/go.sum，不改 package metadata，不新增 package scripts，不启用 default Go，不改 `go-cutover` 或 `go-packaged-preview` semantics，不删除 TypeScript fallback，不扩展 `/team readiness`，不扩大 Go authority，不启动 Slice 3。

### v0.4.26 — Local/CI Artifact Output Policy and Prototype（Slice 3）

目标：docs/tests 或 test-local temp/ignored-output fixture only 地定义 future generated helper artifacts 在 local/CI prototype runs 中可写入的位置，证明不发生 source/package inclusion；不 build real helpers，不生成 real artifacts/manifests，不新增 CI workflow，不启动 Slice 4。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.26-go-helper-artifact-pipeline.md` 的 Slice 3 local/CI artifact output policy/prototype。
- 新增 focused output policy guard：`tests/suites/go-kernel-v0426-artifact-output-policy.cjs`。
- local output policy：OS temp root preferred for tests；optional ignored local directory `.agentteam-artifacts/` may be named but must be ignored and excluded from package files；generated outputs must never be committed。
- CI output policy：CI workspace outputs and GitHub Actions artifact upload may be future prototype storage after explicit approval；no GitHub release assets in Slice 3；no npm package inclusion；no install/runtime download path；no CI workflow added。
- conceptual artifact file list per build-matrix row：helper executable、manifest JSON、checksum file、provenance metadata、license metadata/copy、optional attestation placeholder。
- cleanup/no-source-inclusion behavior：test output roots under OS temp or ignored local dirs created/cleaned at runtime；repository/package scans reject native binaries、tarballs、generated manifests/artifacts、generated package artifacts；candidate output names are package-relative and safe。
- 保持 Slice 1 release/package boundary 与 Slice 2 build command policy。

验收：

- syntax check 和 focused output policy suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不运行 `go build`，不实现 helper build commands，不新增 CI workflow，不生成 real artifacts/manifests，不新增 go.mod/go.sum，不改 package metadata，不新增 package scripts，不启用 default Go，不改 `go-cutover` 或 `go-packaged-preview` semantics，不删除 TypeScript fallback，不扩展 `/team readiness`，不扩大 Go authority，不启动 Slice 4。

### v0.4.26 — Manifest / Checksum / Provenance / License / Executable Generator Prototype（Slice 4）

目标：从 v0.4.25 manifest validation 进入 test-local generation prototype，从 artifact output files 生成 manifest/checksum/provenance/license/executable metadata；所有 generated files 仅在 OS temp dirs runtime 生成并清理；不 build real helpers，不 commit artifacts，不改 package/runtime/release behavior，不启动 Slice 5。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.26-go-helper-artifact-pipeline.md` 的 Slice 4 generator prototype evidence。
- 新增 focused generator suite：`tests/suites/go-kernel-v0426-manifest-provenance-generator.cjs`。
- suite 在 OS temp dirs 创建 fake helper artifact output tree，并生成 schemaVersion、packageName/packageVersion、module、helperVersion、protocolVersion、capabilities、OS/arch/libc、safe package-relative artifact path、size、SHA-256、executable policy、sourceRevision/workflowRun/toolchain/generatedAt placeholders、license checksum、attestation/signing placeholders。
- validates generated metadata against v0.4.25 shape：required fields present；checksum/size match；executable policy matches platform；license/provenance present；no path traversal/absolute paths；module/protocol/capability match `tmuxSnapshotParse`/`1`。
- negative cases fail closed/no-leak：missing provenance、missing license、checksum mismatch、size mismatch、unsafe path、wrong module/protocol/capability、real signing/attestation claim without proof。
- 明确 generated metadata is not committed and not release metadata；attestation/signing placeholders are not real signing；no package/native/default/fallback behavior approved；preserve Slice 1-3 boundaries。

验收：

- syntax check 和 focused generator suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不运行 `go build`，不实现 helper build commands，不新增 CI workflow，不生成 repo artifacts/manifests，不新增 go.mod/go.sum，不改 package metadata，不新增 package scripts，不启用 default Go，不改 `go-cutover` 或 `go-packaged-preview` semantics，不删除 TypeScript fallback，不扩展 `/team readiness`，不扩大 Go authority，不启动 Slice 5。

### v0.4.26 — Artifact Smoke and Clean-Install Handoff（Slice 5）

目标：展示 v0.4.26 pipeline prototype 的 generated-temp artifact outputs 如何被 smoke-tested，并 test-locally hand off 到 future clean-install/package proof；明确 real prototype evidence 与 simulated package install behavior 的边界；不 build real helpers，不 commit artifacts，不改 package/runtime/release behavior，不启动 Slice 6。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.26-go-helper-artifact-pipeline.md` 的 Slice 5 artifact smoke / clean-install handoff evidence。
- 新增 focused smoke/handoff suite：`tests/suites/go-kernel-v0426-artifact-smoke-handoff.cjs`。
- suite 在 OS temp dirs 创建 generated-temp artifact output：fake helper executable/script、manifest/checksum/provenance/license metadata、package-relative safe paths。
- smoke proof：controlled test-local helper read/invoke；deterministic health response；deterministic minimal `tmuxSnapshotParse` response or parser capability smoke；explicit local/test path only；no default resolver activation；no hidden TS fallback on explicit smoke failure。
- handoff proof：copy/map generated-temp artifact metadata into temp installed layout like v0.4.25 clean-install simulation；assert package install remains simulated；companion package metadata/optional dependency/npm tarball/user install/default resolver remain future work；generated artifact is prototype input to future clean-install proof, not normal-user availability proof。
- negative cases fail closed/no-leak：corrupt health JSON、missing `tmuxSnapshotParse` capability、wrong protocol/helper version、checksum mismatch、missing installed layout mapping、attempted default resolver use、attempted hidden TS parser fallback。
- 明确 no source checkout dependency、no Go toolchain/network/lifecycle download/install-time build/manual helper env in simulated handoff；preserve Slice 1-4 boundaries。

验收：

- syntax check 和 focused smoke/handoff suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不运行 `go build`，不实现 helper build commands，不新增 CI workflow，不生成 repo artifacts/manifests，不新增 go.mod/go.sum，不改 package metadata，不新增 package scripts，不启用 default Go，不改 `go-cutover` 或 `go-packaged-preview` semantics，不删除 TypeScript fallback，不扩展 `/team readiness`，不扩大 Go authority，不启动 Slice 6。

### v0.4.26 — Storage, Release, and Rollback Policy（Slice 6）

目标：docs/tests policy only 地决定 generated artifact outputs 在 package publication 之前可如何存储，定义 GitHub Actions artifact prototype storage、release assets future gate、npm companion package future gate、retention/access expectations，以及 rollback/deprecation/default-disable/version-skew policy；不 build real helpers，不新增 CI workflow，不 commit artifacts，不改 package/runtime/release behavior，不启动 Slice 7。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.26-go-helper-artifact-pipeline.md` 的 Slice 6 storage/release/rollback policy。
- 新增 focused docs guard：`tests/suites/go-kernel-v0426-storage-release-policy-docs.cjs`。
- storage decision matrix rows：OS temp/local outputs for tests、ignored local prototype directory、CI workflow workspace outputs、GitHub Actions artifacts for prototype review、GitHub release assets、npm companion packages、main package inclusion、postinstall/download/install-time build。
- policy：OS temp/local test outputs allowed only as test-local and cleaned；ignored local prototype directory future only after explicit approval and excluded from package files；CI workspace outputs future only after approval；GitHub Actions artifacts future prototype storage after approval and review-only / limited retention / not release asset / not install source / not normal-user availability proof；GitHub release assets STOP until explicit release-policy approval；npm companion packages STOP until package-owner approval；main package inclusion STOP；postinstall/download/install-time build prohibited。
- rollback/deprecation/default-disable scenarios：bad generated artifact、bad manifest/checksum/provenance/license、bad helper smoke、stale helper、unsupported platform、broken diagnostics、bad storage upload、accidental release asset、package deprecation/unpublish、bad future default resolver。
- version-skew policy：package/helper/protocol/module/capability/platform/checksum must match；skew fails closed；no hidden TS fallback as rollback after cutover；rollback is corrected release/tag/package/deprecation/default-disable policy。
- preserve Slice 1-5/T013 boundaries：TS/pi control plane mandatory；Go helper behind TS adapter/ports；Go parser-only `tmuxSnapshotParse`；`compactReadModelFingerprint` non-cutover / TypeScript fallback；no native Go pi extension assumption。

验收：

- syntax check 和 focused storage/release policy suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不运行 `go build`，不实现 helper build commands，不新增 CI workflow，不生成 repo artifacts/manifests，不新增 go.mod/go.sum，不改 package metadata，不新增 package scripts，不启用 default Go，不改 `go-cutover` 或 `go-packaged-preview` semantics，不删除 TypeScript fallback，不使用 hidden TS fallback as rollback，不扩展 `/team readiness`，不扩大 Go authority，不启动 Slice 7。

### v0.4.26 — Final Checkpoint and Guardrail Consolidation（Slice 7）

目标：新增 GitHub-only v0.4.26 Go helper artifact generation pipeline prototype final checkpoint docs/tests，汇总 Slice 1-6 evidence、validation matrix、GO/STOP decision、remaining blockers，并冻结 runtime/package/default/native/fallback/readiness invariants；不 build real helpers，不新增 CI workflow，不生成 artifacts，不改 package/runtime/release behavior，不 commit/tag/push，不启动 later work。

交付：

- 新增 final checkpoint doc：`docs/perf/v0.4.26-go-helper-artifact-pipeline-checkpoint.md`。
- 新增 focused checkpoint guard：`tests/suites/go-kernel-v0426-artifact-pipeline-checkpoint-docs.cjs`。
- 更新 owner contract doc：`docs/perf/v0.4.26-go-helper-artifact-pipeline.md` 链接 final checkpoint，并更新 final recommendation 为 GitHub-only v0.4.26 checkpoint review。
- checkpoint link prior checkpoint：`docs/perf/v0.4.25-native-helper-availability-proof-checkpoint.md`。
- checkpoint link v0.4.26 artifacts/guards：owner doc、Slice 1 contract guard、Slice 2 build matrix guard、Slice 3 output policy guard、Slice 4 generator guard、Slice 5 smoke/handoff guard、Slice 6 storage/release guard、Slice 7 checkpoint guard。
- 总结 Slice 1-6 outcomes：pipeline owner/release boundary、build matrix/build command policy、local/CI output policy/prototype、manifest/checksum/provenance/license/executable generator prototype、artifact smoke/clean-install handoff、storage/release/rollback policy。
- 明确 GO only for GitHub-only v0.4.26 checkpoint after leader/user approval；GO for evidence only；STOP for helper build commands、`go build`、CI workflow、active GitHub Actions artifact storage、release assets、npm companion packages、main package inclusion、npm version/publish、package metadata/scripts、optionalDependencies、lifecycle downloads、lockfiles、go.mod/go.sum、native binaries/tarballs/generated artifacts、default Go、go-cutover/go-packaged-preview semantic changes、TypeScript fallback deletion、hidden TS fallback rollback、compactReadModelFingerprint cutover、broad Go authority、native Go pi extension、`/team readiness` expansion、commit/tag/push。
- 明确 v0.4.26 still does not prove normal-user native availability、does not generate release artifacts、does not approve package metadata、does not pass packaged/default/fallback deletion gate；列出 remaining blockers 和 validation matrix。

验收：

- syntax check 和 focused checkpoint suite 通过；`node tests/run.cjs`、`npm run typecheck`、`npm run -s check:boundaries`、`git diff --check` 通过；可行时 default bench 与 `PI_AGENTTEAM_KERNEL=go-packaged-preview` bench 通过；不运行 `go build`，不实现 helper build commands，不新增 CI workflow，不生成 repo artifacts/manifests，不新增 go.mod/go.sum，不改 package metadata，不新增 package scripts，不启用 default Go，不改 `go-cutover` 或 `go-packaged-preview` semantics，不删除 TypeScript fallback，不使用 hidden TS fallback as rollback，不扩展 `/team readiness`，不扩大 Go authority，不 commit/tag/push，不启动 later work。

### v0.4.27 — Generated Artifact Clean-Install Consumption Owner Contract（Slice 1）

目标：启动 v0.4.27 Generated Artifact Clean-Install Consumption Checkpoint，新增 docs/tests-only owner contract，定义 future clean-install proof 如何 consume v0.4.26-style generated helper artifacts；该 Slice 是 GitHub-only evidence，不是 package/native/default/fallback/readiness approval，不启动 Slice 2。

交付：

- 新增 owner contract doc：`docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md`。
- 新增 focused docs guard：`tests/suites/go-kernel-v0427-clean-install-consumption-contract-docs.cjs`。
- 链接 v0.4.26 final checkpoint、v0.4.26 owner doc、v0.4.26 checkpoint/smoke-handoff guards、v0.4.25 clean-install smoke 和 final native availability checkpoint。
- 定义 clean-install consumption boundary：generated artifact input is pre-existing evidence；installed layout starts from clean temp/package-manager-equivalent root, not source checkout；manifest/helper paths package-relative/allowlisted/traversal-safe；checksum/size/provenance/license/executable/module/protocol/package/helper/capability/platform metadata required；no Go toolchain/source checkout/manual helper env/lifecycle download/install-time build/hidden network/default resolver activation。
- 冻结 T013 runtime boundary：TS/pi control plane mandatory；pi extension/provider/tool surfaces remain TS/JS/Node-based；Go helper behind TS adapter/ports via subprocess/RPC/stdin-stdout；no native Go pi extension/provider ABI assumption；Go authority parser-only `tmuxSnapshotParse`；`compactReadModelFingerprint` TypeScript fallback/non-cutover。
- 定义 owner responsibilities：artifact producer、consumption owner、package owner、release owner、runtime owner、readiness owner 各自边界；不批准 helper build/release assets/npm companion packages/default resolver/package metadata/readiness expansion。
- 定义 STOP gates：no production clean-install consumption implementation、production resolver/package manager install behavior changes、artifact download、CI workflow、active GitHub Actions artifact storage、GitHub release assets、npm companion packages、main package inclusion、npm version/publish、package metadata/optionalDependencies/lifecycle/package scripts/lockfiles/go modules/native binaries/tarballs/generated manifests/artifacts/default Go/go-cutover/go-packaged-preview semantic changes/TypeScript fallback deletion/hidden TS fallback/broad Go authority/native Go pi extension/readiness expansion/Slice 2。

验收：

- syntax check 和 focused contract suite 通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不实现 production clean-install consumption，不改 production resolver/package manager install behavior，不改 package/native/default/fallback/readiness behavior，不运行 `go build`，不新增 CI workflow/artifact storage/release assets/npm package metadata，不 check in native binaries/tarballs/generated manifests/artifacts，不启用 default Go，不改 `go-cutover` 或 `go-packaged-preview` semantics，不删除 TypeScript fallback，不扩展 `/team readiness`，不扩大 Go authority，不启动 Slice 2。

### v0.4.27 — Artifact Bundle Contract from v0.4.26 Outputs（Slice 2）

目标：在 docs/tests-only + OS temp fixture 范围内，定义 future pipeline output bundle 如何作为 clean-install consumption proof 的输入；该 Slice 是 future input contract，不是 release artifact、normal-user availability proof、package/default/fallback approval，不启动 Slice 3。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md` 的 Slice 2 artifact bundle contract 章节。
- 新增 focused suite：`tests/suites/go-kernel-v0427-artifact-bundle-contract.cjs`。
- 定义 bundle shape：helper executable、`manifest.json`、`SHA256SUMS` checksum file、`provenance.json` placeholder、license metadata/copy/checksum、attestation/signing placeholder。
- 定义 naming/version dimensions：module `tmuxSnapshotParse`、helperVersion、protocolVersion `1`、packageVersion `0.6.8`、os、arch、linux libc where applicable。
- 定义 safe package-relative paths only：no absolute path、no `..` traversal、no backslash escape、no repo/cwd/temp absolute leakage in accepted metadata。
- 证明 compatibility with v0.4.26 generator shape and v0.4.25 manifest validation concepts：schema/package/module/helper/protocol/capability/platform/libc/checksum/size/executable/provenance/license/attestation fields and fail-closed unsafe path handling。
- suite 可在 OS temp root 下创建 fake bundle、validate/cleanup，并扫描 repo/package 确认 no checked-in generated bundle/artifact/manifest/tarball/native binary。
- 保持 STOP gates：no `go build`、helper build command、CI workflow、upload/storage、GitHub release assets、package metadata、optionalDependencies、package scripts、lifecycle/postinstall/download/install-time build、npm pack/version/publish、go.mod/go.sum/lockfiles/native binaries/tarballs/generated artifacts/manifests、production resolver/default/go-cutover/go-packaged-preview/TypeScript fallback/`/team readiness`/Go authority changes、Slice 3。

验收：

- syntax check 和 focused artifact bundle suite 通过；Slice 1 guard 仍通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不生成/提交 real pipeline artifacts，不启动 Slice 3 install layout matrix，不改 package/runtime/default/native/fallback/readiness behavior，不 commit/tag/push。

### v0.4.27 — Future Package / Install Layout Decision Matrix（Slice 3）

目标：在 docs/tests-only 范围内，比较 future companion package 与 main-package inclusion 的 clean-install consumption 安装布局；该 Slice 是 future contract/matrix，不批准 package metadata、optionalDependencies、package files 变更，不启动 Slice 4。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md` 的 Slice 3 future package/install layout decision matrix 章节。
- 新增 focused guard：`tests/suites/go-kernel-v0427-install-layout-matrix-docs.cjs`。
- 更新 v0.4.27 Slice 1/2 guards 允许已批准的 Slice 3 section，同时继续拒绝 Slice 4 section。
- 定义 candidate layouts：future platform companion package preferred path、main package bundled fallback path（future gate only / STOP until approval）、unsupported os/arch/libc rows fail-closed。
- 定义 package-relative installed path concepts：`native/tmuxSnapshotParse/<helperVersion>/<platform>/agentteam-tmuxSnapshotParse`、`manifest.json`、`SHA256SUMS`、`provenance.json`、`LICENSE`/`license.json`；仅 future contract，不是 package files、package metadata、install simulation 或 checked-in generated manifests。
- 定义 resolver input expectations：manifest/helper/checksum/provenance/license paths package-relative/traversal-safe；platform tuple os/arch/libc；module/capability `tmuxSnapshotParse`；protocol/helper/package version matching；checksum/provenance/license/platform/module/capability/protocol/helper/package skew fail closed；不激活 production default discovery。
- 定义 cleanup/upgrade/stale-helper expectations：new helper replaces old layout only after future package-owner approval；stale helper/metadata fails closed；version/protocol/platform skew fails closed；cleanup/upgrade 不在 Slice 3 模拟。
- 明确 package ownership boundary：companion package is future package-owner decision only；main package inclusion STOP until future approval；no package metadata/optionalDependencies/package files/scripts/lifecycle/npm pack-version-publish。

验收：

- syntax check 和 focused install layout matrix guard 通过；Slice 1/2 guards 仍通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不改 `package.json` metadata/files/optionalDependencies/scripts/version，不新增 package manager install simulation/npm tarball/lifecycle/postinstall/download/install-time build/native binaries/tarballs/generated manifests/generated package artifacts/go.mod/go.sum/lockfiles，不改 production resolver/default/go-cutover/go-packaged-preview/TypeScript fallback/`/team readiness`/Go authority，不启动 Slice 4，不 commit/tag/push。

### v0.4.27 — Clean-Install Consumption Simulation（Slice 4）

目标：用 OS temp roots 模拟 artifact bundle → future installed layout → validate/smoke 的 clean-install consumption proof；范围是 docs/tests/temp-fixture only，不做真实 package-manager install、npm tarball、runtime discovery，不启动 Slice 5。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md` 的 Slice 4 clean-install consumption simulation 章节。
- 新增 focused suite：`tests/suites/go-kernel-v0427-clean-install-consumption.cjs`。
- 更新 v0.4.27 Slice 1–3 guards 允许已批准的 Slice 4 section，同时继续拒绝 Slice 5 section。
- suite 在 OS temp root 创建 fake artifact bundle，再复制/映射到 temp installed layout，所有路径保持 package-relative；cleanup temp roots。
- validate manifest/checksum/executable/license/provenance/attestation placeholders、module `tmuxSnapshotParse`、capability、protocolVersion、helperVersion、packageVersion、os/arch/libc tuple。
- positive supported-row smoke 使用 direct explicit test path only，返回 deterministic health response 和 minimal `tmuxSnapshotParse` capability smoke。
- negative fail-closed cases 覆盖 missing helper、wrong platform/libc、non-executable POSIX helper、checksum mismatch、stale helper、wrong package/helper/protocol/capability、missing license/provenance/attestation、corrupt smoke output、attempted default resolver use、attempted hidden TS parser fallback。
- no-leak assertions：failure output 不包含 helper absolute path、temp root、repo/cwd、stdout/stderr、raw manifest/checksum/provenance/license body、stack traces、package internals、mailbox/report text。
- assert no source checkout dependency、no Go toolchain、no network/lifecycle download/install-time build/manual helper env；repo/package scan confirms no checked-in generated bundles/artifacts/manifests/tarballs/native binaries。

验收：

- syntax check 和 focused clean-install consumption suite 通过；Slice 1–3 guards 仍通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不运行 `go build`，不实现 build commands/CI/artifact upload/release assets，不做 real package-manager install/npm tarball/npm pack-version-publish/package metadata-files-optionalDependencies-scripts-lifecycle/postinstall/download/install-time build，不改 production resolver/runtime discovery/default Go/go-cutover/go-packaged-preview/TS fallback/`/team readiness`/Go authority，不启动 Slice 5，不 commit/tag/push。

### v0.4.27 — Resolver Discovery Contract Without Behavior Change（Slice 5）

目标：定义 future approved resolver 如何从 installed layout 发现 helper，但 v0.4.27 不改变 production resolver/default behavior；范围是 docs/tests-only + simulated discovery helper in tests，不启动 Slice 6。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md` 的 Slice 5 resolver discovery contract 章节。
- 新增 focused suite：`tests/suites/go-kernel-v0427-resolver-discovery-contract.cjs`。
- 更新 v0.4.27 Slice 1–4 guards 允许已批准的 Slice 5 section，同时继续拒绝 Slice 6 section。
- 定义 future resolver inputs：installed root、package-relative manifest/helper/checksum/provenance/license paths、os/arch/libc platform tuple、module/capability/protocol/helper/package version。
- 定义 path rules：package-relative only、no absolute/path traversal/backslash escape、no repo/cwd/temp root leakage in accepted metadata。
- 定义 platform matching：os/arch/libc exact matching；unsupported rows fail closed and do not prove normal-user availability。
- 定义 precedence/boundaries：explicit helper path remains highest precedence；simulated discovery future-approved only；default/unset/disabled/typescript/go/auto/current `go-cutover` must not read packaged layout；`go-packaged-preview` semantics unchanged。
- 定义 failure mapping：missing manifest/helper、invalid path、unsupported platform、checksum/provenance/license mismatch、version/protocol/capability skew、non-executable helper、corrupt smoke output map to compact diagnostics/no-leak vocabulary。
- 断言 runtime authority invariants：`compactReadModelFingerprint` non-cutover/TypeScript fallback；`tmuxSnapshotParse` only cutover-owned candidate；Go authority parser-only behind TS adapter/ports。

验收：

- syntax check 和 focused resolver discovery contract suite 通过；Slice 1–4 guards 仍通过；可行时 `node tests/run.cjs`、`npm run typecheck`、`git diff --check` 通过；不实现 production resolver/runtime discovery/default discovery，不激活 packaged discovery for default/unset/disabled/typescript/go/auto/current go-cutover，不改 `go-packaged-preview` semantics/helper path precedence/default Go/TS fallback/hidden fallback rollback/`/team readiness`/package metadata/build-CI-artifact-package behavior，不启动 Slice 6，不 commit/tag/push。

### v0.4.27 — Failure Rollback No-Leak Hardening（Slice 6）

目标：把 v0.4.25/v0.4.26 compact fail-closed/no-leak diagnostics 与 rollback policy 应用到 v0.4.27 install-consumption 层；范围是 docs/tests-only，不启动 Slice 7。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md` 的 Slice 6 failure rollback no-leak hardening 章节。
- 新增 focused suite：`tests/suites/go-kernel-v0427-consumption-failure-rollback-no-leak.cjs`。
- 更新 v0.4.27 Slice 1–5 guards 允许已批准的 Slice 6 section，同时继续拒绝 Slice 7 section。
- 定义 install-consumption failure vocabulary：`artifact_missing`、`metadata_invalid`、`integrity_mismatch`、`artifact_not_executable`、`unsupported_platform`、`version_skew`、`protocol_skew`、`capability_skew`、`license_missing`、`provenance_missing`、`install_layout_invalid`、`package_unavailable`、`smoke_corrupt_output`。
- 定义 compact diagnostic contract：status `unavailable`、result marker `fail-closed`、failureKind、remediation、releaseDecision、blockerStatus、rollbackPolicy；不暴露 raw details。
- 定义 no-leak expectations：不泄漏 helper absolute path、temp/installed root、repo/cwd、stdout/stderr、raw manifest/checksum/provenance/license body、raw package internals、stack trace、mailbox/report text。
- 定义 unsupported-platform policy：unsupported os/arch/libc rows fail closed，并继续 block normal-user availability/default/native/fallback deletion，除非 support policy narrowed and explicitly approved。
- 定义 rollback boundary：rollback 是 corrected release/tag/package/deprecation/default-disable policy，不是 cutover 后 hidden runtime TypeScript fallback；explicit future consumption smoke/cutover failure 不得 silent TS parser fallback。

验收：

- syntax check 和 focused failure rollback no-leak suite 通过；Slice 1–5 guards 仍通过；可行时 `node tests/run.cjs`、`git diff --check` 通过；不新增 normal-user UI、model-callable tools、ambient `/team` diagnostics 或 `/team readiness` expansion，不改变 production diagnostics/resolver/default behavior，不删除 TypeScript fallback，不使用 hidden TS fallback as rollback，不新增 package/build/CI/artifact/native metadata/files，不运行 `go build`，不新增 go.mod/go.sum/lockfiles，不启动 Slice 7，不 commit/tag/push。

### v0.4.27 — Package Native Guardrails and Readiness Containment（Slice 7）

目标：集中守住 v0.4.27 没有向 package/native/runtime/UI 滑坡；范围是 docs/tests-only guardrail consolidation，不启动 Slice 8 final checkpoint。

交付：

- 更新 owner contract doc：`docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md` 的 Slice 7 package/native/readiness/runtime guardrail consolidation 章节。
- 新增 focused suite：`tests/suites/go-kernel-v0427-package-native-guardrails.cjs`。
- 更新 v0.4.27 Slice 1–6 guards 允许已批准的 Slice 7 section，同时继续拒绝 Slice 8/final checkpoint section。
- 守住 package/npm：`package.json` version remains `0.6.8`；no `npm version`/`npm publish`/npm pack-publish-package metadata approval；no optionalDependencies/native package metadata/package files inclusion/package scripts/lifecycle hooks/postinstall/download/install-time build。
- 守住 modules/lockfiles/artifacts：no package-lock/npm-shrinkwrap/go.mod/go.sum；no checked-in native binaries/tarballs/generated artifacts/generated manifests/checksum/provenance/attestation/package artifacts；`.agentteam-artifacts/` 等 local prototype output must remain ignored/excluded and not committed。
- 守住 build/CI/release：no helper build commands、no running `go build`、no CI workflow、no GitHub Actions artifact upload、no GitHub release assets。
- 守住 runtime/modes：default/unset remains safe；no default Go；no production resolver/default discovery；no `go-cutover` or `go-packaged-preview` semantic changes；no TypeScript fallback deletion；`compactReadModelFingerprint` remains TypeScript fallback/non-cutover。
- 守住 UI/tool/readiness：`/team readiness` remains transitional reviewer tooling；no new `/team` options、model-callable tools、ambient diagnostics、UI expansion、runtime control plane。
- 守住 Go authority：parser-only `tmuxSnapshotParse` candidate behind TS adapter/ports；Go 不拥有 tmux execution/capture、state writes、worker lifecycle、task/report governance、PlanRun、full-text boundaries、package/release authority、UI rendering、command control plane。

验收：

- syntax check 和 focused package/native guardrails suite 通过；Slice 1–6 guards 仍通过；可行时 `node tests/run.cjs`、`git diff --check` 通过；不新增 final checkpoint doc/guard，不总结 v0.4.27 final GO/STOP as Slice 8，不改 production code，不改 package/native/runtime/UI/readiness behavior，不 commit/tag/push。

### v0.4.27 — Generated Artifact Clean-Install Consumption Gate Final Checkpoint（Slice 8）

目标：新增 GitHub-only v0.4.27 final checkpoint docs/tests，汇总 Slice 1–7 evidence、GO/STOP decision、validation matrix、remaining blockers，并冻结 runtime/package/default/native/fallback/readiness invariants；不得 commit/tag/push，不做 release/package/build/default 行为。

交付：

- 新增 final checkpoint doc：`docs/perf/v0.4.27-generated-artifact-clean-install-consumption-checkpoint.md`。
- 新增 focused checkpoint guard：`tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs`。
- 更新 owner/evidence doc：`docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md` 链接 final checkpoint，并将 final recommendation 更新为 GitHub-only v0.4.27 checkpoint review。
- 更新 v0.4.27 Slice 1–7 guards 允许 final checkpoint section/link，同时继续拒绝 v0.4.28 implementation sections。
- 如需要更新 `.gitignore` allowlist final checkpoint doc。
- GO 覆盖：GitHub-only v0.4.27 evidence after leader/user approval；artifact bundle contract from v0.4.26 outputs；future package/install layout matrix；temp clean-install consumption simulation；resolver discovery contract only without production behavior change；failure/rollback/unsupported-platform/no-leak hardening；package/native/readiness/runtime guardrail consolidation。
- STOP 覆盖：npm version/publish/pack approval、package version/metadata/files/optionalDependencies/scripts/lifecycle/postinstall/download/install-time build、lockfiles/go.mod/go.sum/native binaries/tarballs/generated artifacts-manifests-checksum-provenance-attestation-package artifacts、helper build/`go build`/CI/upload-storage/release assets/npm companion/main package inclusion、default Go/default resolver/go-cutover/go-packaged-preview semantic changes/TypeScript fallback deletion/hidden TS fallback rollback/compactReadModelFingerprint cutover、broad Go authority/native Go pi extension/`/team readiness` expansion/normal-user UI-tool-runtime diagnostics、commit/tag/push before approval。
- Validation matrix 覆盖 Slice 1–8 suites、v0.4.25 availability proof、v0.4.26 artifact pipeline、v0.4.22 package/native guardrails、v0.4.23 diagnostics/no-leak/parser failure、v0.4.24 readiness containment、`node tests/run.cjs`、`npm run typecheck`、`npm run -s check:boundaries`、`git diff --check`、default bench、`PI_AGENTTEAM_KERNEL=go-packaged-preview` bench、package/native sanity scans、no checked-in generated output scans。
- Remaining blockers 覆盖 actual helper build implementation、approved CI artifact storage、real generated artifacts across final matrix、real clean install across supported platforms/package managers、package release ownership、companion package metadata approval、normal-user diagnostics UX if needed、production resolver/default parser failure proof、rollback/default-disable execution plan、explicit user approval for package/default/fallback deletion。

验收：

- syntax check 和 focused checkpoint guard 通过；Slice 1–7 guards 仍通过；`git diff --check` 通过；可行时 `node tests/run.cjs` 通过；不运行 npm version/publish/pack，不运行 `go build`，不 commit/tag/push。

### v0.6.28 — Final Prep and v0.6.29 Entry

目标：在正式 v0.6.29 builder/resolver 改造前，短小记录版本命名纠偏与入口决策；不实现 v0.6.29 真实 builder/resolver/smoke。

交付：`docs/perf/v0.6.28-final-prep-and-v0.6.29-entry.md`、`tests/suites/go-kernel-v0628-final-prep-entry-guard.cjs`、`.gitignore` allowlist。确认 `v0.4.27` 是 legacy/misnamed tag，canonical roadmap checkpoint 是 `v0.6.27`，同指向 `bc25c3c`；从 v0.6.28/v0628 起使用新 namespace；`package.json` remains `0.6.8` 且 roadmap checkpoint tag 与 npm package version 分离。

v0.6.29 入口：GO for real local/reviewer-controlled Go helper artifact builder and explicit preview manifest resolver，以 `tmuxSnapshotParse` 为首个目标；下一版本可在 reviewer/CI utility 中运行 `GO111MODULE=off go build` 输出到 OS temp 或 ignored `.agentteam-artifacts/`，并做 real helper JSON-RPC `health`/`tmuxSnapshotParse`、explicit manifest resolver、`go-packaged-preview` explicit-only integration、real clean-install preview smoke。

v0.6.28 STOP：不实现 builder/resolver/smoke，不运行 `go build`，不新增 CI/upload/release/package metadata/optionalDependencies/scripts/lifecycle/postinstall/download/install-time build/go.mod/go.sum/lockfiles/native binaries/tarballs/generated artifacts/manifests，不改 default Go/default resolver/TS fallback/go-cutover/go-packaged-preview semantics，不扩展 `/team readiness` 或 normal-user UI/tool/runtime diagnostics，不 npm version/publish，不 commit/tag/push。

### v0.6.29 — Real Go Helper Artifact Entry Checkpoint

目标：新增 final checkpoint docs/guard，汇总已完成的真实 evidence：local/reviewer-controlled helper artifact builder、host-platform `GO111MODULE=off go build`、real metadata validation and JSON-RPC `health`/`tmuxSnapshotParse` smoke、pure explicit packaged manifest resolver、explicit-only `go-packaged-preview` manifest/root integration、real artifact → temp installed layout → resolver → adapter preview parse。

交付：`docs/perf/v0.6.29-real-go-helper-artifact-entry-checkpoint.md`、`tests/suites/go-kernel-v0629-real-implementation-checkpoint-docs.cjs`、`.gitignore` allowlist。该 checkpoint 不新增 runtime 行为；`package.json` remains `0.6.8`，不新增 npm lifecycle/install/package metadata/optionalDependencies/scripts、CI workflow/upload/release assets、go.mod/go.sum/lockfiles、checked-in native binaries/generated manifests/tarballs/artifacts；default/disabled/typescript/go/auto/current `go-cutover` unchanged，`compactReadModelFingerprint` remains TypeScript fallback/non-cutover，Go authority remains parser-only `tmuxSnapshotParse` preview path，`/team readiness` not expanded。

剩余 blockers：host-platform only, not cross-platform matrix；temp installed layout preview, not real package-manager install；no normal-user native availability proof；later versions still need CI artifact storage/cross-platform matrix/package metadata/release ownership/default resolver proof/fallback deletion approval。

### v0.6.30–v0.6.32 — 当前 Go Helper 状态与 Default Go / Fallback 删除路线

当前状态（截至 2026-06-15）：

- `v0.6.30` 已完成并 tag/push：GitHub-only CI review artifact prototype，包含 review-only workflow、`--ci-review` artifact index、single required `ubuntu-latest / linux-x64-glibc` matrix row、download/reverify verifier、explicit `go-packaged-preview` adapter smoke、reviewer diagnostics hardening、final checkpoint docs/guards。
- `v0.6.31` 已完成并 push 到 `main`，commit `9aa2d93f02d30dd856f5e67f528c2441bbbd76a5`；该 checkpoint harden review artifact verifier：expected context flags、strict bundle surface/schema/checksum/size、strict workflow context、hosted observation runbook。`v0.6.31` tag 仍 gated by hosted `workflow_dispatch` observation，除非 leader 提供 exact run evidence 或明确改变 release rule。
- `v0.6.32` 已完成并 push 到 `main`，commit `aab584a8af6d53e0d886b66d1d636c7c1f65a5a9`；该 checkpoint harden provenance/build-context consistency：local hosted observation record validator、cross-document `artifact-index.json`/`manifest.json`/`provenance.json` consistency verifier、`github.run_attempt`/`github.ref` workflow binding、builder provenance consistency guard、final checkpoint docs/guards。`v0.6.32` tag 仍等待 v0.6.31 tag gate 或 explicit leader waiver。
- `package.json` remains `0.6.8`；未执行 `npm version` 或 `npm publish`；未新增 lockfile、`go.mod`/`go.sum`、package lifecycle hook、optional native dependency、release asset、checked-in generated artifact/native binary。
- 运行时仍保持：default/unset disabled/TypeScript；`go-packaged-preview` explicit-only/non-default；current `go-cutover` helper-path behavior unchanged；`tmuxSnapshotParse` 是唯一 Go cutover-owned candidate；`compactReadModelFingerprint` remains TypeScript fallback/non-cutover；`/team readiness` 不扩展为 normal-user UI/tool/runtime diagnostics。

最终目标（必须显式记录）：

- `tmuxSnapshotParse` 的最终目标不是永久 `go-packaged-preview`，而是在 normal-user native helper availability 被证明并获批后，进入 approved default/package resolver path。
- default Go 只能在 explicit release/package/default approval 后启用；启用前必须证明 clean install 可定位并执行兼容 helper，且失败路径 fail closed/no-leak。
- TypeScript parser runtime fallback 的最终目标是删除，而不是长期双轨；删除只能发生在 default/native availability、unsupported-platform policy、rollback/default-disable plan、package/release ownership 与 diagnostics/no-leak 全部通过后。
- fallback 删除后的 rollback 不能是 hidden runtime TS fallback；必须是 corrected release/tag/package/deprecation/default-disable policy。

未来阶段规划：

1. `v0.6.33` — Package-manager clean-install proof prototype。
   - 目标：从 review artifact / generated bundle 走向 package-manager-equivalent clean install proof；仍不改 main `package.json` metadata、不发布 npm、不引入 lifecycle hook、不默认启用 Go。
   - 应证明：clean temp install root 只从 package-like layout 发现 helper；manifest/checksum/provenance/license/executable/platform 通过；explicit preview resolver 可消费该 layout；unsupported/mismatch/non-executable/corrupt cases fail closed/no-leak；不得提交 artifacts 或 raw hosted records。
   - 产物建议：clean-install proof doc、validator/test harness、package-layout fixture contract、final checkpoint guard。
2. `v0.6.34` — Package/release ownership and install layout decision。
   - 目标：在仍不发布的前提下，明确 future native helper distribution ownership：main package inclusion vs companion package vs release asset remains STOP until approval。
   - 应产出：owner matrix、rollback/default-disable responsibility、supported platform policy、package metadata change proposal as non-applied fixture、guardrails that main `package.json` remains unchanged。
3. `v0.6.35` — Pi Extension Compliance & Package Surface Checkpoint（已完成本地 docs/tests checkpoint）。
   - 目标：按用户反馈从第二平台 matrix 退回 pi extension 产品事实，证明 AgentTeam 仍是 TypeScript/pi extension facade，而不是 native binary distribution。
   - 已证明：`package.json#pi.extensions` 保持 `./index.ts`；默认 TS extension factory 可在 stub pi API 下加载；`/team` 和稳定工具面保持不变；package surface 无 native metadata/lifecycle/native dependency；default/unset、`go-cutover`、`go-packaged-preview`、`compactReadModelFingerprint` 边界不变。
   - 限制：不证明 native helper delivery、normal-user native availability、default Go/default resolver、fallback deletion、package release、install source、signing 或 second-platform support。
4. `v0.6.36` — Default Go Dry-Run Readiness & Rollback/Disable Policy Checkpoint（已完成本地 docs/tests checkpoint）。
   - 目标：把未来 default-Go ambition 转成 local auditable governance：default-Go blocker ledger、non-mutating dry-run verifier、rollback/default-disable non-applied policy、TS/pi authority boundary、install/load evidence registry、release/tag debt ledger 和 final readiness checkpoint。
   - 已证明：当前 dry-run remains `ready:false`；所有 default/native/package/release/signing/platform/fallback/tag availability flags 保持 false；`go-cutover`/`go-packaged-preview` 行为不变；TypeScript/pi facade 仍是产品与控制平面；v0.6.31–v0.6.36 tag gates 仍 gated/unresolved。
   - 限制：不启用 default Go/default resolver，不删除 TypeScript fallback，不实现 runtime rollback/default-disable，不执行 release/tag/publish/hosted workflow，不生成 raw hosted records/release assets/native artifacts。
5. 下一阶段候选 — Hosted observation/tag debt closure or rollback/default-disable runtime design。
   - 优先项 A：解决 v0.6.31 hosted workflow observation/tag gate，并明确 v0.6.32+ tag policy；仍不把 tag 当作 native/default availability 证明。
   - 优先项 B：在单独明确授权后，设计并测试真实 rollback/default-disable runtime mechanism；该机制必须 fail closed/no-leak，且不能作为 hidden TypeScript fallback。
   - 暂不建议：second-platform matrix、default Go approval、fallback deletion、package release/signing，除非 package/install/default/rollback/security gates 先被明确满足。
6. 后续 approval gate — Default Go approval checkpoint。
   - 目标：在 package-manager clean install proof、platform policy、release ownership、rollback/default-disable、hosted/tag evidence 都完成后，给出 explicit user/leader approval gate。
   - 只有该 gate 通过后，才能在后续版本考虑把 `tmuxSnapshotParse` 的 default resolver 从 TypeScript fallback path 切到 Go-owned default path。
7. 更后续 — TypeScript parser fallback deletion for `tmuxSnapshotParse`。
   - 目标：删除 `tmuxSnapshotParse` runtime TypeScript parser fallback，只保留 Go-owned implementation + fail-closed diagnostics + release rollback/default-disable。
   - 前置条件：default Go 已获批并经过至少一个 checkpoint；hosted/package clean install evidence 全部通过；unsupported platform policy 已收窄或已证明；rollback/default-disable 已演练；docs/tests 明确 Go authority 仍不扩展到 tmux execution/capture、worker lifecycle、state writes、task/report governance、PlanRun、full-text boundary、UI rendering 或 package/release control plane。

距离评估：

- 距离方案书 v0.7 的 `core refactor + performance baseline + bug burn-down release`：约 55–65% 完成。identity/state/read-model/tmux/panel/report/config 的基础 guard 和 baseline 已大量完成，但最终 p95 release gate、P0 bug burn-down checklist、manual RC smoke 仍需闭环。
- 距离 `normal-user native helper availability / package-install proof / approved default path`：约 35–45% 完成。真实 helper builder、CI review artifact、strict verifier/provenance 已完成；但 package-manager clean install proof、platform matrix、package/release ownership、default resolver/default Go approval、fallback deletion仍未完成。
- 距离 `default Go + TypeScript fallback deletion`：仍属于后半程；不得在 package/install/default/rollback/security gate 通过前提前启用或删除。

### Slice 1 — Config Bootstrap/Schema

目标：先降低首次使用门槛，并建立 versioned config。

交付：

- `version: 1` config schema。
- `agents.<role>.model` 主结构。
- legacy `agentModels` read compatibility。
- first-run non-overwrite bootstrap。
- `/team config show|validate|init|migrate --dry-run`。

验证：

- clean runtime 可获得默认配置或明确 bootstrap。
- spawn 使用 effective model。
- legacy config 有 warning，但仍可工作。

### v0.4.12 — Config Bootstrap & Effective Runtime Config Hardening（已完成）

v0.4.12 将 Config Bootstrap/Schema P0 拆为 6 个 GitHub-only checkpoint slice，并已完成：

- 完整 v1 schema：`version`、`agents`、`automation`、`ui`；`config.example.json` 和 `createDefaultAgentConfig()` 对齐。
- `/team config init` 首次创建 v1 config，已有 config 时拒绝覆盖；missing config 的 `/team config show` 给出 path/exists/init 引导且不写文件。
- legacy `agentModels` 兼容读取并给出 migration warning；v1 `agents.<role>.model` 优先于 legacy。
- effective model source metadata：`v1 | legacy | null | default`，spawn output/details、config show 和 panel compact projection 可见。
- `/team config show|validate|init|migrate --dry-run` 可用；`migrate --dry-run` 输出 proposed v1 preview，且 no-write/no-overwrite/no-mtime-change。
- config changes future-spawn-only，不改 running workers。
- repository `/team` panel compact config projection 已接入：exists/schemaVersion/diagnosticCount/effective role model+source；不 dump arbitrary full config，不读取 full mailbox/report body。

### v0.4.13 — Team Identity / Name Scope Hardening（GitHub-only checkpoint prep）

v0.4.13 已完成 Team Identity / Name Scope P0 hardening：

- Identity schema：`teamId/projectKey/displayName/slug/legacyName?`；普通新 team 不自动带 `legacyName`，legacy/effective identity 用 `legacyName` 标记旧 storage name。
- Slug hardening：safe ASCII slug trim 外层 separators；`---Shared Team---`、`...Shared Team...` 归一化为 `shared-team`；`---`、`!!!`、`。。。`、中文-only 安全拒绝并提示 ASCII slug/name。
- Legacy `teams/-` safety：unsafe create、global panel、attached lookup 都不得读取复用、恢复、接管、删除、重命名或迁移 legacy `teams/-`；legacy no-identity teams 同样保持 byte-for-byte stable。
- Scoped create/lookup：不同 `projectKey` 下相同 display/slug 可共存；same-project duplicate/alreadyAttached/active conflict details 包含 existing cwd/windowTarget/paneId/sessionFile。
- Identity-first sessions：session JSON 持久化 `teamId/projectKey/identityKey/teamSlug`，同时保留 `teamName/memberName` 兼容字段与 legacy fallback。
- Read-model visibility：repository `/team` panel/global panel 对 legacy no-identity teams 计算 read-only effective identity（display/name、slug/storage key、stable legacy teamId/projectKey、legacyName marker），不写回 legacy `team.json`，也不读取 full mailbox/report body 或标记 read/delivered。

验证：

- `npm test` 全绿，覆盖 v0.4.13 TeamIdentity characterization safety suite。
- `npm run typecheck`、`npm run -s check:boundaries`、`git diff --check` 全绿。
- package version 保持 `0.6.8`；该 checkpoint 只为 GitHub commit/tag/push 准备，不表示 npm publish。

### v0.4.14 — State Store / Read Model Baseline & Profiling Gate（GitHub-only checkpoint prep）

v0.4.14 已完成 State Store / Read Model P0 的前置 hardening 与 baseline：

- Slice 1：新增 State/read-model RED boundary characterization，覆盖 panel/read-model 不读取 full mailbox/report source、不泄漏 full report/message body、explicit full-text boundary 保持、hot task show 不扫 decoy team、config/identity/PlanRun compact projection 保持。
- Slice 2：新增 compact panel sidecars：`team-panel.json` 与 `*.panel.json`；repository/panel read-model 优先读取 compact projection，reconciliation writeback 只同步 runtime/member 字段，避免 compact snapshot 覆盖 full report body。
- Slice 3：hot `agentteam_task show` current-team lookup 改为 precise identity/session lookup，命中当前 team 时不 fallback `listTeams()` 扫描 decoy teams。
- Slice 4：`fsStore` operation-level profiling contract 完成，记录 `lockWaitMs/readMs/parseMs/writeMs/bytes/callSite/category/operation`，普通输出无 profiling 噪音。
- Slice 5：deterministic state/read-model microbench baseline 完成，fixture 为 1 leader、3 workers、100 tasks、500 mailbox items，stub tmux/runtime，输出 JSON summary；baseline only，不作为 p95 release target pass/fail。
- Slice 6：docs/perf checkpoint prep 记录 baseline 和验证，为 GitHub-only `v0.4.14` commit/tag/push 准备；不执行 `npm version`、`npm publish`、commit、tag 或 push。

验证：

- `npm test`
- `npm run typecheck`
- `npm run -s check:boundaries`
- `git diff --check`
- `npm run bench:state-read-model`
- package version 保持 `0.6.8`；该 checkpoint 只为 GitHub commit/tag/push 准备，不表示 npm publish。

### Slice 3 — State Store / Read Model

目标：减少整文件重复读写，为 panel 和 runtime 建 compact read model。

交付：

- repository/port seam。
- compact panel read models。
- fsStore profiling。
- mailbox/outbox append/index seam 设计。

验证：

- task/message/report fixture 等价。
- panel 不读 full mailbox/report body。
- 单 action 不扫描无关 team。

### Slice 4 — Tmux Adapter + `/team` Panel

目标：解决 `/team` flicker 和 tmux subprocess 放大问题。

交付：

- `TmuxSnapshot`。
- pane binding snapshot/cache。
- light refresh vs force reconcile。
- panel in-place actions。
- cached/debounced data source。
- stable render/layout。

验证：

- worker busy/outputting 时 `/team` 不持续闪烁。
- attached/global warm refresh 达到性能门禁。
- manual reconcile/refresh 仍可用。

### Slice 5 — Report Reliability

目标：worker 完成任务必须可靠提交 durable report。

交付：

- worker prompt completion contract。
- task-bound final report instruction。
- stale report attention。
- leader nudge。
- report side-effect diagnostics。

验证：

- simulated no-report task 在 `/team` 可见。
- nudge 是 directed reminder，不是 broadcast。
- leader 不伪造 report。

### Slice 6 — Approved PlanRun MVP + Completion/Recovery Hardening

目标：用户批准计划后，leader 可受控推进，不引入默认自动执行。

v0.4.9 已完成切片：

- Slice A：RED characterization，覆盖 explicit approval、one-step-at-a-time、report-review、compact/full-text boundary、repository/app port seam。
- Slice B：PlanRun storage/domain/repository/app port skeleton。
- Slice C：`agentteam_planrun` tool skeleton，包含 `approve/show/list`，`advance/pause/resume/cancel` 先保持 denied stub。
- Slice D：显式 `advance(planRunId)` 创建一个 step task 和 compact assigned TaskEvent，重复 advance 在 active step 未解决时被拒绝。
- Slice E：owner `report_done` 让 PlanRun/step 进入 `waiting_review`；owner `report_blocked` 让 PlanRun `paused` 且 `pauseReason=report_blocked`。
- Slice F：compact visibility 接入 `agentteam_task show` 与 leader digest，并补齐文档/checkpoint 说明。

v0.4.10 已完成切片：

- Slice 1：completion/recovery RED characterization，覆盖 close→advance 多步闭环、terminal done、pause/resume/cancel、question/watchdog/validation pause、dryRun、`/team` compact visibility。
- Slice 2：leader close active step task 后 step accepted/done，推进 `currentStepIndex`，最后一步 close 后 PlanRun `done`。
- Slice 3：leader-only `pause/resume/cancel`，含 `leader_paused` 默认 pause 和 `validation_failed` seam。
- Slice 4：owner task-bound question pause active PlanRun step；watchdog/no-report 只做 compact attention，不自动 nudge/advance。
- Slice 5：`show/list nextAction` 和 `dryRun=true` previews，保证不分配 id、不改 seq、不写 event/mailbox。
- Slice 6：active/waiting/paused/approved-ready PlanRun compact projection 接入 repository `/team` read-model 和 panel model。
- Slice 7：docs/checkpoint hardening，GitHub-only v0.4.10 checkpoint。

v0.4.11 已完成切片：

- Slice 1：limits/failure RED characterization，覆盖 `signal_failure`、limits/limitState、`check_limits`、limit reached、compact UX/panel、no scheduler/no full-text。
- Slice 2：first-class `signal_failure` seam，支持 `validation_failed`/`test_failed` compact failure signal。
- Slice 3：PlanRun optional `limits`/`limitState` model、approve storage、validation、repository summary 和 legacy compatibility。
- Slice 4：explicit `check_limits`、pure limit evaluator、`limit_reached` pause/event，且无后台 scheduler/timer/autopilot。
- Slice 5：docs/checkpoint hardening，GitHub-only v0.4.11 checkpoint。

当前核心行为：

- `approve` 只创建 compact PlanRun，不创建 task、不发送 assignment。
- `advance` 必须显式 leader 调用，每次最多创建一个当前 step task。
- `report_done` 不关闭 task，只把 active PlanRun step 标记为 `waiting_review`。
- leader close active step task 后才能显式 advance 下一 step；最后一步 close 后 PlanRun `done`。
- `report_blocked` 不 block task，只把 PlanRun compact pause 为 `report_blocked`。
- owner task-bound question 可把 active PlanRun compact pause 为 `question`。
- `pause/resume/cancel` leader-only，只更新 compact PlanRun 状态/event，不改 task/mailbox。
- `signal_failure` leader-only，只记录 compact validation/test failure，并 pause PlanRun。
- `check_limits` leader-only，只在显式调用时评估 compact limits；reached 时 pause PlanRun，不创建 task/mailbox/nudge。
- `show/list/task show/digest/team panel` 不读取或返回 `TaskReport.text`/`MailboxMessage.text`。
- `dryRun=true` preview 不写 state，且不分配 id/seq。
- 不实现 hidden scheduler/autopilot/timer，不自动 advance/close/block/reassign/nudge。

验证：

- `npm test`
- `npm run typecheck`
- `npm run -s check:boundaries`
- `git diff --check`
- GitHub-only checkpoint：可 commit/tag/push，但不执行 `npm version`、不执行 `npm publish`，不修改 `package.json` version。

后续验收项：

- 外部 CI/test source integration 可继续接入 `signal_failure`，但不得存储 raw logs/full body。
- PlanRun limit defaults/config policy 仍需单独设计，且不得引入 hidden scheduler/default autopilot。

### Slice 7 — Release hardening

目标：把 v0.7.0 作为 core refactor release 发出去。

交付：

- README/public docs update。
- migration notes。
- profiling/bench result summary。
- manual smoke checklist。
- npm pack/install smoke。
- rollback notes。

验证：

- release gates 全部通过。
- real tmux/pi smoke 通过。
- 已知 P0 bug burn-down 结果明确。

---

## 7. 固定验证门

### 7.1 每个 slice 必跑

```bash
npm test
npm run typecheck
npm run -s check:boundaries
git diff --check
```

GitHub-only checkpoint 默认只允许本地验证和明确授权后的 commit/push；不得执行 `npm version`、不得执行 `npm publish`，也不得为了路线标签改动 `package.json` version。tag、release asset、package release、default Go/native/fallback deletion 都必须单独授权。

### 7.2 v0.7.0 RC 必跑

v0.7.0 RC 只能在 evidence reconciliation、manual RC、p95 gaps、P0 bug burn-down 都完成后启动。RC 候选必须先跑基础链：

```bash
npm test
npm run typecheck
npm run -s check:boundaries
git diff --check
```

得到明确 RC 授权后，再跑 package/e2e 相关检查：

```bash
npm run check
npm run release:check
npm run test:e2e
```

`release:check` 只能作为 RC dry-run 检查；它不授权 `npm version`、`npm publish`、tag、release asset 或 package release。如果 `npm run test:e2e` 依赖真实 tmux/pi 环境不可用，必须记录环境原因，并补跑 real tmux/pi manual smoke。

### 7.3 Manual smoke

```text
clean temp PI_AGENTTEAM_HOME under /tmp/pi-agentteam-v0.7-rc.*
launch pi with --no-extensions --extension ./index.ts --session-dir "$PI_AGENTTEAM_HOME/pi-sessions"
first-run config bootstrap
/team config show
/team config validate
/team config migrate --dry-run
create ASCII team
Chinese-only team name rejected safely
legacy teams/- not deleted or recovered accidentally
spawn researcher/planner/implementer with configured models
researcher report_done -> leader receive
planner report_done -> user approves PlanRun
implementer executes PlanRun step 1 -> report_done -> leader close -> explicit advance step 2
implementer executes PlanRun step 2 -> report_done -> leader close -> PlanRun done when final
blocked report pauses PlanRun
owner question pauses PlanRun without blocking/closing task
leader pause/resume/cancel are compact and auditable
signal_failure pauses PlanRun for validation_failed/test_failed without task mutation
check_limits pauses PlanRun for limit_reached without task/mailbox side effects
agentteam_planrun dryRun preview does not mutate state or allocate ids
worker no-report state appears as waiting-for-report attention
/team shows compact PlanRun projection without full report/mailbox bodies
/team remains open during worker activity without flicker
/team does not mark mailbox read/delivered
```

### 7.4 Feature gate matrix

| Gate | 必须证明 |
| --- | --- |
| Team Identity | scoped identity 或 explicit global conflict；中文-only 不撞 `teams/-`；legacy safe |
| State Store/Read Model | profiling 可见；panel summary 不读 full bodies；行为 fixture 等价 |
| Tmux Adapter | snapshot/cache 生效；普通 refresh 不逐 member 调 tmux |
| `/team` Panel | 无持续闪烁；in-place action；debounce/diff 生效 |
| Task/Report | no-report 可见可提醒；不伪造 report；leader close 仍 required |
| PlanRun | user-approved；approve no task；explicit one-step advance；leader close 后多步推进；terminal done；report_done waiting_review；report_blocked/question paused；signal_failure validation/test failed；check_limits limit_reached；pause/resume/cancel；dryRun no mutation；`/team` compact visibility；全程可审计 |
| Config | v1 schema；legacy compatibility；first-run bootstrap；effective model 可见 |
| Performance | baseline + p95 + 相对改善数据齐全；post-fix evidence reconciliation 完成；task/message/report、large mailbox、fsStore lock wait、data-change debounce、spawn bookkeeping 均有 pass/fail/blocked/not-covered 证据 |
| Go Kernel | TypeScript/pi control plane 保留；Go 初期 optional/replaceable/fallback helper 仅作迁移脚手架；v0.4.18 起必须定义模块 cutover gate、fallback deletion plan、fail-closed diagnostics 与 release rollback；无整体 Go rewrite、无默认控制平面替换、无 native binary/package version change |

---

## 8. 开放问题

- `teamId` path 是否一次性切到 `teams/<teamId>`，还是 v0.7 先加 identity metadata 并保留旧路径？建议优先保证 legacy safe，再逐步迁移路径。
- `projectKey` 如何稳定派生：git root、cwd hash、pi workspace id，还是组合？需要兼顾 symlink 和 monorepo。
- first-run config 是自动创建，还是弹一次确认？建议 non-overwrite auto-create 或一次性确认，禁止 postinstall 写 runtime state。
- PlanRun approval 是否必须绑定 planner report id？建议必须绑定，避免口头计划和实际执行链脱节。
- PlanRun 默认 `maxConsecutiveSteps` 是 3 还是 5？建议 v0.7 用 5，并允许 config 限制。
- `/team` flicker 是否有 pi TUI upstream 因素？若有，需要记录 upstream 依赖；但 v0.7 仍必须先消除 AgentTeam 自身 force reconcile/close-reopen/notify 重绘。
- mailbox/outbox 后续是否需要 SQLite 或 append-only log？v0.7 先做 read-model/profiling seam，是否替换存储由数据决定。
- stale no-report 判定阈值如何设定？需要避免 worker 正在长任务中被误判，同时让 leader 能及时看到风险。

---

## 9. 决策摘要

1. v0.7.0 的准确定位始终是 `core refactor + performance baseline + bug burn-down release`；历史 `v0.5` checkpoint 命名只保留为审计背景。
2. 当前 `package.json` 版本仍是 `0.6.8`，TypeScript/pi extension facade 仍是产品入口和控制面；路线推进不等于 npm package version 推进。
3. 当前主计划固定为：v0.6.38 evidence reconciliation → v0.6.38 GitHub-only 收口 →真实 manual RC → p95 gaps 补齐 → v0.7 runtime burn-down → v0.7 readiness checkpoint。
4. Team Identity、State Store/Read Model、Tmux Adapter、`/team` Panel、Task/Report/PlanRun、Config Bootstrap/Schema 是 v0.7 六条核心重构主线，不能推迟到 v0.8+。
5. v0.7 不整体 Rust/Go 重写；Go 方向只限 JS/TS control plane 后面的 module-owned high-performance kernel，且必须有 cutover gate、fail-closed diagnostics、release rollback 和 fallback deletion 计划。
6. Go 不能接管治理、full-text boundary、tmux worker lifecycle、Task/Report/PlanRun、UI rendering、command/tool/readiness control plane 或 package/release authority。
7. `/team` 是 cockpit，不是 mailbox full-text reader；不能改变 `agentteam_receive` 的 read boundary，不能让 panel 读取或标记 full mailbox/report body。
8. PlanRun 只允许在用户批准具体 planner report 后运行，并且一次只推进一个 leader-gated task；不得引入 hidden scheduler/autopilot。
9. worker no-report 是协议可靠性 bug，必须通过 completion contract、attention、nudge 和 diagnostics 修复，不能用伪造 report 掩盖。
10. legacy `teams/-` 必须安全保留；v0.7 不做破坏性 migration。
11. tag、GitHub release、`npm version`、`npm publish`、package release、default Go、native helper/package delivery、fallback deletion、signing 和 second-platform support 都保持显式授权门。
