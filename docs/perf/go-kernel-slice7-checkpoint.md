# Go Kernel Slice 7 Perf Checkpoint

> Scope: GitHub-only review checkpoint for the optional Go kernel route through Slice 6. This is not an npm release, not runtime UI, not a p95 release hard gate, and not an instruction to run `npm version`, `npm publish`, commit, tag, or package a native binary.

Follow-on v0.4.17 Slice 0 contract-freeze inventory lives at `docs/perf/v0.4.17-kernel-contract-hardening.md`; it records the current v0.4.16 facts without changing this checkpoint into an npm release or runtime-UI guide.

## Executive Summary

Slice 0-6 establish a reviewable optional Go helper path for compact benchmark/perf diagnostics only. TypeScript remains the mandatory pi/npm control plane and the authoritative runtime implementation.

The checkpoint proves these properties:

- Default benches and runtime behavior remain TypeScript-only.
- `PI_AGENTTEAM_KERNEL=go` is explicit opt-in and falls back to TypeScript when the helper is missing, incompatible, slow, crashed, malformed, or disabled after first failure.
- Go helper calls are read-only and receive only TypeScript-sanitized compact inputs.
- Shadow diagnostics are benchmark/perf JSON only; they are not rendered in `/team` and do not alter repository state, sidecars, task/report governance, PlanRun behavior, mailbox/report full-text boundaries, pane lifecycle, or npm/package control.
- Native packaging remains absent: no packaged binary, no `go.mod`, no `go.sum`, no lifecycle download/build hooks.

## Slice Map

| Slice | Artifact | Review Focus |
| --- | --- | --- |
| Slice 0 | `docs/decisions/0001-replaceable-go-kernel.md`, `docs/go-kernel-port-audit.md` | Accepted boundary: replaceable optional helper only; TypeScript/pi facade stays mandatory. |
| Slice 1 | `tests/bench/kernelMetadata.cjs`, `tests/bench/team-read-model-baseline.cjs`, `tests/bench/team-panel-tmux-refresh-v0415.cjs` | Benchmark metadata records `implementation`, `kernel`, and `fixtureProfile` without changing default behavior. |
| Slice 2 | `core/kernel.ts`, `kernel/go/agentteam-kernel/main.go`, `tests/suites/go-kernel-skeleton.cjs` | Source-only helper skeleton and TypeScript adapter modes `disabled`, `typescript`, `go`, `auto`. |
| Slice 3 | `tmux/snapshot.ts`, `tests/suites/go-kernel-tmux-snapshot-parser.cjs` | Optional helper parses TypeScript-captured tmux snapshot text only; TypeScript still owns tmux subprocesses and pane lifecycle. |
| Slice 4 | `core/readModelFingerprint.ts`, `teamPanel/fingerprint.ts`, `tests/suites/go-kernel-read-model-shadow.cjs` | Read-only compact projection/fingerprint parity with full-text stripping and no repository authority. |
| Slice 5 | `tests/bench/team-read-model-baseline.cjs`, `tests/suites/zzzzzzzzzzzzz-read-model-bench-v0414.cjs` | Optional `shadow` section in state/read-model bench only when `PI_AGENTTEAM_KERNEL=go` or `auto` is requested. |
| Slice 6 | `tests/suites/go-kernel-failure-hardening.cjs`, `core/kernel.ts` | Compact fallback diagnostics for timeout/crash/malformed output/JSON-RPC errors/incompatible helpers; helper disables after first runtime failure. |

## Reviewer Commands

Run from the repository root. These commands write JSON to `/tmp` and do not publish, install, tag, commit, or bump package versions.

### Default Benchmarks

```bash
npm run --silent bench:state-read-model \
  > /tmp/agentteam-slice7-state-default.json

npm run --silent bench:team-panel-tmux \
  > /tmp/agentteam-slice7-panel-default.json
```

Expected shape:

- `implementation: "typescript"`
- `kernel.mode: "typescript"`
- `kernel.enabled: false`
- `kernel.calls: 0`
- `kernel.fallbacks: 0`
- no `shadow` section in the default state/read-model bench
- no `fallbackKind` in default kernel metadata

