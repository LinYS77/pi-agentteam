const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const CHECKLIST = 'docs/perf/v0.4.17-kernel-release-checklist.md'

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

module.exports = {
  name: 'Go kernel v0.4.17 release checklist',
  async run(env) {
    const root = env.helpers.extRoot
    const checklist = read(root, CHECKLIST)
    const readme = read(root, 'README.md')
    const plan = read(root, 'docs/agentteam方案书.md')
    const freeze = read(root, 'docs/perf/v0.4.17-kernel-contract-hardening.md')
    const packageJson = JSON.parse(read(root, 'package.json'))

    for (const expected of [
      'Slice 0 contract freeze',
      'Slice 1 JSON-RPC corpus',
      'Slice 2 compatibility matrix',
      'Slice 3 tmux parser corpus',
      'Slice 4 read-model corpus',
      'Slice 5 fallback/fail-closed policy',
      'Slice 6 boundary guardrails',
      'docs/perf/v0.4.17-kernel-contract-hardening.md',
      'tests/suites/go-kernel-contract-freeze-docs.cjs',
      'tests/fixtures/kernel/jsonrpc/protocolCases.cjs',
      'tests/suites/go-kernel-protocol-contract.cjs',
      'tests/suites/go-kernel-compatibility-matrix.cjs',
      'tests/fixtures/kernel/tmux/snapshotCases.cjs',
      'tests/suites/go-kernel-tmux-snapshot-parser.cjs',
      'tests/fixtures/kernel/read-model/panelCases.cjs',
      'tests/suites/go-kernel-read-model-shadow.cjs',
      'tests/suites/go-kernel-fallback-policy.cjs',
      'tests/suites/go-kernel-boundary-guardrails.cjs',
      'core/readModelFingerprint.ts',
      'core/kernel.ts',
      'kernel/go/agentteam-kernel/main.go',
      'tmux/snapshot.ts',
    ]) {
      assert.ok(checklist.includes(expected), `checklist should reference ${expected}`)
    }

    for (const command of [
      'node tests/run.cjs',
      'npm run typecheck',
      'npm run -s check:boundaries',
      'git diff --check',
      'npm run --silent bench:state-read-model',
      'npm run --silent bench:team-panel-tmux',
      'AGENTTEAM_BENCH_FIXTURE=stress',
      'PI_AGENTTEAM_KERNEL=go AGENTTEAM_BENCH_ITERATIONS=1',
      'PI_AGENTTEAM_KERNEL_HELPER="$helper"',
      'GO111MODULE=off go run .',
      'GO111MODULE=off go test .',
      'package/native config sanity passed',
      'grep -R -n',
    ]) {
      assert.ok(checklist.includes(command), `checklist should include reviewer command: ${command}`)
    }

    for (const smoke of [
      '"method":"health"',
      '"method":"tmuxSnapshotParse"',
      '"method":"compactReadModelFingerprint"',
      'protocolVersion:1',
      'helperVersion:"0.3.0-read-model-shadow"',
      'businessPathsConnected:false',
      'readOnly:true',
      'fullTextIncluded:false',
      'stateFilesRead:false',
      'stateFilesWritten:false',
    ]) {
      assert.ok(checklist.includes(smoke), `checklist should document smoke signal ${smoke}`)
    }

    for (const outcome of [
      'Review Outcome Template',
      'Checkpoint: v0.4.17 Kernel Contract & Parity Corpus Hardening',
      'Package version: unchanged 0.6.8',
      'Release mechanics: no npm version, no npm publish, no commit/tag/push performed',
      'Native packaging: none; no go.mod/go.sum/lifecycle hooks/native artifacts',
      'Go posture: optional/source-only/read-only/non-authoritative; not default and not required',
      'Runtime UI: unchanged; no /team kernel diagnostics or fallbackKind exposure',
      'Runtime authority: TypeScript-owned state/repository/tmux/governance/full-text boundaries unchanged',
      'Decision: <accept checklist / request follow-up>',
    ]) {
      assert.ok(checklist.includes(outcome), `checklist should include outcome template field: ${outcome}`)
    }

    for (const boundary of [
      'Do not run `npm version` or `npm publish`.',
      'Do not commit, tag, or push as part of this checklist.',
      'Do not change `package.json` version; it stays `0.6.8`.',
      'Do not package `kernel/`, add native binaries, add `go.mod`/`go.sum`, or add lifecycle build/download hooks.',
      'Do not make Go default, required, authoritative, or a runtime `/team` diagnostics source.',
      'Do not connect Go to state writes, repository authority, runtime UI, task/report/PlanRun governance, tmux execution/spawn/lifecycle, or mailbox/report full-text boundaries.',
      'Do not treat p95 timings as a hard release gate in this checklist',
    ]) {
      assert.ok(checklist.includes(boundary), `checklist should state boundary: ${boundary}`)
    }

    for (const forbiddenPhrase of [
      'Go is default',
      'Go remains default',
      'Go is authoritative',
      'Go remains authoritative',
      'Go is required',
      'package native binary',
      'run `npm version` to release',
      'run `npm publish` to release',
      'p95 hard gate required',
    ]) {
      assert.equal(checklist.includes(forbiddenPhrase), false, `checklist must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assert.ok(readme.includes(CHECKLIST), 'README should link v0.4.17 release checklist')
    assert.ok(plan.includes(CHECKLIST), 'plan should link v0.4.17 release checklist')
    assert.ok(freeze.includes(CHECKLIST), 'contract hardening doc should link v0.4.17 release checklist')
    assert.equal(packageJson.version, '0.6.8', 'package version must remain unchanged')
    assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'kernel source must not be packaged')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
  },
}
