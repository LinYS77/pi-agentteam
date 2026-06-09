# Go Kernel Parity Scaffolding

> Scope: Slice 1 benchmark/test scaffolding, Slice 2 source-only helper skeleton, Slice 3 optional tmux snapshot parsing/indexing, Slice 4 read-only compact read-model shadow parity, Slice 5 benchmark-only shadow reporting, Slice 6 helper failure hardening, and Slice 7 perf checkpoint summary. No packaged native binary, package version change, `npm version`, or `npm publish` is part of these slices.

v0.4.17 Slice 0 freezes the current v0.4.16 optional-helper contract before adding any broader parity corpus; see `docs/perf/v0.4.17-kernel-contract-hardening.md` for the protocol facts, compatibility rules, fallback vocabulary, source-only posture, and release constraints.

## Benchmark Metadata

State/read-model and panel/tmux benchmarks now include compact implementation metadata in their JSON output:

```json
{
  "implementation": "typescript",
  "kernel": {
    "requestedMode": "typescript",
    "mode": "typescript",
    "enabled": false,
    "calls": 0,
    "fallbacks": 0,
    "requestedKnownKernel": true,
    "protocolVersion": 1,
    "adapterVersion": "0.3.0-read-model-shadow",
    "helperVersion": "0.3.0-read-model-shadow",
    "capabilities": ["health", "profile", "tmuxSnapshotParse", "compactReadModelFingerprint"],
    "businessPathsConnected": false
  },
  "fixtureProfile": {
    "name": "baseline",
    "stress": false
  }
}
```

Current benchmark behavior is TypeScript-only. If `PI_AGENTTEAM_KERNEL=go` is set without a connected helper path, the benchmark still runs the TypeScript fallback and reports `implementation: "typescript"`, `kernel.mode: "typescript"`, `kernel.enabled: false`, `kernel.calls: 0`, and a fallback reason. This makes future kernel-on output comparable without changing the default path.

## Fixture Profiles

The existing baseline fixtures remain the default and preserve the previous benchmark assertions, sentinel leak checks, compact/read-only boundaries, and tmux command expectations.

Optional stress fixtures are available through:

```bash
AGENTTEAM_BENCH_FIXTURE=stress npm run bench:state-read-model
AGENTTEAM_BENCH_FIXTURE=stress npm run bench:team-panel-tmux
```

The stress profile records scalability shape only. It does not create a release-target pass/fail claim unless a later release gate explicitly defines thresholds.

## Slice 2 Source-Only Helper Skeleton

Slice 2 adds a source-only Go helper under `kernel/go/agentteam-kernel/` and a pure TypeScript adapter under `core/kernel.ts`. The helper speaks newline-delimited JSON-RPC-style stdio requests and currently supports:

- `health`: returns protocol/helper version, capabilities, implementation, and `businessPathsConnected: false`.
- `profile`: echoes skeleton-only profile metadata and confirms state/panel/task-report/PlanRun paths are not connected.
- `tmuxSnapshotParse`: parses/indexes TypeScript-captured tmux snapshot text only.
- `compactReadModelFingerprint`: computes a read-only compact projection/fingerprint from TypeScript-supplied compact input only.

Manual helper smoke, when the Go toolchain is installed:

```bash
printf '{"jsonrpc":"2.0","id":"health-1","method":"health"}\n' \
  | (cd kernel/go/agentteam-kernel && GO111MODULE=off go run .)

printf '{"jsonrpc":"2.0","id":"profile-1","method":"profile","params":{"fixture":"tiny"}}\n' \
  | (cd kernel/go/agentteam-kernel && GO111MODULE=off go run .)
```

The TypeScript adapter models `disabled`, `typescript`, `go`, and `auto` modes. Default/empty mode is `disabled` and resolves to TypeScript fallback behavior. If `PI_AGENTTEAM_KERNEL=go` is requested without `PI_AGENTTEAM_KERNEL_HELPER` pointing at an available helper executable, the adapter records fallback metadata and continues the TypeScript path.

The skeleton is deliberately not connected to state, panel, task, report, or PlanRun runtime paths. Slice 3 adds one narrow tmux seam: TypeScript still captures `tmux list-panes -a -F` output and owns tmux subprocess calls, spawn, pane lifecycle, light/force reconcile policy, and force reconcile paths; only parsing/indexing of already-captured snapshot text may use the optional Go helper.

