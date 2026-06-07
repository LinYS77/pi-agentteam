# AgentTeam v0.5.0 核心重构方案书

> 更新时间：2026-06-04
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

结论：v0.5.0 必须保留 TypeScript/pi extension facade。Rust/Go 只能作为后续局部 helper 候选，不能作为 v0.5 的整体重写方向。

### 0.2 当前实现事实

当前代码中已经存在若干关键 seam，但还不够稳定：

- `config.ts` 当前主要支持 legacy `agentModels`：
  - `researcher`
  - `planner`
  - `implementer`
  - schema 没有 version 字段。
- `state/paths.ts` 当前 `sanitizeName()` 逻辑是 trim/lowercase 后把非 `[a-z0-9._-]` 替换为 `-`，没有强制 ASCII letter/digit，也没有 trim separator；中文-only 名称可能落到危险 slug。
- `state/fsStore.ts` 当前使用同步文件 I/O、整文件 JSON parse/stringify、`.lock` 文件、atomic rename。
- `state/teamStore.ts` 仍以 `teams/<sanitizeName(teamName)>/team.json` 为主要路径布局。
- `state/sessionBinding.ts` 当前 session binding 仍以 `teamName/memberName` 查找和修复。
- `tmux/client.ts` 当前每次 tmux 调用都通过 `execFileSync` 或 `execFile('tmux')`。
- `teamPanel/dataSource.ts` 当前 panel load 会读取 team、tasks、leader mailbox/outbox diagnostics；attached/global load 路径还会调用 `prepareTeamForPanel()`，其中包含 `reconcileTeamPanes(team, { force: true })`。
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
- 不能通过默认 autopilot 掩盖 report/task governance 的可靠性问题。

---

## 2. 六条核心重构主线

### 2.1 Team Identity 重构（P0）

#### 当前问题

当前 team identity 主要依赖全局 sanitized team name。这个模型已经暴露可靠性和安全问题：

- 中文-only team name 可能被归一化为 `-`。
- legacy `teams/-` 会被误撞。
- 不同 project/session 中同名 team 可能互相阻塞。
- active collision error 不能充分说明 existing team 的 cwd/window/pane/session。

#### v0.5.0 目标

v0.5.0 必须从“全局 sanitized name”升级为内部 identity：

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

#### v0.5.0 目标

v0.5.0 必须把 tmux 访问重构为 adapter + snapshot/cache 模型：

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

当前候选根因包括：

- panel action 后 close/reopen。
- 每次 load 强制 reconcile。
- data source 每次重建完整 view model。
- mailbox projection、leader attention、`ui.notify` 与 panel render 竞争。
- tmux label/list-panes churn。
- 缺少 diff/debounce/cache。

#### v0.5.0 目标

`/team` 必须成为稳定 cockpit：

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

v0.4.9 已完成 Approved PlanRun MVP 的基础链路，v0.5.0 在此基础上继续补齐更完整的 pause/resume/cancel 和多步验收能力。当前显式 PlanRun 状态保持 compact：

