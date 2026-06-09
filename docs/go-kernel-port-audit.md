# Go Kernel Slice 0 Port Audit

> Date: 2026-06-09
> Scope: documentation-only audit of existing TypeScript seams. No Go code is implemented by this audit.

## Summary

AgentTeam already has explicit TypeScript seams that can host a future replaceable kernel without moving the pi-facing control plane. The current safest strategy is to keep ports TypeScript-owned, keep the file-backed implementation as the canonical fallback, and add a native helper only for compact deterministic transformations that profiling proves expensive.

## Current Port Inventory

| Area | Current seam | Current implementation | Kernel eligibility | Boundary notes |
| --- | --- | --- | --- | --- |
| Team/task mutation | `app/ports.ts` `TeamStatePort`, `TaskMutationPort`, `StateRepositoryPort.writeTeamMutation` | `adapters/runtime/appStatePorts.ts`, `state/repository.ts`, `state/teamStore.ts`, `state/taskStore.ts` | Not Slice 1 eligible | Governance-sensitive. Keep TypeScript reducer/application logic authoritative; kernel must not decide task status, owner, block/close/report semantics, or PlanRun transitions. |
| Task history/report queries | `TaskHistoryQueryPort`, `readTaskReportSummary`, `readReportWatchdogSummary` | `state/taskHistoryReadModel.ts`, `state/taskReportWatchdogReadModel.ts`, `state/repository.ts` | Partially eligible for compact summaries only | Full report body remains behind `agentteam_task action=report`. Kernel may derive compact counts/summaries from an authorized snapshot but must not expose `TaskReport.text`. |
| Mailbox reads | `MailboxRepositoryPort`, `readLeaderMailboxProjection` | `adapters/runtime/mailboxPorts.ts`, `state/mailboxStore.ts`, `state/panelProjectionStore.ts` | Projection-only candidate | `agentteam_receive` remains the only mailbox full-text/read boundary. Kernel must not mark delivered/read or return `MailboxMessage.text` in panel/read-model paths. |
| Panel read model | `StateRepositoryPort.readTeamPanelModel`, `RepositoryTeamPanelModel` | `state/repository.ts`, `teamPanel/dataSource.ts`, `teamPanel/viewModel.ts` | Strong candidate after profiling | Eligible for compact projection, sorting, counts, and fingerprint/diff. Must preserve `/team` as read-mostly cockpit and avoid full mailbox/report bodies. |
| PlanRun projection | `PlanRunRepositoryPort`, `PlanRunMutationPort`, compact run projections | `app/planRunApplication.ts`, `state/runVisibilityReadModel.ts`, `state/repository.ts` | Projection-only candidate | `approve`, `advance`, `pause/resume/cancel`, `signal_failure`, `check_limits`, and close/review semantics stay TypeScript control-plane decisions. Kernel may only compute compact visibility projections. |
| Runtime/tmux snapshot | `RuntimeRepositoryPort`, `RuntimeRepositorySnapshot`, `tmux/snapshot.ts` | `adapters/runtime/session.ts`, `adapters/tmux/`, `tmux/client.ts`, `tmux/snapshot.ts` | Candidate for parsing/indexing only | TypeScript owns tmux subprocess calls, pane creation, labels, and reconcile policy. Kernel may parse/index `list-panes` output but must not hide panes or spawn workers. |
| Outbox/effects | `OutboxStorePort`, `OutboxRunnerPort`, effect handlers | `adapters/runtime/outboxStorePort.ts`, `app/outbox.ts`, `app/effectRunner.ts`, `runtime/` | Not initial candidate | Effects encode delivery/attention governance. Keep TypeScript-owned for auditability and leader-gated behavior. |
| Config/bootstrap | `config.ts`, role discovery surfaces, panel config projection | `config.ts`, `agents.ts`, `state/repository.ts` | Low priority | Config is small and user-facing. Keep TypeScript-owned; kernel must not write runtime config or alter future-spawn-only semantics. |
| State I/O | `state/fsStore.ts` profiling, focused stores under `state/` | file-backed JSON with locks and atomic writes | Maybe later, behind repository seam | Native storage is out of Slice 0. Any future kernel must preserve legacy layout compatibility, quarantine rules, compact/full-text boundaries, and TypeScript fallback. |

## Candidate Contract Shape

Future Go kernel calls should be shaped as pure request/response helpers controlled by TypeScript:

```text
TypeScript control plane
  validates feature/config/version
  reads authorized local state or tmux snapshot
  calls optional kernel with compact input
  validates compact output
  falls back to TypeScript implementation on any failure
```

Allowed data classes:

- Compact task/member/mailbox/report metadata already used by `/team` and leader digest surfaces.
- Tmux `list-panes` text captured by TypeScript and parsed into pane ids, targets, labels, and current command.
- Derived counters, summaries, stable sort keys, fingerprints, and profiling/debug timings.

Disallowed data classes:

- Full `MailboxMessage.text` except through TypeScript-owned `agentteam_receive`.
- Full `TaskReport.text` except through TypeScript-owned report retrieval.
- Raw worker prompts, provider transcripts, hidden terminal input, or unpublished scheduler state.
- Destructive migration instructions for legacy team storage.

## Slice 0 Recommendation

For Slice 0, record the decision and keep all implementation in TypeScript. The first later implementation candidate should be a dual-run or shadow-compare compact panel projection/fingerprint helper because it is deterministic, benchmarked, read-only, and naturally replaceable. Go should not be introduced until the TypeScript contract, fallback path, characterization fixtures, and failure tests are in place.
