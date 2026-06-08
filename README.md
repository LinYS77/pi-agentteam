<div align="center">

# 🤝 pi-agentteam

**Multi-agent team orchestration for [pi](https://github.com/badlogic/pi-mono)**

Coordinate a leader with specialized teammates — researcher, planner, and implementer —
each running in a visible tmux pane, collaborating through shared tasks and typed messages.

[![npm](https://img.shields.io/npm/v/pi-agentteam?style=flat-square&color=blue)](https://www.npmjs.com/package/pi-agentteam)
[![license](https://img.shields.io/npm/l/pi-agentteam?style=flat-square)](https://github.com/LinYS77/PI-agentteam/blob/main/LICENSE)
[![pi](https://img.shields.io/badge/requires-pi%20%3E%3D%200.60-blueviolet?style=flat-square)](https://github.com/badlogic/pi-mono)

</div>

---

## ✨ Highlights

| | Feature | |
|---|---|---|
| 🖥️ | **tmux-native teamwork** | Each teammate is a real `pi` session in its own pane — watch them work in real time |
| 📋 | **Leader-gated task board** | Leader-owned task facts with worker `report_done`/`report_blocked` reports and review |
| 💬 | **Typed messaging** | `assignment` · `question` · `inform`; task reports handle done/blocked outcomes |
| 🎯 | **Role-based tool guard** | Researcher/Planner (read-only) → Implementer (full tools) — least privilege by default |
| 📡 | **Event-driven delivery** | Teammates are notified for actionable messages when tasks are unblocked; mailbox reads stay explicit |
| 📊 | **Unified `/team` console** | Browse state, recover old teams, remove stale teammates, and cleanup without memorizing extra commands |
| 🔗 | **Peer context handoff** | Workers communicate through mailboxes with compact `TaskMessageRef` task audit refs/diagnostics; leader reviews attention signals and explicitly starts downstream work |
| 🧹 | **Zero footprint** | One folder, file-based state, no database — delete and it's gone |

---

## 📦 Install

```bash
pi install npm:pi-agentteam
```

**Requirements:** [pi](https://github.com/badlogic/pi-mono) ≥ 0.60 · [tmux](https://github.com/tmux/tmux). The leader pi session must run inside tmux.

`pi install npm:pi-agentteam` installs the npm `latest` version. GitHub-only vNext notes in this README can appear before an npm publish is explicitly performed, so do not assume unreleased GitHub changes are available from npm until a package release is published. If v0.6.8 is promoted to npm, it may sync npm users from `pi-agentteam@0.6.3` across several GitHub-only releases; see [Package Surface Tiers](#package-surface-tiers) for the release-notes-only compatibility posture.

---

## 🚀 Quick Start

```text
You (leader):
  Create a team and ask the leader to handle the routing work.

  > Create an agentteam for this project.
  > Spawn one researcher to analyze the build pipeline.
  > When the research task is done, ask a planner for an optimization plan.

  The leader should create/assign shared tasks, choose the matching teammate
  from the roster, send short task-id based assignments, then receive and
  synthesize task reports.
```

Equivalent low-level tool flow when you need it:

```text
> agentteam_create({ team_name: "my-project", description: "Optimize the build pipeline" })
> agentteam_spawn({ name: "research", role: "researcher" })
> agentteam_task({ action: "create", title: "Analyze build pipeline",
                   description: "Report bottlenecks with evidence", owner: "research" })
> agentteam_send({ taskId: "T001", message: "Analyze the build pipeline and report bottlenecks",
                   type: "assignment" })
> agentteam_receive()
```

Because `T001` has owner `research`, the assignment can omit `to`. Explicit `to` is still available when you need to override task-owner routing.

Or open the unified local console:

```text
/team          ← local console for status, recovery, and cleanup
```

---

## 🧭 Recommended Workflows

Use agentteam when work benefits from visible role separation, not for every small edit.

| Want | Suggested flow |
|------|----------------|
| Understand unfamiliar code | Spawn `researcher` → `report_done` creates a durable TaskReport with files, facts, risks → leader receives/reviews → leader synthesizes |
| Plan a risky change | Leader assigns `researcher` fact-finding first → researcher reports to leader → leader receives the inbox report and reviews task history/reports → leader creates/assigns a separate `planner` planning task |
| Execute an approved plan | Assign one focused task to `implementer` → run checks → worker `report_done` with files changed → leader `close` when accepted |
| Keep a handoff from stalling | Ask the leader to route a task-id based `inform` or `assignment` to the right teammate |
| Resolve uncertainty | Worker sends `question` or an `agentteam_task` blocker report → leader `agentteam_receive()` → decide next step |
| Check team health | Open `/team` for status, mailbox attention, stale panes, recovery, or cleanup |

Recommended loop:

```text
clarify → create task with owner when clear → send task-id assignment → teammate works visibly → receive full inbox text → inspect task history/reports when needed → synthesize
```

Use natural language first:

```text
Let a researcher inspect this area. Create the task, choose the matching teammate, send the assignment, then summarize the result when it reports back.
```

The leader should not make you memorize teammate names when the intent is clear. If one teammate matches the requested role, reuse it. If several could match, ask a short clarification. If none exists, ask before spawning. Once a task has an owner, `agentteam_send` can omit `to` and route through `taskId`. Never broadcast by default.

Keep the leader as coordinator: teammates produce facts, plans, edits, and reports; the leader decides what to adopt and how to answer the user.

---

## 🎮 `/team` Console

`/team` is the only slash command exposed by agentteam. It opens a local console instead of a pile of maintenance commands.

Attached to a team:

```text
/team
→ two-box master-detail console
→ tabs: Cockpit · Tasks · Mailbox · Members
→ Enter opens selected-item context actions
→ a opens team maintenance actions
```

The Cockpit tab is an interactive attention queue for active tasks and unread mailbox items, not a passive status box. The Tasks tab surfaces compact v0.6.2 history: latest TaskReport id/type/author/summary, latest TaskEvent/TaskMessageRef activity, and counts for reports/events/messageRefs. It does not hydrate full report text or task-bound message bodies; use `agentteam_task action=report reportId=<id>` or `agentteam_receive` for explicit full-text reads.

Not attached to a team:

```text
/team
→ global two-box master-detail console
→ tabs: Teams · Panes
→ Enter opens selected-team/pane context actions
→ a opens global maintenance actions
```

| Key | Action |
|:---:|--------|
| `Tab` / `Shift+Tab` | Cycle tabs |
| `1`..`4` | Attached tabs: Cockpit, Tasks, Mailbox, Members |
| `1`..`2` | Global tabs: Teams, Panes |
| `↑` `↓` | Move list selection, or scroll details when detail focus is active |
| `→` / `e` | Move scroll focus from list to detail |
| `←` / `Esc` | Return detail scroll focus to list; then collapse details or close |
| `Enter` | Open selected-item context actions / choose action |
| `a` | Open team/global maintenance actions |
| `q` | Close |

The panel intentionally does **not** focus tmux panes, perform task/message CRUD, or mark mailbox items delivered/read. Use tmux for pane navigation, and use tools for collaboration work. `/team` is for local runtime visibility, recovery, and cleanup. Expanded Details use an internal reader so long descriptions and compact history summaries remain readable without flooding terminal scrollback.

Action menus keep selected-item actions separate from maintenance and destructive operations. Sections render as `SELECTED ITEM`, `MAINTENANCE`, and `DANGER ZONE`; the footer shows the selected action description, and destructive confirmation defaults to **No, Cancel operation**.

Available action-menu operations include:

- selected-item context actions such as inspecting details, recovering a selected team, deleting a selected team, or removing a selected teammate;
- team/global maintenance actions such as refresh/reconcile, compact leader mailbox projection sync without marking messages read or delivered, deleting the current team, and cleanup of all agentteam state/stale panes while keeping the current pane alive and clearing its agentteam label.

---

## 💬 Messages & Wake Behavior

Public collaboration vocabulary is intentionally small: task status is `open | blocked | done`, worker health is `offline | idle | busy | error`, `agentteam_send` types are `assignment | question | inform`, and task reports are `report_done | report_blocked`.

Messages carry an implicit **wake hint** that controls whether AgentTeam creates a bridge delivery/projection request. Mailbox read state is simple: messages remain unread until `agentteam_receive({ markRead: true })`, which is the explicit read boundary and the only normal full-text mailbox entry point. Single-message receive output stays clear/full; when multiple unread messages are returned, the human-facing receive text folds them by task/thread with compact ids/types/from/summary previews while `details.messages` remains the full returned mailbox payload with full text unchanged. tmux is the visible pane/container layer only; AgentTeam has a single bridge-only delivery policy and uses durable Outbox effects, durable bridge worker requests, compact durable leader mailbox projection, and bounded leader attention wakes. `deliveryMode` is not a vNext config key; remove it from config or roll back by pinning npm `pi-agentteam@0.5.0` instead of selecting legacy terminal transport. Worker-to-leader signals use compact native/idempotent projection plus compact bounded leader attention for `question` to leader and owner `report_done`/`report_blocked`. Projection and attention are reminders/wake signals with message id, task, type, summary, and a receive instruction; they do not carry the full message body. `inform` never requests leader attention. If bridge/projection is unavailable, work remains visible as public `busy`/`error` worker health plus diagnostics; AgentTeam does not silently fall back to terminal key injection. Native submit/projection/attention never marks mailbox `readAt` or `deliveredAt`; explicit receive owns those transitions.

| `agentteam_send` type | Purpose | Wake | Typical Flow |
|------|---------|------|--------------|
| `assignment` | Leader → worker task assignment | hard | Leader delegates unblocked actionable work |
| `question` | Clarification request | soft | Anyone asks a question |
| `inform` | Informational update | none | Context sharing; does not wake a worker by default |

> `report_done` and `report_blocked` are task-report outcomes, not `agentteam_send` types. Non-leaders may use `agentteam_task action=report_done` or `agentteam_task action=report_blocked` only for tasks they own; non-owners should use `inform` or `question` for context.
>
> Bounded leader attention means one compact native leader wake that should `agentteam_receive`, review, decide, and stop. It must not auto-spawn, auto-create downstream tasks, broadcast, or start worker-to-worker chains.
>
> Task-bound sends keep the recipient mailbox as the communication source of truth. The task stores only compact `TaskMessageRef` audit/index rows (`taskId`, `mailboxMessageId`, sender/recipient/type/thread/summary metadata) and does not copy the message body into task history. Legacy `task.notes` are migrated into TaskReport/TaskEvent/TaskMessageRef history and removed from active state; new task-bound sends produce zero hidden communication-ref notes. `/team` now shows compact TaskReport/TaskEvent/TaskMessageRef summaries and counts instead of latest-note/folded-ref primary UI. Refs do not count as ordinary/latest notes and do not bump task recency.
>
> Peer `inform` handoffs are mailbox communication plus compact `TaskMessageRef` task audit refs/diagnostic event refs only; diagnostic refs are compact, do not copy the full body, and do not create ordinary panel/prompt context. They do not create worker delivery requests or authorize downstream work. For researcher→planner chains, the leader should review the researcher report and then create/assign a separate planner task or direct question.
>
> Task-based routing: when `taskId` is provided and `to` is omitted, leader messages route to the task owner; messages from the task owner route back to `team-lead`. Unowned, missing, or ambiguous tasks return an error instead of falling back to broadcast.

---

## ✅ Leader-Gated Task Governance

Task facts are leader-gated. By default, only `team-lead` factually changes `task.status`, `task.owner`, `task.blockedBy`, title, or description. Planner is advisory by default, not a second leader: it can report findings and recommendations, while the leader decides what to create, assign, block/unblock, or close.

Non-leader task actions are report/history-oriented:

- `agentteam_task action=report_done` from the task owner creates a durable TaskReport, creates a compact leader mailbox notification, requests compact leader projection plus bounded leader attention, and leaves the task open until leader review. The leader closes accepted work with `action=close`.
- `agentteam_task action=report_blocked` from the task owner creates a durable blocked TaskReport, creates a high-priority compact leader mailbox notification, requests compact leader projection plus bounded leader attention, and does not factually mutate `status` or `blockedBy`. Unread blocked reports appear as panel attention; after the report mailbox item is read, long-lived panel attention comes from factual blocked tasks (`status`/`blockedBy`) instead. The leader blocks/unblocks with `action=block blockedBy=[...]` or `action=unblock`.
- `agentteam_task action=progress` records compact local TaskEvent progress/history only. It does not append legacy task-note rows, notify `team-lead`, create mailbox/projection/attention side effects, or create linked communication refs. If someone needs to know, use `agentteam_send`; use `report_done`/`report_blocked` for durable report artifacts/action requests.
- `blockedBy` is a hard actionability gate: blocked tasks cannot receive actionable `assignment` sends or worker delivery. Non-action `agentteam_send` communication such as `inform` and `question` remains allowed so the team can converge; done/blocked reports use `agentteam_task`.
- In worker delivery prompts, same-task assigned task facts and task-bound mailbox messages are merged into one task-centric block so the instruction/question appears once; unscoped or different-task messages still appear separately in Messages.

Rollback/migration baseline remains npm `pi-agentteam@0.5.0`; do not treat local WIP versions as a stable runtime fallback.

---

## 👥 Built-in Roles

agentteam intentionally keeps a small fixed role set for predictable permissions and prompts.

**🔬 researcher** — `read` `grep` `find` `ls` + collab
> Fact finding: relevant files, constraints, risks, and evidence-backed findings

**📋 planner** — `read` `grep` `find` `ls` + collab
> Advisory planning for complex work: options, risks, dependencies, and acceptance criteria

**🛠 implementer** — `read` `grep` `find` `ls` `bash` `edit` `write` + collab
> Focused code changes, checks, and validation evidence

> **collab** = `agentteam_send` + `agentteam_receive` + `agentteam_task`

---

## ⚙️ Model Configuration

npm/pi install does **not** create or edit runtime config files. To create, inspect, validate, or preview migration for the local runtime config, run:

```text
/team config init
/team config show
/team config validate
/team config migrate --dry-run
```

`/team config init` creates `${PI_AGENTTEAM_HOME || ~/.pi/agent/agentteam}/config.json` from the bundled `config.example.json` on first run and refuses to overwrite an existing file. Missing config is actionable but safe: `/team config show` reports the path, `Exists: no`, and points users to `/team config init` without implicitly writing anything.

The preferred v1 runtime config schema is:

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

Set `agents.<role>.model` to a pi model selector, preferably the fully qualified selector you use in pi (for example `openai/gpt-5.3-codex` or your configured alias). `null`, empty string, or a missing key means use the current default model. Legacy `agentModels.<role>` remains readable for compatibility and emits migration guidance; existing v1 `agents.<role>.model` values take precedence over legacy values. Effective model source metadata is reported as `v1`, `legacy`, `null`, or `default`, and spawn output/details include the effective launch model label/source.

`/team config migrate --dry-run` reads the current config and prints the proposed v1 config preview with `version`, `agents`, `automation`, and `ui`. It is dry-run only: it does not write config, overwrite user content, delete legacy `agentModels`, or change file mtime. Invalid or missing config returns an actionable preview/error instead of throwing.

Configuration is role-level only (`planner`, `researcher`, `implementer`); per-member overrides and live model switching are intentionally not supported. Changes apply only to future teammate spawns/respawns; existing workers keep the model they were launched with. The leader always uses your current session model. The `/team` panel exposes only a compact config projection (exists/schema version/diagnostic count/effective role model source) and does not dump arbitrary full config content.

Runtime state is stored under `~/.pi/agent/agentteam/` (`teams/<team>/team.json`, `teams/<team>/inboxes/`, `teams/<team>/outbox.json`, `teams/<team>/runtime.json`, `sessions/`, and `worker-sessions/`). `config.json` lives in the same directory. Set `PI_AGENTTEAM_HOME` for testing or temporary sandboxes; `/team config show` displays the effective path and role models.

---

## 🛠 Tools & Commands

### Tools

| Tool | Description |
|------|-------------|
| `agentteam_create` | Create a new team |
| `agentteam_spawn` | Spawn a teammate (omit `task` for idle) |
| `agentteam_send` | Send typed communication to a specific teammate, an owned task, or explicit broadcast |
| `agentteam_receive` | Pull unread mailbox messages; this is the full-text read boundary; multi-message human output is compactly grouped while details keep full text |
| `agentteam_task` | Leader-gated shared task facts plus TaskReport/TaskEvent/TaskMessageRef history queries; owner-only `report_done`/`report_blocked` create durable report action requests |

### Command

| Command | Description |
|---------|-------------|
| `/team` | Unified local console for status, recovery, teammate removal, team deletion, and cleanup |

---

## 🏗 Architecture

Current boundary layout: api/app/adapters/core/runtime/state are explicit; removed root facades are not part of the package surface.

```
index.ts              ← Extension entry point
├── api/              ← Pi-facing registration entrypoints for tools/commands composition
├── tools/            ← Thin tool registrations plus team/message/task/worker services, routing, and policy helpers
├── commands/         ← /team console command and runtime action handlers
├── hooks/            ← Thin hook registrations plus lifecycle/context services and tool guard
├── teamPanel/        ← Interactive console (layout, view model, input, actions)
├── types.ts          ← Public vocabulary/types (Task, Message, Worker)
├── internalTypes.ts  ← Internal persisted/runtime store shapes (not public API)
├── config.ts / agents.ts / session.ts / protocol.ts / policy.ts / renderers.ts
├── state/            ← Focused file-based stores (team, inbox, sessions, runtime, outbox, quarantine)
├── adapters/         ← Explicit runtime/tmux/bridge adapters used by hooks, tools, commands, and panel
│   ├── runtime/      ← Session attachment, team lookup, storage readiness, naming/spawn rules, runtime service
│   ├── bridge/       ← Bridge delivery/projection/lifecycle adapter surface
│   └── tmux/         ← Patchable tmux visibility adapter and team pane reconcile/cleanup
├── runtime/          ← Focused bridge/projection/outbox runtime internals; no top-level runtime facade
├── protocol.ts       ← Message type defaults & wake hints
├── orchestration.ts  ← Leader digest (coordination counters)
├── policy.ts         ← Leader delegation policy
├── agents.ts         ← Role discovery & agent loading
├── tmux/             ← Low-level tmux client, pane/window/process/label helpers
├── messageLifecycle.ts ← Mailbox delivered/read helpers
└── agents/           ← Bundled role prompts (markdown)
    ├── researcher.md
    ├── planner.md
    └── implementer.md
```

### Package Surface Tiers

Packed runtime files are not all stable public API. The package intentionally has no restrictive `exports` map at this surface tier, so existing deep imports are not newly blocked yet, but only the surfaces below should be treated as stable promises.

- **Public/stable promises**
  - Pi extension default entrypoint is `package.json#pi.extensions` pointing at `./index.ts`; `index.ts` is the extension facade.
  - Public collaboration vocabulary and simple public shapes live in `types.ts`.
  - User-facing Pi tool/command schemas and behavior are the primary product API.
  - `deliveryPolicy.ts` bridge-only helpers document the supported delivery policy surface.
- **Compatibility/composition surfaces**
  - `api/tools.ts` and `api/commands.ts` are extension composition helpers for wiring AgentTeam into a Pi extension; they are kept stable, but they are not a broad end-user API.
  - `adapters/bridge/index.ts` is a bridge runtime adapter compatibility surface for worker bridge composition, not a broad user API.
- **Internal/packed-for-runtime paths**
  - `app/`, `runtime/`, `state/`, `teamPanel/`, `commands/`, `hooks/`, `tmux/`, most `tools/`, `adapters/runtime/`, and `adapters/tmux/` are packed so the extension can run, not because every subpath is stable API.
  - `package.json#files` is a runtime packaging allow-list, not a promise that every packed subpath is stable API.
  - `docs/` and `scripts/` remain local-only and excluded from the package by default.

#### v0.6.8 npm sync compatibility note

If v0.6.8 is promoted to npm, npm `latest` may jump from `pi-agentteam@0.6.3` to v0.6.8 after several GitHub-only releases. The package comparison against npm `0.6.3` is additive: 8 internal runtime/source files added and 0 packed files removed.

No root compatibility facades/wrappers were added: `commands.ts`, `tools.ts`, `state.ts`, `tmux.ts`, `runtime*.ts`, and `runtimeWake.ts` were not packed in npm `0.6.3` and remain absent. Adding those paths would expand the public-looking surface rather than restore npm `0.6.3` compatibility.

Stable/public entries remain present: `index.ts`, `types.ts`, `deliveryPolicy.ts`, `api/tools.ts`, `api/commands.ts`, and `adapters/bridge/index.ts`. Packed implementation dirs are included so the TypeScript Pi extension can run, but they are not all stable subpath APIs. Unsupported deep imports into internals may need adjustment.

Release notes are the compatibility path for v0.6.8. Targeted shims/wrappers are considered only with concrete external-user evidence for a specific broken import path that existed in npm `0.6.3`; absent that evidence, AgentTeam will not add broad compatibility wrappers.

Public behavior remains behavior-preserving: `agentteam_receive` is the full-text/read boundary; `/team` stays compact/read-mostly and does not mark mailbox read/delivered; delivery stays bridge-only with no terminal-key fallback; AgentTeam does not add autopilot, hidden workers, worker-spawns-worker, automatic downstream task creation, or other downstream automation.

### Design Principles

- **Removable** — delete the folder and reload; no core modifications
- **Observable** — each teammate is a visible tmux pane you can watch
- **Minimal prompt burden** — role behavior in markdown, not inflated system prompts
- **File-based state** — JSON + lock files + atomic writes; no database
- **Event-driven** — teammates wake on actionable messages, not polling

---

## ✅ Checks & Release Readiness

```bash
npm test                 # unit/package smoke suites
npm run typecheck        # tsc --noEmit
npm run check:boundaries # import/public-surface boundary guard
npm run check            # test + typecheck + git diff --check + boundaries
npm run release:check    # npm run check + npm pack --dry-run --ignore-scripts
npm run test:e2e         # optional manual tmux smoke; requires real tmux/pi runtime
```

`release:check` is safe for local CI: it does not publish, install, tag, bump versions, or edit user settings. It intentionally does **not** run `test:e2e` because the e2e smoke requires a real tmux/pi environment and is best run manually in a clean `PI_AGENTTEAM_HOME` sandbox.

The package surface is intentionally explicit: `package.json#files` lists required top-level files plus `api/`, `app/`, `adapters/`, `commands/`, `hooks/`, `core/`, `runtime/`, `state/`, `teamPanel/`, `tmux/`, `tools/`, and bundled `agents/`. It does not use broad `*.ts`, and removed root facades/wrappers are explicitly excluded/guarded.

Current automated/source-level status: FULL PASS only after `npm test`, `npm run typecheck`, `git diff --check`, `npm run check:boundaries`, `npm run check`, and `npm run release:check` pass in the working tree. This is local validation, not publishing.

| Suite | Covers |
|-------|--------|
| Tools + state flow | create → spawn → send → receive → task lifecycle |
| Command | /team unified console |
| Protocol + orchestration | Wake defaults, leader digest injection |
| Panel rendering | Visual output across terminal widths |
| Delivery + permission guards | Role-based access control |
| Service unit helpers | Pure worker/message/task/context helper behavior |

## 🧪 Manual smoke checklist

These checks are release-readiness notes for the current working tree; they do not imply a package has been published.

- [ ] Current vNext layout sanity
  - Fresh state should use `teams/<team>/team.json`, `teams/<team>/inboxes/<member>.json`, `teams/<team>/outbox.json`, `teams/<team>/runtime.json`, `sessions/session-<sha>.json`, and `worker-sessions/`.
  - Active old layout files such as `state.json`, `mailboxes/`, `outbox-state.json`, `bridge-state.json`, `delivery-state.json`, and `leader-projection-state.json` should quarantine rather than load.
- [ ] Package surface sanity
  - `npm run release:check` should finish with `npm pack --dry-run --ignore-scripts` only; do not run `npm publish`, do not bump `version`, do not tag/commit, and do not edit `~/.pi/agent/settings.json`.
  - `docs/` remains local design notes and `scripts/` remains local development helpers; neither directory is included in the npm package `files` list by default.
- [ ] Stable fallback remains documented
  - Compare or roll back with npm `pi-agentteam@0.5.0` when needed; do not treat unpublished local vNext work as a stable fallback.
- [ ] Internal delivery diagnostics sanity
  - Evidence: unit coverage in `tests/suites/service-units.cjs` for expired/stale request handling, recovery, and no-resend behavior. These are runtime diagnostics, not public task/worker states.
- [ ] PushMailbox failure evidence
  - Evidence: unit coverage in `tests/suites/tools-state.cjs` for leader mailbox push failure warnings/details on non-leader `report_done` and `report_blocked`.
- [ ] Bridge-only delivery remains in effect
  - Confirm no tmux terminal-key fallback is used; mailbox read still happens only through `agentteam_receive`.

---

## ⚠️ Limitations

- Workers are separate visible `pi` sessions in tmux panes, but tmux is only the visible container/labels/reconcile/cleanup/debug layer. AgentTeam uses one bridge-only delivery policy: bridge requests/projection only, with no automatic fallback to terminal key injection.
- Durable Outbox plus runtime adapter diagnostics are production delivery diagnostics (`outbox.json`, `outbox-diagnostics.json`, and `runtime.json` sections for bridge lease, delivery request, leader projection, and leader attention state). Internal request/projection/attention lifecycles such as pending, claimed, submitted, started, completed, projected, or failed may appear only in diagnostics/details; inbox read state remains owned by `agentteam_receive`.
- In diagnostics, the durable bounded-leader-attention Outbox effect kind is `leader_attention_requested`. Task-bound send indexing uses `task_message_ref_append_requested`. Legacy pending `task_note_append_requested` effects are migrated/cleaned before validation when possible; otherwise unsupported legacy state is quarantined. Legacy active persisted outbox effects using `leader_triage_requested` have no compatibility path; they quarantine as unsupported legacy state instead of being normalized or executed.
- Rollback/migration: pin or reinstall a rollback package version (for example npm `pi-agentteam@0.5.0`) and respawn workers. There is no automatic in-process switch from bridge-only delivery to terminal transport; bridge unavailable appears as public `busy`/`error` worker health with diagnostics. For manual smoke, use a clean `PI_AGENTTEAM_HOME` and respawn old workers so bridge leases exist.
- `agentteam_task action=create` can include `owner` when the responsible teammate is already clear; this assigns shared state only and does not send/wake by itself
- `agentteam_task action=progress` records compact local TaskEvent progress/history only; it is not a leader notification channel and active team state has no legacy task-note rows
- `agentteam_send` can omit `to` only when `taskId` safely routes through an owned task; it never falls back to implicit broadcast
- Passing `task` to `agentteam_spawn` starts work immediately; omitting it creates an idle teammate for later `send`/`task` follow-up
- State is local to one machine (no remote/distributed support)
- Requires tmux; Windows terminals not supported (WSL works)

---

## 📄 License

[MIT](LICENSE) © 2026 linys77