```ts
type PlanRun = {
  id: string
  sourceReportId: string
  status: 'approved' | 'active' | 'waiting_review' | 'paused' | 'cancelled' | 'done'
  currentStepIndex: number
  activeTaskId?: string
  pauseReason?: 'report_blocked' | 'question' | 'watchdog' | 'waiting_for_report' | 'leader_paused'
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

v0.4.9 MVP 已落地规则：

- `approve` 必须由 leader 明确指定 `sourceReportId` 且 `confirmApproved=true`；approve 只创建 compact PlanRun，不创建 task。
- `advance(planRunId)` 必须显式调用；每次只创建一个当前 step task，并写 compact assigned TaskEvent。
- 当前 step task 仍 `open`/`waiting_review`/`blocked` 时，重复 `advance` 被拒绝，不创建第二个 task。
- owner `report_done` 后 task 仍保持 `open`；PlanRun/step 进入 `waiting_review`，等待 leader review/close 后再显式 advance。
- owner `report_blocked` 后 task 仍保持 `open`；PlanRun 进入 `paused` 且 `pauseReason=report_blocked`，不自动 block task。
- `agentteam_task show` 和 leader digest 只显示 compact PlanRun hint，不读取 `TaskReport.text` 或 `MailboxMessage.text`。
- 不存在 hidden scheduler/autopilot/timer；不自动 advance/close/block/reassign/nudge。

PlanRun 后续规则：

- question/test failure/no report 仍需要继续补齐更细的 pause 检测和恢复交互。
- 达到 step/time limit 立即 pause。
- 所有动作写入 compact PlanRunEvent/task/report/history。
- 不允许 worker 创建任务或派发 worker。

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
- worker `report_done` 后 PlanRun compact `waiting_review` 可在 `agentteam_task show` 和 leader digest 中看到。
- worker `report_blocked` 后 PlanRun compact `paused/report_blocked` 可在 `agentteam_task show` 和 leader digest 中看到。
- 每步都有 task/report/PlanRunEvent 历史，且 compact surfaces 不泄漏 full body。
- blocked/question/test failure/no report pause 继续作为 v0.5 完整链路验收项。

---

### 2.6 Config Bootstrap / Schema 重构（P0）

#### 当前问题

当前配置仍是 legacy `agentModels` 形态：

```json
{
  "agentModels": {
    "researcher": null,
    "planner": null,
    "implementer": null
  }
}
```

不足：

- 没有 version。
- 结构只覆盖 model，不方便承载 automation/ui/identity 等配置。
- fresh runtime 缺少 first-run bootstrap 策略。
- npm install/postinstall 不知道真实 `PI_AGENTTEAM_HOME`、pi runtime 和 workspace，不适合写用户 runtime state。

#### v0.5.0 目标 schema

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

策略：

- first-run non-overwrite bootstrap。
- 不用 npm postinstall 写 runtime state。
- legacy `agentModels` 可读。
- validate 显示 legacy warning、unknown role、invalid selector、unsupported deliveryMode。
- `/team config show|validate|migrate` 显示 effective model 和迁移建议。
- 配置变更只影响未来 spawn/respawn，不偷偷改变已运行 worker。

#### 主要涉及区域

```text
config.ts
config.example.json
commands/config.ts
agents.ts
tools/workerRole.ts
tools/workerSpawnService.ts
README.md
```

#### 验收标准

- clean `PI_AGENTTEAM_HOME` 首次加载后，config 缺失不再让用户迷路。
- 要么自动创建默认 config，要么明确一次性提示并支持 init。
- `agentModels` legacy 可读。
- `agents.<role>.model` 是主 schema。
- spawn researcher/planner/implementer 时使用 effective model，并在结果和 `/team` 中可见。

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

- versioned config schema。
- first-run non-overwrite bootstrap。
- legacy `agentModels` compatibility。
- `/team config show|validate|migrate` diagnostics。

验收：

- clean `PI_AGENTTEAM_HOME` 首次加载后 config 缺失不再让用户迷路。
- `agentModels` legacy 可读，并提示迁移。
- `agents.<role>.model` 是主 schema。
- validate 能报 unknown role、invalid shape、unsupported deliveryMode。

### 4.2 Team isolation / Chinese sanitizer

修复范围：

- slug hardening。
- scoped identity。
- legacy compatibility。
- safer collision copy。

验收：

- 中文-only team name 不变成 `-`。
- legacy `teams/-` 不被误删、误迁移、误接管。
- 不同 project 的同名 team 不互相阻塞。
- collision details 显示 cwd/window/pane/session。

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

- 写入 Rust/Go 评估结论。
- profiling-first。
- TypeScript seam refactor。
- native helper 只作为 v0.5 后按 profiling 触发的候选。

验收：

- 方案和 release plan 不承诺整体 Rust/Go。
- 性能改善必须通过 baseline/profiling 证明。
- native binary 发布矩阵不进入 v0.5 scope。

---

## 5. 明确不做事项

v0.5.0 不做：

- 不整体 Rust rewrite。
- 不整体 Go rewrite。
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

### Slice 0 — Baseline and characterization

目标：先测量，不猜瓶颈。

交付：

- 当前 `/team` attached/global warm refresh baseline。
- 当前 tmux command count/time baseline。
- 当前 fsStore lock/read/parse/write baseline。
- 当前 known bug fixtures。
- 当前 task/message/report 行为快照。

验证：

- profiling 开关可用。
- fixture 可重复运行。
- 当前行为输出被记录，用于后续等价性对比。

### Slice 1 — Config Bootstrap/Schema

目标：先降低首次使用门槛，并建立 versioned config。

交付：

- `version: 1` config schema。
- `agents.<role>.model` 主结构。
- legacy `agentModels` read compatibility。
- first-run non-overwrite bootstrap。
- `/team config show|validate|migrate`。

验证：

- clean runtime 可获得默认配置或明确 bootstrap。
- spawn 使用 effective model。
- legacy config 有 warning，但仍可工作。

### Slice 2 — Team Identity / Name Scope

目标：修复 sanitizer/team isolation P0，并建立内部 identity。

交付：

- `teamId + projectKey + displayName + slug`。
- session binding 兼容新旧 identity。
- slug hardening。
- safer collision error。
- legacy `teams/-` compatibility。

验证：

- 中文-only team name 安全拒绝。
- legacy `teams/-` 不被破坏。
- 不同 project 同名 team 不互相阻塞。

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

### Slice 6 — Approved PlanRun MVP

目标：用户批准计划后，leader 可受控推进，不引入默认自动执行。

v0.4.9 已完成切片：

- Slice A：RED characterization，覆盖 explicit approval、one-step-at-a-time、report-review、compact/full-text boundary、repository/app port seam。
- Slice B：PlanRun storage/domain/repository/app port skeleton。
- Slice C：`agentteam_planrun` tool skeleton，包含 `approve/show/list`，`advance/pause/resume/cancel` 先保持 denied stub。
- Slice D：显式 `advance(planRunId)` 创建一个 step task 和 compact assigned TaskEvent，重复 advance 在 active step 未解决时被拒绝。
- Slice E：owner `report_done` 让 PlanRun/step 进入 `waiting_review`；owner `report_blocked` 让 PlanRun `paused` 且 `pauseReason=report_blocked`。
- Slice F：compact visibility 接入 `agentteam_task show` 与 leader digest，并补齐文档/checkpoint 说明。

当前核心行为：

- `approve` 只创建 compact PlanRun，不创建 task、不发送 assignment。
- `advance` 必须显式 leader 调用，每次最多创建一个当前 step task。
- `report_done` 不关闭 task，只把 active PlanRun step 标记为 `waiting_review`。
- `report_blocked` 不 block task，只把 PlanRun compact pause 为 `report_blocked`。
- `show/list/task show/digest` 不读取或返回 `TaskReport.text`/`MailboxMessage.text`。
- 不实现 hidden scheduler/autopilot/timer，不自动 advance/close/block/reassign/nudge。

验证：

- `npm test`
- `npm run typecheck`
- `npm run -s check:boundaries`
- `git diff --check`
- GitHub-only checkpoint：可 commit/tag/push，但不执行 `npm version`、不执行 `npm publish`，不修改 `package.json` version。

后续验收项：

- leader close 后显式 advance 到下一 step 的完整多步链路。
- question/test failure/watchdog waiting-for-report 的 pause/resume/cancel 交互。
- `/team` active/paused PlanRun visibility 如需更强 cockpit 集成，可在 compact read-model 中继续扩展。

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
create ASCII team
Chinese-only team name rejected safely
legacy teams/- not deleted or recovered accidentally
spawn researcher/planner/implementer with configured models
researcher report_done -> leader receive
planner report_done -> user approves PlanRun
implementer executes PlanRun step 1 -> report_done -> leader close
implementer executes PlanRun step 2 -> report_done -> leader close
blocked report pauses PlanRun
worker no-report state appears as waiting-for-report attention
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
| PlanRun | user-approved；approve no task；explicit one-step advance；report_done waiting_review；report_blocked paused；compact visibility；全程可审计 |
| Config | v1 schema；legacy compatibility；first-run bootstrap；effective model 可见 |
| Performance | baseline + p95 + 相对改善数据齐全 |

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
4. `/team` 是 cockpit，不是 mailbox full-text reader；不能改变 `agentteam_receive` 的 read boundary。
5. PlanRun 只允许在用户批准具体 planner report 后运行，并且一次只推进一个 leader-gated task。
6. worker no-report 是协议可靠性 bug，必须通过 completion contract、attention、nudge 和 diagnostics 修复，不能用伪造 report 掩盖。
7. legacy `teams/-` 必须安全保留；v0.5 不做破坏性 migration。
