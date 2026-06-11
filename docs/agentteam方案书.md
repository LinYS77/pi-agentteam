# AgentTeam v0.5.0 核心重构方案书

> 更新时间：2026-06-06
> 版本口径：本文按产品路线 `v0.4.0 → v0.5.0` 编写；仓库当前 `package.json` 版本可能高于该路线口径，本文关注下一次 v0.5 目标形态，而不是历史标签账本。
> 一句话目标：`v0.5.0 = core refactor + performance baseline + bug burn-down release`。

---

## 0. 当前仓库事实

AgentTeam 当前不是一个独立 daemon，也不是 native binary 产品；它是 TypeScript/Node 形态的 pi npm extension。

### 0.1 包与入口事实

从当前仓库可确认：

- `package.json` 当前声明版本为 `0.6.8`，但本文仍按产品路线中的 v0.5 目标讨论。
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

结论：v0.5.0 必须保留 TypeScript/pi extension facade。Rust/Go 不能作为 v0.5 的整体重写方向，但 Go 可以成为被选中核心模块的 high-performance kernel。Slice 0-7 先把 Go helper contract、parity corpus 和 guardrails 建好；后续方向调整为“迁移期 fallback → 模块级 cutover → 删除 TS runtime fallback”。TypeScript/pi control plane 仍负责工具、命令、hooks、prompts、`/team`、治理和 npm 发布面；Go kernel 一旦通过某个模块的 cutover gate，就应成为该模块唯一 runtime implementation，缺失/不兼容时 fail closed，并通过 GitHub tag/npm 版本回滚，而不是长期保留双实现 runtime fallback。

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

---

## 1. v0.5.0 定位

```text
v0.5.0 = core refactor + performance baseline + bug burn-down release
```

v0.5.0 不是普通稳定化补丁；它必须在 v0.5 时完成 AgentTeam 核心协作链路的重构，并用可测数据证明性能改善。

v0.5.0 必须交付：

1. Team Identity 重构。
2. State Store/Read Model 重构。
3. Tmux Adapter 重构。
4. `/team` Panel Data Source / Render Loop 重构。
5. Task/Report/PlanRun 重构。
6. Config Bootstrap/Schema 重构。
7. 性能 baseline、profiling harness 和 release gate。
8. 已知 P0 bug burn-down。

v0.5.0 的 release 标准：

- 不能只写“显著缓解”，必须有 baseline、p95 指标和对比。
- 不能把 project/team identity、state read model、tmux/panel 重构推迟到 v0.6。
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

#### v0.5.0 目标

v0.5.0 从“全局 sanitized name”升级为内部 identity：

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
- 如果 v0.5 最终仍保留 global uniqueness，必须有 explicit global conflict 文案；但推荐 v0.5 完成 scoped identity。
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

#### v0.5.0 目标

v0.5.0 必须建立清晰 StateRepository/RuntimeRepository seam：

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
- 为 mailbox/outbox append-only + compact/read-index 留后续 seam；v0.5 不强制引入 SQLite。

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

#### v0.5.0 目标

v0.5.0 必须继续把 tmux 访问深化为 adapter + snapshot/cache 模型：

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

#### v0.5.0 目标

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

这不能靠默认 autopilot 解决。v0.5.0 要重构的是协议可靠性和受控执行状态，而不是放弃 leader governance。

#### v0.5.0 目标：Report reliability

- worker system prompt 和 assignment delivery 必须把 `report_done/report_blocked` 作为 completion contract。
- task-bound assignment 最后一屏也要明确 report instruction。
- worker idle/open owned task/no report 状态必须在 `/team` 可见。
- 提供 leader nudge：提醒 owner 提交报告。
- report side effect 要有 diagnostics。
- 不伪造 worker report。
- 不由 leader 代写 worker report 来掩盖协议失败。

#### v0.5.0 目标：Approved PlanRun

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
- 外部 CI/test source integration 和 limit config defaults 仍作为 v0.5 后续增强项。

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

#### v0.4.12 已完成行为 / v0.5.0 目标 schema

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

v0.5.0 必须先建立 baseline，再证明优化。不能在没有 profiling 的情况下宣称 Rust/Go 或数据库必要。

### 3.1 profiling harness