## Slice 3 Tmux Snapshot Parser

Slice 3 extends the helper with `tmuxSnapshotParse`. The request accepts TypeScript-captured stdout using `TMUX_PANE_SNAPSHOT_FORMAT` semantics:

```json
{
  "jsonrpc": "2.0",
  "id": "snapshot-1",
  "method": "tmuxSnapshotParse",
  "params": {
    "stdout": "%1\tsession:@1\tagentteam worker\tpi\n",
    "capturedAt": 1700000000000
  }
}
```

The response is compatible with the TypeScript `TmuxSnapshot` shape: `capturedAt`, ordered `panes`, `byPaneId`, and `ok: true`. Malformed rows, empty rows, and rows without pane ids are skipped; duplicate pane ids keep first-seen order and last row values, matching the TypeScript parser.

Manual helper smoke:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":"snapshot-1","method":"tmuxSnapshotParse","params":{"stdout":"%1\tsession:@1\tagentteam worker\tpi\n%2\tsession:@1\t\tbash\n","capturedAt":1700000000000}}' \
  | (cd kernel/go/agentteam-kernel && GO111MODULE=off go run .)
```

Runtime/fallback rules:

- Default/empty mode remains TypeScript fallback.
- `PI_AGENTTEAM_KERNEL=go` uses Go parsing only when `PI_AGENTTEAM_KERNEL_HELPER` points to an available helper executable.
- Any helper failure, timeout, JSON-RPC error, or incompatible response shape falls back to the existing TypeScript parser.
- Go does not execute tmux, spawn panes, inspect pane lifecycle, choose light/force reconcile behavior, or touch task/report/PlanRun governance/full-text boundaries.

## Slice 4 Read-Model Shadow Parity

Slice 4 adds `compactReadModelFingerprint` for shadow/parity comparison only. TypeScript remains authoritative for repository and `/team` output. The TypeScript adapter first builds/sanitizes compact input with the TypeScript projection helper, then optionally sends only that compact object to the helper.

Manual helper smoke:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":"read-model-1","method":"compactReadModelFingerprint","params":{"input":{"mode":"attached","team":{"name":"demo","leaderCwd":"/tmp/demo"},"members":[],"tasks":[],"mailbox":[]}}}' \
  | (cd kernel/go/agentteam-kernel && GO111MODULE=off go run .)
```

Shadow/parity constraints:

- Go receives only TypeScript-supplied compact input; it does not read `team.json`, inboxes, reports, sidecars, indexes, or `PI_AGENTTEAM_HOME`.
- Go returns only `projection`, `fingerprint`, and read-only diagnostics; it does not write state, sidecars, indexes, caches, or migration files.
- Full mailbox/report bodies are stripped before helper calls and must not appear in helper responses or compact outputs.
- This method is non-authoritative: `/team`, repository, task/report/PlanRun governance, and full-text boundaries still use TypeScript-owned paths.
- Default/empty mode remains TypeScript fallback; `PI_AGENTTEAM_KERNEL=go` plus `PI_AGENTTEAM_KERNEL_HELPER` is required for helper-backed shadow comparison.

## Slice 5 Benchmark-Only Shadow Reporting

Slice 5 adds an optional `shadow` section to `npm run bench:state-read-model` only when `PI_AGENTTEAM_KERNEL=go` or `PI_AGENTTEAM_KERNEL=auto` is requested. Default benchmark runs omit `shadow` and remain TypeScript-only.

Shadow smoke without a helper records fallback diagnostics:

```bash
PI_AGENTTEAM_KERNEL=go AGENTTEAM_BENCH_ITERATIONS=1 npm run bench:state-read-model \
  > /tmp/agentteam-state-shadow-fallback.json
```

Shadow smoke with a locally built source-only helper:

```bash
helper="$(mktemp /tmp/agentteam-kernel.XXXXXX)"
(cd kernel/go/agentteam-kernel && GO111MODULE=off go build -o "$helper" .)
PI_AGENTTEAM_KERNEL=go PI_AGENTTEAM_KERNEL_HELPER="$helper" AGENTTEAM_BENCH_ITERATIONS=1 npm run bench:state-read-model \
  > /tmp/agentteam-state-shadow-go.json
rm -f "$helper"
```