### Stress Benchmarks

```bash
AGENTTEAM_BENCH_FIXTURE=stress npm run --silent bench:state-read-model \
  > /tmp/agentteam-slice7-state-stress-default.json

AGENTTEAM_BENCH_FIXTURE=stress npm run --silent bench:team-panel-tmux \
  > /tmp/agentteam-slice7-panel-stress-default.json
```

Stress fixtures record scalability shape only. They are not release p95 pass/fail gates unless a later release checklist explicitly defines thresholds.

### Go Requested, Missing Helper Fallback

```bash
PI_AGENTTEAM_KERNEL=go AGENTTEAM_BENCH_ITERATIONS=1 npm run --silent bench:state-read-model \
  > /tmp/agentteam-slice7-state-go-fallback.json
```

Expected `shadow` shape:

- `requested: "go"`
- `enabled: false`
- `calls: 0`
- `fallbacks: 1`
- `fallbackKind: "missing-helper"`
- `parityMatched: true`
- `readOnly: true`
- `fullTextIncluded: false`
- `stateFilesRead: false`
- `stateFilesWritten: false`

### Optional Helper-Built Shadow Bench

Requires local Go toolchain. The helper binary is a temporary file under `/tmp` and must not be committed, packaged, or installed by npm lifecycle scripts.

```bash
helper="$(mktemp /tmp/agentteam-kernel.XXXXXX)"
(cd kernel/go/agentteam-kernel && GO111MODULE=off go build -o "$helper" .)
PI_AGENTTEAM_KERNEL=go PI_AGENTTEAM_KERNEL_HELPER="$helper" AGENTTEAM_BENCH_ITERATIONS=1 npm run --silent bench:state-read-model \
  > /tmp/agentteam-slice7-state-go-helper.json
rm -f "$helper"
```

Expected `shadow` shape:

- `requested: "go"`
- `enabled: true`
- `calls: 2` for the first read-model shadow call (`health` preflight + method)
- `fallbacks: 0`
- no `fallbackKind`
- `parityMatched: true`
- matching hash-shortened `tsFingerprint` and `kernelFingerprint`
- `readOnly: true`, `fullTextIncluded: false`, `stateFilesRead: false`, `stateFilesWritten: false`

### Go Helper Smoke

```bash
printf '{"jsonrpc":"2.0","id":"health-1","method":"health"}\n' \
  | (cd kernel/go/agentteam-kernel && GO111MODULE=off go run .)

printf '%s\n' '{"jsonrpc":"2.0","id":"snapshot-1","method":"tmuxSnapshotParse","params":{"stdout":"%1\tsession:@1\tagentteam worker\tpi\n","capturedAt":1700000000000}}' \
  | (cd kernel/go/agentteam-kernel && GO111MODULE=off go run .)

printf '%s\n' '{"jsonrpc":"2.0","id":"read-model-1","method":"compactReadModelFingerprint","params":{"input":{"mode":"attached","team":{"name":"demo","leaderCwd":"/tmp/demo"},"members":[],"tasks":[],"mailbox":[]}}}' \
  | (cd kernel/go/agentteam-kernel && GO111MODULE=off go run .)
```

### Focused Tests and Safety Checks

```bash
node tests/run.cjs
npm run typecheck
npm run -s check:boundaries
(cd kernel/go/agentteam-kernel && GO111MODULE=off go test .)
git diff --check
```

Package/native sanity:

```bash
node - <<'NODE'
const fs = require('fs')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
if (pkg.version !== '0.6.8') throw new Error(`package version changed: ${pkg.version}`)
if ((pkg.files || []).some(item => item.includes('kernel'))) throw new Error('kernel should not be packaged')
for (const script of ['preinstall', 'install', 'postinstall', 'prepare']) {
  if (pkg.scripts && Object.prototype.hasOwnProperty.call(pkg.scripts, script)) throw new Error(`unexpected lifecycle ${script}`)
}
console.log(`package version ${pkg.version}; no kernel packaging/lifecycle`)
NODE

find . -maxdepth 5 \( -name 'go.mod' -o -name 'go.sum' -o -name '*.exe' -o -name '*.dll' -o -name '*.so' -o -name '*.dylib' \) -print
```

