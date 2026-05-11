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
| 📋 | **Shared task board** | Create, claim, update, complete — full lifecycle tracking across the team |
| 💬 | **Typed messaging** | `assignment` · `question` · `blocked` · `completion_report` · `fyi` — each with auto-wake semantics |
| 🎯 | **Role-based tool guard** | Researcher/Planner (read-only) → Implementer (full tools) — least privilege by default |
| 📡 | **Event-driven wake** | Teammates auto-wake on actionable messages; no polling, no wasted tokens |
| 📊 | **Unified `/team` console** | Browse state, recover old teams, remove stale teammates, and cleanup without memorizing extra commands |
| 🔗 | **Peer handoff** | Workers coordinate directly (researcher → planner) without going through the leader |
| 🧹 | **Zero footprint** | One folder, file-based state, no database — delete and it's gone |

---

## 📦 Install

```bash
pi install npm:pi-agentteam
```

**Requirements:** [pi](https://github.com/badlogic/pi-mono) ≥ 0.60 · [tmux](https://github.com/tmux/tmux). The leader pi session must run inside tmux.

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
  synthesize completion reports.
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
| Understand unfamiliar code | Spawn `researcher` → task note with files, facts, risks → leader synthesizes |
| Plan a risky change | `researcher` for facts → `planner` for options and acceptance criteria |
| Execute an approved plan | Assign one focused task to `implementer` → run checks → complete with files changed |
| Keep a handoff from stalling | Ask the leader to route a task-id based `fyi` or `assignment` to the right teammate |
| Resolve uncertainty | Worker sends `question` or `blocked` → leader `agentteam_receive()` → decide next step |
| Check team health | Open `/team` for status, mailbox attention, stale panes, recovery, or cleanup |

Recommended loop:

```text
clarify → create task with owner when clear → send task-id assignment → teammate works visibly → receive → inspect task notes → synthesize
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

```
/team
→ Members · Tasks · Mailbox · Details
→ select an item
→ Enter opens contextual actions
```

Not attached to a team:

```
/team
→ AgentTeam Console
→ list saved teams and stale panes
→ recover an old team as current leader, delete a team, or cleanup all agentteam state
```

| Key | Action |
|:---:|--------|
| `Tab` | Cycle sections |
| `↑` `↓` | Move selection |
| `Enter` | Open action menu / choose action |
| `Esc` | Step back / close |

The panel intentionally does **not** focus tmux panes or perform task/message CRUD. Use tmux for pane navigation, and use tools for collaboration work. `/team` is for local runtime visibility, recovery, and cleanup. Expanded Details use an internal reader so long notes/messages remain readable without flooding terminal scrollback.

Available action-menu operations include:

- refresh/reconcile tmux pane bindings;
- sync leader mailbox projection without marking messages read;
- remove selected teammate;
- delete selected/current team;
- recover an existing team as the current leader;
- cleanup all agentteam state and stale panes while keeping the current pane alive and clearing its agentteam label.

---

## 💬 Messages & Wake Behavior

Messages carry an implicit **wake hint** that controls how the recipient reacts. Mailbox lifecycle is `created → delivered → read`: wake marks messages as delivered, while only `agentteam_receive` marks them read.

| Type | Purpose | Wake | Typical Flow |
|------|---------|------|--------------|
| `assignment` | Leader → worker task assignment | hard | Leader delegates work |
| `question` | Clarification request | soft | Anyone asks a question |
| `blocked` | Escalation needing attention | hard | Worker hits a wall |
| `completion_report` | Work finished | hard (leader) · soft (teammate) | Worker reports back |
| `fyi` | Informational update | none* | Context sharing |

> \* *Peer handoff exception:* when a non-leader sends `fyi` to an idle teammate, wake is auto-upgraded to `soft` so the handoff doesn't stall silently.
>
> Peer `completion_report` and `blocked` messages are also mirrored to `team-lead` so the leader can always converge completed work and blockers.
>
> Task-based routing: when `taskId` is provided and `to` is omitted, leader messages route to the task owner; messages from the task owner route back to `team-lead`. Unowned, missing, or ambiguous tasks return an error instead of falling back to broadcast.

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

Create `~/.pi/agent/agentteam/config.json` to assign models per role:

```json
{
  "agentModels": {
    "planner": "glm-5.1",
    "researcher": "glm-5.1",
    "implementer": "gpt-5.3-codex"
  }
}
```

Values are model selectors from `~/.pi/agent/models.json`. Empty string or missing key = use the default model. The leader always uses your current session model.

Runtime state is stored under `~/.pi/agent/agentteam/` (`teams/`, `mailboxes/`, `session-bindings`, and `worker-sessions`). `config.json` lives in the same directory. Set `PI_AGENTTEAM_HOME` only for testing or temporary sandboxes.

---

## 🛠 Tools & Commands

### Tools

| Tool | Description |
|------|-------------|
| `agentteam_create` | Create a new team |
| `agentteam_spawn` | Spawn a teammate (omit `task` for idle) |
| `agentteam_send` | Send a typed message to a specific teammate, an owned task, or explicit broadcast |
| `agentteam_receive` | Pull unread mailbox messages |
| `agentteam_task` | Manage shared tasks (`create` can include `owner`; `claim` · `update` · `complete` · `list` · `note`) |

### Command

| Command | Description |
|---------|-------------|
| `/team` | Unified local console for status, recovery, teammate removal, team deletion, and cleanup |

---

## 🏗 Architecture

```
index.ts              ← Extension entry point
├── tools/            ← Thin tool registrations plus team/message/task/worker services, routing, and policy helpers
├── commands/         ← /team console command and runtime action handlers
├── hooks/            ← Thin hook registrations plus lifecycle/context services and tool guard
├── teamPanel/        ← Interactive console (layout, view model, input, actions)
├── state.ts          ← State facade
├── state/            ← File-based stores (team, mailbox, bindings, merge policy)
├── runtime.ts        ← Runtime facade (session helpers, team lookup, leader mailbox projection)
├── runtimeRules.ts   ← Pure naming, owner, and spawn-task classification rules
├── runtimeWake.ts    ← Worker/leader wake prompts and wake status updates
├── runtimePanes.ts   ← Pane reconciliation and team pane cleanup
├── runtimeStorage.ts ← Team storage/mailbox readiness cache
├── runtimeService.ts ← Leader mailbox sync, digest injection
├── protocol.ts       ← Message type defaults & wake hints
├── orchestration.ts  ← Leader digest (coordination counters)
├── policy.ts         ← Leader delegation policy
├── agents.ts         ← Role discovery & agent loading
├── tmux.ts           ← tmux facade
├── tmux/             ← tmux client, pane/window/wake/label helpers
├── messageLifecycle.ts ← Mailbox created/delivered/read helpers
├── types.ts          ← Shared type definitions
└── agents/           ← Bundled role prompts (markdown)
    ├── researcher.md
    ├── planner.md
    └── implementer.md
```

### Design Principles

- **Removable** — delete the folder and reload; no core modifications
- **Observable** — each teammate is a visible tmux pane you can watch
- **Minimal prompt burden** — role behavior in markdown, not inflated system prompts
- **File-based state** — JSON + lock files + atomic writes; no database
- **Event-driven** — teammates wake on actionable messages, not polling

---

## ✅ Tests

```bash
npm test
npm run test:e2e   # optional local tmux smoke; requires tmux
```

| Suite | Covers |
|-------|--------|
| Tools + state flow | create → spawn → send → receive → task lifecycle |
| Command | /team unified console |
| Protocol + orchestration | Wake defaults, leader digest injection |
| Panel rendering | Visual output across terminal widths |
| Wake + permission guards | Role-based access control |
| Service unit helpers | Pure worker/message/task/context helper behavior |

---

## ⚠️ Limitations

- Workers are separate `pi` sessions in tmux panes, not in-process subagents
- `agentteam_task action=create` can include `owner` when the responsible teammate is already clear; this assigns shared state only and does not send/wake by itself
- `agentteam_send` can omit `to` only when `taskId` safely routes through an owned task; it never falls back to implicit broadcast
- Passing `task` to `agentteam_spawn` starts work immediately; omitting it creates an idle teammate for later `send`/`task` follow-up
- State is local to one machine (no remote/distributed support)
- Requires tmux; Windows terminals not supported (WSL works)

---

## 📄 License

[MIT](LICENSE) © 2026 linys77