The `shadow` section is diagnostic only and includes compact fields such as `requested`, `enabled`, `calls`, `fallbacks`, `parityMatched`, hash-shortened `tsFingerprint`/`kernelFingerprint`, `elapsedMs`, read-only flags, and optional `fallbackReason`. It does not affect benchmark pass/fail semantics, runtime `/team` output, repository behavior, or sidecar writes.

Shadow input is built from TypeScript-owned compact panel data and sanitized again by the adapter before any helper call. Full mailbox/report bodies must not appear in shadow input, helper output, or benchmark JSON.

## Slice 6 Failure/Fallback Diagnostics

Slice 6 hardens the optional helper route before any write-side or authoritative integration. The adapter remains TypeScript-authoritative and disables helper use after the first runtime helper failure on an adapter instance. Later calls on that adapter continue through TypeScript fallback without spawning the helper again.

Kernel metadata may include compact diagnostics:

- `fallbackKind`: stable classifier for tests and dashboards.
- `fallbackReason`: short human-readable explanation ending in TypeScript fallback.
- `calls`: helper subprocess attempts, including the health preflight when a helper is available.
- `fallbacks`: one startup or runtime fallback per adapter instance.

Current `fallbackKind` values are `unsupported-mode`, `missing-helper`, `helper-timeout`, `helper-spawn-error`, `helper-nonzero-exit`, `helper-empty-response`, `helper-malformed-json`, `helper-jsonrpc-error`, `helper-incompatible-response`, `helper-unsupported-protocol`, `helper-unsupported-version`, and `helper-unsupported-capability`.

Diagnostics intentionally avoid stdout/stderr bodies, full helper paths, repository paths, full mailbox/report text, and sidecar contents. Helper metadata exposes only a compact helper basename while helper subprocesses receive a narrow environment, not `PI_AGENTTEAM_HOME`.

Read-only shadow outputs must continue to report `readOnly=true`, `fullTextIncluded=false`, `stateFilesRead=false`, and `stateFilesWritten=false`.

## Slice 7 Perf Checkpoint

Slice 7 organizes Slice 0-6 into a GitHub-only reviewer checklist at `docs/perf/go-kernel-slice7-checkpoint.md`. That checkpoint summarizes artifacts, exact reviewer commands, expected compact `shadow` fields, `fallbackKind` vocabulary, package/native sanity checks, and non-runtime boundaries.

The checkpoint is for benchmark/perf release review only. It does not expose kernel diagnostics in `/team`, does not make Go default or authoritative, and does not define a p95 release hard gate unless a later release checklist explicitly adds thresholds.

## Future Go Parity Runs

When a future approved slice connects more optional Go kernel/helper parity paths, runs should compare TypeScript fallback and Go-kernel output on the same machine and fixture profile:

```bash
PI_AGENTTEAM_KERNEL=typescript npm run bench:state-read-model > /tmp/agentteam-state-ts.json
PI_AGENTTEAM_KERNEL=go npm run bench:state-read-model > /tmp/agentteam-state-go.json

PI_AGENTTEAM_KERNEL=typescript npm run bench:team-panel-tmux > /tmp/agentteam-panel-ts.json
PI_AGENTTEAM_KERNEL=go npm run bench:team-panel-tmux > /tmp/agentteam-panel-go.json
```

For stress shape comparisons, add the same fixture profile to both commands:

```bash
AGENTTEAM_BENCH_FIXTURE=stress PI_AGENTTEAM_KERNEL=typescript npm run bench:state-read-model > /tmp/agentteam-state-stress-ts.json
AGENTTEAM_BENCH_FIXTURE=stress PI_AGENTTEAM_KERNEL=go npm run bench:state-read-model > /tmp/agentteam-state-stress-go.json
```

Comparison rules:

- Compare only matching `name`, `fixture`, `fixtureProfile`, and `iterations` values.
- Require compact output equivalence before interpreting timings: no full-body sentinel leaks, same fixture sizes, same compact/read-only boundaries, and same governance/full-text restrictions.
- Treat `kernel.calls`, `kernel.fallbacks`, and fallback reasons as correctness diagnostics; a partial fallback run is not a pure Go-kernel performance claim.
- Keep TypeScript fallback as the compatibility baseline and default implementation.
- Preserve visible tmux panes, leader-gated governance, explicit `agentteam_receive` and TaskReport full-text boundaries, explicit PlanRun progression, no hidden scheduler/autopilot, no worker-spawns-worker, and legacy state compatibility.