v0.5.0 前必须能记录以下信号：

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
- native binary 发布矩阵不进入 v0.5 scope；任何未来 Go helper 在迁移期必须保持 TypeScript fallback 和 legacy compatibility，但 cutover 完成后应删除该模块 runtime fallback，改为 fail-closed diagnostics + release rollback。

---

## 5. 明确不做事项

v0.5.0 不做：

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
- legacy `teams/-` 可能仍承载真实用户 state，不能被 v0.5 自动迁移误伤。

---

## 6. 版本切片与 patch plan

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
- Stop/go recommendation：Do NOT proceed to actual `tmuxSnapshotParse` fallback deletion in v0.4.19；v0.4.20 cutover only if user explicitly approves and runtime prerequisite signoff is accepted；otherwise return to broader v0.5 core refactor。

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

目标：把 v0.5.0 作为 core refactor release 发出去。

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

v0.4.x GitHub-only checkpoint 只允许 commit/tag/push；不得执行 `npm version`、不得执行 `npm publish`，也不得为了路线标签改动 `package.json` version。

### 7.2 v0.5.0 RC 必跑

```bash
npm run check
npm run release:check
npm pack --dry-run --ignore-scripts --json
npm run test:e2e
```

如果 `npm run test:e2e` 依赖真实 tmux/pi 环境不可用，必须记录环境原因，并补跑 real tmux/pi manual smoke。

### 7.3 Manual smoke

```text
clean PI_AGENTTEAM_HOME
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
| Performance | baseline + p95 + 相对改善数据齐全 |
| Go Kernel | TypeScript/pi control plane 保留；Go 初期 optional/replaceable/fallback helper 仅作迁移脚手架；v0.4.18 起必须定义模块 cutover gate、fallback deletion plan、fail-closed diagnostics 与 release rollback；无整体 Go rewrite、无默认控制平面替换、无 native binary/package version change |

---

## 8. 开放问题

- `teamId` path 是否一次性切到 `teams/<teamId>`，还是 v0.5 先加 identity metadata 并保留旧路径？建议优先保证 legacy safe，再逐步迁移路径。
- `projectKey` 如何稳定派生：git root、cwd hash、pi workspace id，还是组合？需要兼顾 symlink 和 monorepo。
- first-run config 是自动创建，还是弹一次确认？建议 non-overwrite auto-create 或一次性确认，禁止 postinstall 写 runtime state。
- PlanRun approval 是否必须绑定 planner report id？建议必须绑定，避免口头计划和实际执行链脱节。
- PlanRun 默认 `maxConsecutiveSteps` 是 3 还是 5？建议 v0.5 用 5，并允许 config 限制。
- `/team` flicker 是否有 pi TUI upstream 因素？若有，需要记录 upstream 依赖；但 v0.5 仍必须先消除 AgentTeam 自身 force reconcile/close-reopen/notify 重绘。
- mailbox/outbox 后续是否需要 SQLite 或 append-only log？v0.5 先做 read-model/profiling seam，是否替换存储由数据决定。
- stale no-report 判定阈值如何设定？需要避免 worker 正在长任务中被误判，同时让 leader 能及时看到风险。

---

## 9. 决策摘要

1. v0.5.0 的准确定位是 `core refactor + performance baseline + bug burn-down release`。
2. Team Identity、State Store/Read Model、Tmux Adapter、`/team` Panel、Task/Report/PlanRun、Config Bootstrap/Schema 是 v0.5 六条核心重构主线。
3. v0.5 不整体 Rust/Go 重写；先保留 TypeScript/pi extension facade，完成内部 seam、profiling 和可测优化。
4. Go 方向被限定为 JS/TS control plane + module-owned high-performance kernel：初期 fallback 只是迁移脚手架；通过 cutover gate 的模块应删除 TS runtime fallback，改为 Go-owned runtime + fail-closed diagnostics + release rollback；Go 仍不能接管治理、full-text boundary、tmux worker lifecycle 或 release/package control plane。
5. `/team` 是 cockpit，不是 mailbox full-text reader；不能改变 `agentteam_receive` 的 read boundary。
6. PlanRun 只允许在用户批准具体 planner report 后运行，并且一次只推进一个 leader-gated task。
7. worker no-report 是协议可靠性 bug，必须通过 completion contract、attention、nudge 和 diagnostics 修复，不能用伪造 report 掩盖。
8. legacy `teams/-` 必须安全保留；v0.5 不做破坏性 migration。
