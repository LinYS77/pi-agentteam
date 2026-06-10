# Decision Record 0002: Module-Owned Go Kernel Cutover

> Status: accepted for planning; implementation deferred.
> Date: 2026-06-09
> Scope: v0.4.18 cutover strategy and fallback deletion record only.

## Context

v0.4.16 and v0.4.17 established the Go kernel as an optional, source-only helper behind TypeScript ports. That helper/fallback posture was migration scaffolding: it allowed parity characterization, shadow runs, fallback vocabulary, and compatibility checks without changing the TypeScript/pi control plane or npm release behavior.

v0.4.18 changes the planning question from "can a replaceable helper exist safely?" to "which bounded module may become Go-owned, what gate proves it is ready, and how do we delete the TypeScript runtime fallback after cutover?" The target is not a whole-product rewrite. It is a per-module cutover policy for narrow, measured seams where TypeScript can remain the control plane while Go owns the selected module runtime after an explicit gate.

## Decision

AgentTeam will treat optional TypeScript/Go fallback as transitional migration tooling, not a permanent runtime architecture. A future module may become Go-owned only after it passes an explicit cutover gate and has a documented fallback deletion and release rollback plan.

The lifecycle for each candidate module is defined by the per-module checklist in `docs/perf/v0.4.18-go-module-cutover-checklist.md`, the fail-closed diagnostics contract in `docs/perf/v0.4.18-go-cutover-fail-closed-diagnostics.md`, and the v0.4.19 runtime prerequisite matrix in `docs/perf/v0.4.19-go-runtime-prerequisites.md`:

1. Migration parity/shadow: TypeScript remains the active runtime. Go may run in disabled, explicit, benchmark, smoke, or shadow contexts to prove equivalent output and characterize failure modes.
2. Cutover gate: reviewers confirm parity corpus PASS, focused smoke/bench PASS, protocol/version compatibility, runtime prerequisite signoff, packaging prerequisites when applicable, fail-closed diagnostics, fallback deletion steps, and release rollback instructions.
3. Go-owned runtime: TypeScript/pi still invokes the module through the stable port, but Go is the only runtime implementation for that module in the shipped path.
4. TypeScript runtime fallback deletion: the old TypeScript implementation is removed from runtime fallback paths instead of being kept as a hidden alternate production implementation.
5. Release rollback: if the Go-owned module is wrong after release, rollback happens by reverting to a prior GitHub tag/npm version or publishing a corrected release, not by silently re-enabling the deleted TypeScript fallback.

## Module-Level Go Ownership

Module-level Go ownership means a bounded module's runtime implementation is owned by Go after cutover while the product control plane remains TypeScript/pi.

TypeScript remains responsible for:

- pi extension loading, commands, tools, hooks, role prompts, and public schemas.
- teammate tmux session/pane lifecycle and visible worker process ownership.
- leader-gated task/report governance, PlanRun control, assignment routing, and user-facing diagnostics.
- repository layout, package metadata, npm release controls, and compatibility orchestration.
- full-text boundaries such as `agentteam_receive` mailbox reads and `agentteam_task action=report` TaskReport reads.

Go ownership is limited to the selected module's deterministic runtime computation behind an explicit TypeScript port. For example, a parser module may own parsing of TypeScript-captured stdout, but it must not execute tmux, mutate state, own governance, spawn workers, or become a daemon/control plane.

## Fallback and Failure Policy

Fail-open behavior is allowed only before cutover and only for migration safety in read-only/parser-style seams. Pre-cutover fallback may protect parity exploration, shadow reporting, benchmark characterization, and optional-helper smokes while TypeScript remains authoritative.

After cutover, missing, disabled, incompatible, malformed, or timed-out Go runtime dependencies must fail closed for that module. The diagnostic must be explicit enough for operators and release reviewers to distinguish configuration/version/runtime failure from business logic output, following `docs/perf/v0.4.18-go-cutover-fail-closed-diagnostics.md`. Post-cutover code must not silently fall back to the old TypeScript runtime path.

## Release Rollback

Release rollback is a release-management action, not a hidden runtime behavior. The rollback path for a bad Go-owned module is to restore a known-good GitHub tag/npm version or publish a corrected npm version with a documented fix. Keeping a dormant TypeScript production fallback after cutover would hide failures, expand the runtime matrix, and undermine parity/fail-closed guarantees.

## Non-Goals

This decision does not approve or implement:

- a whole-product Go rewrite.
- a Go control plane, daemon, scheduler, worker lifecycle owner, or tmux process manager.
- movement of state writes, repository writes, sidecar/outbox writes, task/report governance, PlanRun authority, mailbox/report full-text boundaries, or `/team` authority into Go.
- npm version changes, `npm version`, `npm publish`, GitHub tagging, committing, or release publication.
- default Go runtime approval without `docs/perf/v0.4.19-go-runtime-prerequisites.md` signoff.
- native binary packaging, package manager lifecycle hooks, `go.mod`, `go.sum`, or checked-in native artifacts.
- runtime behavior changes in v0.4.18 Slice A.

## Consequences

This keeps v0.4.16/v0.4.17 optional-helper work useful as migration evidence while preventing permanent dual-runtime ambiguity. Future Go work must choose narrow modules, prove readiness with `docs/perf/v0.4.18-go-module-cutover-checklist.md`, obtain runtime prerequisite signoff through `docs/perf/v0.4.19-go-runtime-prerequisites.md` before any shipped/default cutover, delete the TypeScript runtime fallback only after that signoff, fail closed when the Go-owned module cannot run, and rely on normal release rollback instead of hidden production fallback paths.