Boundary scans:

```bash
grep -R -n "os\.Open\|os\.ReadFile\|os\.WriteFile\|os\.Create\|PI_AGENTTEAM_HOME\|team\.json\|inboxes\|sidecar" kernel/go/agentteam-kernel || true

for rel in teamPanel/dataSource.ts state/repository.ts app/taskApplication.ts app/taskReportWorkflow.ts app/planRunApplication.ts; do
  grep -n "shadow\|compactReadModelFingerprint\|PI_AGENTTEAM_KERNEL" "$rel" || true
done
```

Expected result: no output from native artifact scan, forbidden Go helper file-I/O scan, or runtime path kernel-ref scan.

## Shadow Diagnostics

The benchmark-only `shadow` section appears only in `bench:state-read-model` when `PI_AGENTTEAM_KERNEL=go` or `PI_AGENTTEAM_KERNEL=auto` is explicitly requested. It is not a runtime UI surface and is not displayed by `/team`.

Compact fields:

- `requested`: normalized requested kernel mode.
- `enabled`: whether the adapter is currently helper-backed after preflight/failure checks.
- `calls`: helper subprocess attempts for this adapter; first successful helper-backed shadow run includes a health preflight.
- `fallbacks`: startup or runtime fallback count.
- `fallbackKind`: stable failure classifier when fallback occurred.
- `fallbackReason`: short human-readable explanation; it must not include full stdout/stderr bodies, full helper paths, repository paths, mailbox/report text, sidecars, or hidden state.
- `parityMatched`: whether TypeScript and helper fingerprints match.
- `tsFingerprint` / `kernelFingerprint`: hash-shortened fingerprints for comparison, not full read-model dumps.
- `elapsedMs`: shadow comparison elapsed time.
- `inputKind`, `readOnly`, `fullTextIncluded`, `stateFilesRead`, `stateFilesWritten`: compact boundary flags.

`fallbackKind` vocabulary:

```text
unsupported-mode
missing-helper
helper-timeout
helper-spawn-error
helper-nonzero-exit
helper-empty-response
helper-malformed-json
helper-jsonrpc-error
helper-incompatible-response
helper-unsupported-protocol
helper-unsupported-version
helper-unsupported-capability
```

Interpretation rules:

- Default benchmarks without `PI_AGENTTEAM_KERNEL=go|auto` are the compatibility baseline.
- A run with `fallbackKind` is not a pure Go-helper performance claim; use it to confirm safe fallback behavior.
- A helper-backed run is still benchmark-only shadow evidence, not runtime authority.
- `parityMatched: true` is required before comparing timings.
- Stress fixture results describe scalability shape only.
- p95 timing gates must be defined by an explicit release checklist; this checkpoint does not create a hard p95 release gate.

## Non-Runtime Boundaries

Slice 7 intentionally does not expose kernel diagnostics in runtime UI and does not make Go default or authoritative. `/team` remains TypeScript-owned compact cockpit output and must not read full mailbox/report bodies, mark mailbox delivered/read, or display helper fallback internals.

The Go helper still must not own:

- repository reads/writes, state migrations, sidecars, caches, or indexes;
- `team.json`, inbox files, report files, or `PI_AGENTTEAM_HOME` reads;
- tmux subprocess execution, pane creation, pane lifecycle, force reconcile, or worker spawn;
- task status/owner/block/close governance, TaskReport full text, PlanRun transitions, leader attention, worker delivery, or mailbox read boundaries;
- package versioning, npm publishing, install/postinstall behavior, or native packaging.

## Review Outcome Template

Use this template when summarizing a GitHub-only checkpoint review:

```text
Checkpoint: Go kernel Slice 0-7 perf/shadow review
Package version: unchanged 0.6.8
Native packaging: none
Default benches: TypeScript-only, no shadow
Go requested missing helper: safe fallback with fallbackKind=missing-helper
Go helper shadow: optional, read-only, parityMatched=true
Runtime UI: unchanged; no /team kernel diagnostics
Governance/full-text boundaries: TypeScript-owned
Open risks: <machine-specific timing variance, future helper version policy, etc.>
```
