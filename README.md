# pi-agentteam

Multi-agent team orchestration for the [pi coding agent](https://github.com/badlogic/pi-mono). Coordinate a leader with specialized teammates — **researcher**, **planner**, and **implementer** — each running in a visible tmux pane, collaborating through shared tasks and typed messages.

```
┌─────────────┬──────────────────────────────────────────────┐
│  👑 leader   │  🔬 researcher                              │
│             │  Scans codebase, reads files, reports        │
│  Delegates, │  findings back to the team.                  │
│  coordinates,│                                              │
│  synthesizes│                                              │
│             ├──────────────────────────────────────────────│
│             │  📋 planner / 🛠 implementer                  │
│             │  Plans tasks or writes code based on          │
│             │  research findings.                           │
└─────────────┴──────────────────────────────────────────────┘
```

## Installation

```bash
pi install npm:pi-agentteam
```

Requires:
- [pi](https://github.com/badlogic/pi-mono) ≥ 0.60
- [tmux](https://github.com/tmux/tmux) ≥ 3.3
- Node.js ≥ 22

## Quick Start

In your pi session:

```
# Create a team
agentteam_create("my-project", { description: "Optimize the build pipeline" })

# Spawn teammates (omit task to create idle)
agentteam_spawn({ name: "research", role: "researcher", task: "Analyze the build pipeline and report bottlenecks" })
agentteam_spawn({ name: "plan", role: "planner" })

# Later, send work or handoffs
agentteam_send({ to: "plan", message: "Research done, draft an optimization plan", type: "fyi" })
```

Or use the `/team` command for an interactive dashboard:

```
/team          # Open the team panel (members, tasks, mailbox)
```

## Features

- **Leader–worker coordination** — one leader delegates and synthesizes; workers execute
- **3 built-in roles** — researcher (read-only), planner (read-only), implementer (full tools)
- **Typed messaging** — `assignment`, `question`, `blocked`, `completion_report`, `fyi`
- **Shared task board** — create, claim, update, complete tasks across the team
- **Interactive `/team` panel** — browse members, tasks, and mailbox with keyboard shortcuts
- **Peer handoff** — workers can message each other directly (e.g. researcher → planner)
- **Event-driven wake** — teammates auto-wake on assignments, questions, and peer handoffs
- **tmux-native** — each teammate is a real pi session in its own pane; no hidden processes
- **File-based state** — JSON + lock files for cross-session safety; no database dependency

## How It Works

Each teammate runs as a separate `pi` session in its own tmux pane. The leader (your main session) coordinates by:

1. **Creating tasks** on a shared board
2. **Assigning** them to teammates via typed messages
3. **Receiving** completion reports and status updates

Workers wake up when they receive actionable messages, do their work, and report back. Peer workers can also coordinate directly when useful (e.g. a researcher sends findings to a planner).

### Message Types & Wake Behavior

| Type | Purpose | Wake |
|------|---------|------|
| `assignment` | Leader → worker task assignment | Hard |
| `question` | Clarification request | Soft |
| `blocked` | Escalation needing leader attention | Hard |
| `completion_report` | Work finished, handoff back | Hard (leader) / Soft (teammate) |
| `fyi` | Informational update | None (except peer handoff → soft) |

### Tools Added

| Tool | Description |
|------|-------------|
| `agentteam_create` | Create a new team |
| `agentteam_spawn` | Spawn a teammate (with optional initial task) |
| `agentteam_send` | Send a typed message to a teammate or the leader |
| `agentteam_receive` | Pull unread mailbox messages |
| `agentteam_task` | Manage shared tasks (create, claim, update, complete, list, note) |

### Commands

| Command | Description |
|---------|-------------|
| `/team` | Open interactive team dashboard |
| `/team-sync` | Sync leader mailbox from disk |
| `/team-remove-member <name>` | Remove a teammate and clean up |
| `/team-delete` | Delete the current team |
| `/team-cleanup` | Delete all teams and kill orphan panes |

### `/team` Panel Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Cycle sections (members / tasks / mailbox) |
| `↑↓` | Navigate within section |
| `Enter` | Focus selected teammate pane |
| `l` | Focus leader pane |
| `o` | Toggle detail expansion |
| `s` | Sync leader mailbox |
| `r` | Refresh panel |
| `Esc` | Close panel |

## Built-in Roles

| Role | Tools | Best For |
|------|-------|----------|
| **researcher** | `read, grep, find, ls` + collaboration | Codebase analysis, documentation research |
| **planner** | `read, grep, find, ls` + collaboration | Task decomposition, acceptance criteria |
| **implementer** | `read, grep, find, ls, bash, edit, write` + collaboration | Code changes, file creation, test execution |

You can also add custom agents in `.pi/agents/` and use those role names when spawning.

Role aliases: `plan`/`planning`/`规划` → planner, `research`/`研究` → researcher, `implement`/`developer`/`实现` → implementer.

## Model Configuration

Create `~/.pi/agent/extensions/agentteam/config.json`:

```json
{
  "agentModels": {
    "planner": "claude-sonnet-4-20250514",
    "researcher": "claude-sonnet-4-20250514",
    "implementer": "claude-sonnet-4-20250514"
  }
}
```

Values are model selectors from `~/.pi/agent/models.json`. Empty string means "no override" (uses the default model).

## Architecture

```
index.ts              ← Extension entry point (registers tools, commands, hooks)
├── tools/
│   ├── team.ts       ← agentteam_create, agentteam_spawn
│   ├── message.ts    ← agentteam_send, agentteam_receive
│   ├── task.ts       ← agentteam_task
│   └── shared.ts     ← Tool dependency injection
├── commands/
│   ├── team.ts       ← /team dashboard
│   ├── cleanup.ts    ← /team-cleanup, /team-delete
│   └── shared.ts     ← Command dependency injection
├── hooks/
│   ├── agent.ts      ← Agent lifecycle hooks
│   ├── session.ts    ← Session binding hooks
│   ├── context.ts    ← Context injection (leader policy, worker prompt)
│   └── toolGuard.ts  ← Role-based tool access control
├── teamPanel/
│   ├── layout.ts     ← Panel rendering (visual hierarchy)
│   ├── viewModel.ts  ← Data → view model transformation
│   └── input.ts      ← Keyboard input handling
├── state.ts          ← File-based team state, mailbox, locks
├── runtime.ts        ← Worker wake, pane management, session binding
├── runtimeService.ts ← Leader mailbox sync, digest injection
├── protocol.ts       ← Message type defaults & wake hints
├── orchestration.ts  ← Leader digest (lightweight coordination counters)
├── policy.ts         ← Leader delegation policy prompt
├── decisions.ts      ← Team decision helpers
├── agents.ts         ← Role discovery & agent loading
├── tmux.ts           ← tmux pane/window management
├── types.ts          ← Shared type definitions
├── utils.ts          ← Utility functions
└── agents/           ← Bundled role prompts
    ├── researcher.md
    ├── planner.md
    └── implementer.md
```

### Design Principles

- **Removable** — delete the extension folder and reload pi; no core modifications
- **Observable** — each teammate is a visible tmux pane you can watch in real time
- **Minimal prompt burden** — role behavior lives in markdown files, not inflated system prompts
- **File-based state** — JSON with lock files + atomic writes; no database, no network
- **Event-driven wake** — teammates wake on actionable messages, not polling

## Running Tests

```bash
node tests/run.cjs
```

Test suites:
- **Tools + state flow** — create, spawn, send, receive, task lifecycle
- **Commands** — /team, /team-sync, /team-cleanup
- **Protocol + orchestration** — wake defaults, leader digest injection
- **Panel rendering** — visual output across terminal widths
- **Leader wake + permission guards** — role-based access control

## Limitations

- Workers are separate pi sessions in tmux panes, not in-process subagents
- Creating a teammate and starting work are distinct steps (omit `task` for idle)
- State is local to one machine (no remote/distributed team support)
- Requires tmux; not compatible with Windows terminals (WSL works)

## License

[MIT](LICENSE)
