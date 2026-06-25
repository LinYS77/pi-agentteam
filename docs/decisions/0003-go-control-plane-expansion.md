# Decision Record 0003: Go Control-Plane Expansion Gate

> Status: accepted for staged implementation after explicit user authorization.
> Date: 2026-06-25
> Scope: v0.6.49 architecture gate only; no runtime control-plane migration, npm version, npm publish, tag, or release in this slice.
> Supersedes: the future-only boundaries in `docs/decisions/0001-replaceable-go-kernel.md` and `docs/decisions/0002-module-owned-go-kernel-cutover.md` for work after v0.6.49. Those records remain historical evidence for the earlier bounded-helper phase and for the v0.6.48 `tmuxSnapshotParse` cutover.

## Context

v0.6.48 completed the first real Go-owned runtime cutover: `tmuxSnapshotParse` now defaults to the embedded Go helper and no longer has a TypeScript runtime parser fallback. That cutover intentionally kept Go parser-only. Immediately after that checkpoint, the user explicitly requested continuing by expanding Go into tmux capture, worker lifecycle, state, task/report/PlanRun, UI, and release/package control-plane areas.

That request is an architecture direction change, not another parser cutover. The old “Go must not own control plane” rule was useful while proving the helper model, but it now blocks the requested direction. This record accepts the new direction while requiring staged migration, explicit gates, and a TypeScript/pi facade during the transition.

## Decision

AgentTeam may evolve from a TypeScript/pi extension with bounded Go helpers into a TypeScript/pi facade backed by a main-package embedded Go control-plane core.

The target architecture is:

```text
pi extension entry, tool/command schema, operator prompts, and TUI shell
  -> TypeScript facade/adapters
  -> embedded Go control-plane core
  -> tmux / state / task-report-planrun / panel read model / package metadata helpers
```

The Go core may eventually own these implementation responsibilities after separate slice gates:

1. tmux capture execution and snapshot parse as one Go-owned adapter.
2. worker pane lifecycle operations behind explicit TypeScript tool/service calls.
3. state read/write and compact read models behind a compatibility-preserving repository port.
4. task/report/PlanRun state transitions while preserving leader-gated governance semantics.
5. `/team` panel view-model generation and render data shaping, while the pi TUI shell remains TypeScript-owned until separately replaced.
6. release/package verification and package-surface checks, while `npm version`, `npm publish`, tags, and releases remain separately authorized human/governance actions.

## Non-Negotiable Product Semantics

The migration may move implementations to Go, but it must preserve the product model unless a later decision explicitly changes it:

- visible teammate work remains in tmux panes.
- leader-gated task governance remains authoritative.
- non-leader `report_done` and `report_blocked` remain report-only until leader review.
- `agentteam_receive` remains the mailbox full-text/read boundary.
- `agentteam_task action=report` remains the TaskReport full-text boundary.
- workers do not spawn workers.
- peer reports do not auto-create downstream planner/implementer work.
- PlanRun remains explicit and does not gain a hidden scheduler/autopilot.
- legacy `teams/-` and no-identity teams remain compatible and non-destructively handled.

## Facade Boundary

TypeScript/pi remains the public product facade during this migration:

- pi extension registration, tool and command schemas, hook registration, role prompt files, operator prompt wording, and TUI component integration stay callable from TypeScript.
- TypeScript adapters remain responsible for converting pi/tool inputs into compact Go requests and for shaping compact diagnostics back to users.
- Go must not bypass the registered pi tools, commands, or leader action boundaries by running hidden background automation.

The facade may become thin. The implementation behind it may become Go-owned one port at a time.

## Runtime Shape

For performance and code simplicity, the preferred target is a single embedded Go binary with a stable JSON-RPC protocol and package-relative manifest. Per-call process spawning is acceptable for small parser calls and early proofs, but control-plane expansion should move toward a long-lived or pooled helper connection before high-frequency paths are cut over.

The binary must report compact capabilities so TypeScript can gate slices independently. Capability names should be narrow, such as:

- `tmuxSnapshotCapture`
- `workerLifecycle`
- `stateRepository`
- `taskReportPlanRun`
- `teamPanelViewModel`
- `packageReleaseVerify`

Each capability needs its own parity corpus, failure classes, no-leak diagnostics, rollback/default-disable behavior, and migration checklist before it becomes default.

## First Implementation Slice

The first control-plane expansion slice should be `tmuxSnapshotCapture` because it is closest to the already-cut-over parser and has a narrow boundary:

```text
TypeScript caller -> Go tmux list-panes execution -> Go snapshot parse -> compact snapshot result
```

Acceptance for that first slice requires:

- no state writes from the tmux capture path.
- no pane lifecycle mutations from the capture path.
- timeout and tmux-unavailable diagnostics that do not leak raw stdout/stderr, cwd, stack traces, mailbox bodies, report bodies, or worker transcripts.
- parity with the existing `TMUX_PANE_SNAPSHOT_FORMAT` output shape.
- explicit unsupported-platform and missing-helper fail-closed behavior.
- a rollback/default-disable mode that does not reintroduce hidden parser fallback ambiguity.

## Migration Order

The staged order is:

1. v0.6.49 architecture gate and guardable migration contract.
2. Go-owned tmux snapshot capture.
3. Go-owned worker lifecycle primitives with TypeScript tool governance still calling them.
4. Go-owned state repository behind compatibility tests and temp-home migration proofs.
5. Go-owned task/report/PlanRun transitions behind leader-governance characterization tests.
6. Go-owned `/team` view-model generation with TypeScript TUI shell still rendering.
7. package/release verification helpers; actual version/tag/npm/release remains separately approved.

Any step may stop and remain partially migrated if validation fails.

## Release And Package Governance

This decision does not authorize:

- `npm version`.
- `npm publish`.
- creating or pushing tags.
- GitHub releases or release assets.
- second-platform support.
- signing as a release gate.
- package-manager native delivery outside the already-approved main-package embedded helper layout.

Those actions require a separate release-governance task and user approval.

## Consequences

The architecture is no longer “Go parser-only forever.” Future implementation can move real control-plane internals into Go. The cost is that each move must now carry stronger compatibility, no-leak, lifecycle, and governance tests because a Go bug can affect visible teammates, local state, task governance, or operator UX.

ADR 0001 and ADR 0002 remain useful historical records for why the project started with bounded helpers. ADR 0003 is the active direction for post-v0.6.49 expansion.
