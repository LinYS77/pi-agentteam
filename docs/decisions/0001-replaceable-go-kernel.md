# Decision Record 0001: Replaceable Go Performance Kernel

> Status: accepted for planning; implementation deferred.
> Date: 2026-06-09
> Scope: Slice 0 documentation and architecture boundary record only.

## Context

AgentTeam is currently a TypeScript/Node pi extension. The public product model depends on pi tool/command/hook registration, role prompts, visible tmux teammate panes, local file-backed state, explicit mailbox reads, and leader-gated task governance. Recent v0.4.x work has already added profiling gates and compact read models for state, `/team`, tmux, and PlanRun behavior. Performance work must therefore preserve the TypeScript/pi facade and first measure specific hot paths instead of treating the whole product as a language-rewrite problem.

The high-performance native direction is still valuable, but only as a replaceable local kernel/helper behind stable ports. The kernel must be optional: a TypeScript implementation remains the source of truth for compatibility, tests, and fallback behavior.

## Decision

AgentTeam will keep the TypeScript/pi control plane as the mandatory runtime facade. Future Go work, if profiling justifies it, may provide an optional replaceable high-performance kernel/helper behind explicit ports for bounded hot paths.

The Go kernel direction is constrained as follows:

- TypeScript remains responsible for pi extension loading, tool/command schemas, hooks, role prompts, `/team` TUI integration, leader-facing UX, package metadata, and npm distribution.
- Go code, when introduced in a later slice, must be replaceable by the existing TypeScript path and must fail closed to the TypeScript implementation when unavailable, incompatible, or disabled.
- Kernel APIs must pass compact structured data only; they must not become mailbox/report full-text readers, hidden schedulers, task owners, or worker processes.
- Native acceleration is eligible only where profiling shows a stable hot path and where the port boundary can preserve legacy behavior byte-for-byte.
- Slice 0 does not add Go code, native binaries, npm lifecycle hooks, package version changes, `npm version`, or `npm publish`.

## Non-Negotiable Product Boundaries

The optional kernel must preserve these boundaries:

- Visible teammate work remains in tmux panes owned by normal pi sessions.
- Leader-gated task governance remains authoritative; non-leader `report_done`/`report_blocked` stays report-only until leader review.
- `agentteam_receive` remains the mailbox full-text/read boundary.
- `agentteam_task action=report` remains the TaskReport full-text boundary.
- `/team` remains a compact read-mostly cockpit and does not mark mailbox delivered/read.
- PlanRun remains explicit: `approve` records a compact run, `advance` starts one step, leader close/review gates progress, and no hidden scheduler/autopilot/timer advances work.
- Workers do not spawn workers, create downstream tasks, or implicitly route peer reports into new work.
- Legacy state compatibility, including safe handling of `teams/-` and no destructive migration, remains required.

## Candidate Kernel Boundary

The first-class boundary is a local helper process or library adapter invoked by TypeScript through narrow ports. The helper is not a daemonized product surface and is not visible to users as a separate control plane.

Initial kernel candidates are ordered by profiling evidence, not preference:

1. Compact read-model derivation for panel/team summaries from already-authorized state snapshots.
2. Deterministic JSON validation, migration characterization, and projection building for large fixtures.
3. Tmux snapshot parsing and pane-label indexing after TypeScript captures the tmux subprocess output.
4. State diff/fingerprint calculation for `/team` no-diff refresh decisions.

The kernel must not own these responsibilities:

- pi extension registration, commands, tools, hooks, or prompts.
- tmux pane creation, worker lifecycle, or visible session management.
- mailbox full-text reads, report full-text reads, or read/delivered marking.
- task governance, PlanRun state transitions, leader nudge decisions, or worker assignment delivery.
- storage layout migration that can delete, rename, take over, or rewrite legacy teams without explicit TypeScript-controlled compatibility checks.

## Validation Requirements Before Any Go Slice

Before implementing Go code, a later slice must provide:

- Profiling evidence from existing deterministic benches showing the specific hotspot and baseline.
- A TypeScript port contract with typed inputs/outputs, fallback behavior, and compact/full-text boundary tests.
- Characterization fixtures proving TypeScript and kernel outputs are equivalent for current and legacy state.
- Failure-mode tests for missing binary/helper, version mismatch, malformed output, timeout, and disabled-kernel config.
- Release packaging plan that does not change public pi/npm behavior unless explicitly approved.

## Consequences

This keeps AgentTeam shippable as a TypeScript pi extension while allowing targeted native acceleration later. It prevents a native helper from becoming a second control plane, hidden automation service, or compatibility-breaking storage owner. It also keeps the release plan profiling-first: Go is justified by measured seams, not by replacing the architecture.
