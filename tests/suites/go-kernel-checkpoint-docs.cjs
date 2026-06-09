const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

module.exports = {
  name: 'Go kernel Slice 7 checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    const checkpoint = read(root, 'docs/perf/go-kernel-slice7-checkpoint.md')
    const parity = read(root, 'docs/perf/go-kernel-parity-scaffolding.md')
    const readme = read(root, 'README.md')
    const plan = read(root, 'docs/agentteam方案书.md')

    for (const expected of [
      'docs/decisions/0001-replaceable-go-kernel.md',
      'docs/go-kernel-port-audit.md',
      'tests/bench/kernelMetadata.cjs',
      'core/kernel.ts',
      'kernel/go/agentteam-kernel/main.go',
      'tmux/snapshot.ts',
      'core/readModelFingerprint.ts',
      'tests/suites/go-kernel-failure-hardening.cjs',
      'tests/suites/go-kernel-read-model-shadow.cjs',
      'tests/suites/go-kernel-tmux-snapshot-parser.cjs',
    ]) {
      assert.ok(checkpoint.includes(expected), `checkpoint should reference ${expected}`)
    }

    for (const command of [
      'npm run --silent bench:state-read-model',
      'npm run --silent bench:team-panel-tmux',
      'AGENTTEAM_BENCH_FIXTURE=stress',
      'PI_AGENTTEAM_KERNEL=go AGENTTEAM_BENCH_ITERATIONS=1',
      'PI_AGENTTEAM_KERNEL_HELPER="$helper"',
      'GO111MODULE=off go run .',
      'npm run typecheck',
      'npm run -s check:boundaries',
      'git diff --check',
    ]) {
      assert.ok(checkpoint.includes(command), `checkpoint should include reviewer command: ${command}`)
    }

    for (const field of [
      'requested',
      'enabled',
      'calls',
      'fallbacks',
      'fallbackKind',
      'fallbackReason',
      'parityMatched',
      'tsFingerprint',
      'kernelFingerprint',
      'readOnly',
      'fullTextIncluded',
      'stateFilesRead',
      'stateFilesWritten',
    ]) {
      assert.ok(checkpoint.includes(field), `checkpoint should document shadow field ${field}`)
    }

    for (const kind of [
      'unsupported-mode',
      'missing-helper',
      'helper-timeout',
      'helper-spawn-error',
      'helper-nonzero-exit',
      'helper-empty-response',
      'helper-malformed-json',
      'helper-jsonrpc-error',
      'helper-incompatible-response',
      'helper-unsupported-protocol',
      'helper-unsupported-version',
      'helper-unsupported-capability',
    ]) {
      assert.ok(checkpoint.includes(kind), `checkpoint should document fallbackKind ${kind}`)
    }

    for (const boundary of [
      'not runtime UI',
      'not displayed by `/team`',
      'not a p95 release hard gate',
      'not make Go default or authoritative',
      'repository reads/writes',
      'sidecars',
      'task status/owner/block/close governance',
      'TaskReport full text',
      'PlanRun transitions',
      'package versioning',
      'npm publishing',
    ]) {
      assert.ok(checkpoint.includes(boundary), `checkpoint should state boundary: ${boundary}`)
    }

    assert.ok(parity.includes('docs/perf/go-kernel-slice7-checkpoint.md'), 'parity doc should link Slice 7 checkpoint')
    assert.ok(readme.includes('docs/perf/go-kernel-slice7-checkpoint.md'), 'README should link Slice 7 checkpoint')
    assert.ok(plan.includes('Go Kernel Slice 7'), 'plan should mention Slice 7 checkpoint')
    assert.ok(plan.includes('diagnostic-only'), 'plan should keep checkpoint diagnostic-only')

    for (const rel of ['teamPanel/dataSource.ts', 'state/repository.ts', 'app/taskApplication.ts', 'app/taskReportWorkflow.ts', 'app/planRunApplication.ts']) {
      const source = read(root, rel)
      assert.equal(source.includes('go-kernel-slice7-checkpoint'), false, `${rel} must not reference checkpoint docs`)
      assert.equal(source.includes('fallbackKind'), false, `${rel} must not expose kernel fallback diagnostics`) 
      assert.equal(source.includes('PI_AGENTTEAM_KERNEL'), false, `${rel} must not read kernel env`)
    }
  },
}
