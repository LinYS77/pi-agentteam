const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

module.exports = {
  name: 'Go kernel v0.4.17 contract freeze docs',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = read(root, 'docs/perf/v0.4.17-kernel-contract-hardening.md')
    const parity = read(root, 'docs/perf/go-kernel-parity-scaffolding.md')
    const checkpoint = read(root, 'docs/perf/go-kernel-slice7-checkpoint.md')
    const readme = read(root, 'README.md')
    const plan = read(root, 'docs/agentteam方案书.md')
    const packageJson = JSON.parse(read(root, 'package.json'))
    const kernelContractSource = read(root, 'core/kernelContract.ts')
    const kernelSource = read(root, 'core/kernel.ts')
    const goSource = read(root, 'kernel/go/agentteam-kernel/main.go')
    const kernel = env.helpers.requireDist('core/kernel.js')

    assert.ok(doc.includes('1578388'), 'freeze doc should reference v0.4.16 commit context')
    assert.ok(doc.includes('v0.4.16'), 'freeze doc should capture the prior checkpoint context')
    assert.ok(doc.includes('v0.4.17 Slice 0'), 'freeze doc should scope itself to Slice 0')
    assert.ok(doc.includes('protocolVersion` stays `1`'), 'freeze doc should keep protocolVersion at 1')
    assert.ok(doc.includes('should not be bumped unless wire shape changes'), 'freeze doc should avoid internal label churn without wire changes')

    assert.equal(kernel.AGENTTEAM_KERNEL_PROTOCOL_VERSION, 1)
    assert.equal(kernel.AGENTTEAM_KERNEL_ADAPTER_VERSION, '0.3.0-read-model-shadow')
    assert.equal(kernel.AGENTTEAM_KERNEL_HELPER_VERSION, '0.3.0-read-model-shadow')
    assert.deepEqual(kernel.AGENTTEAM_KERNEL_CAPABILITIES, ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint'])
    assert.equal(kernel.AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED, false)
    assert.match(kernelContractSource, /AGENTTEAM_KERNEL_PROTOCOL_VERSION = 1/)
    assert.match(kernelSource, /from '\.\/kernelContract\.js'/)
    assert.match(goSource, /const protocolVersion = 1/)
    assert.match(goSource, /const helperVersion = "0\.3\.0-read-model-shadow"/)

    for (const expected of [
      'core/kernel.ts',
      'kernel/go/agentteam-kernel/main.go',
      'docs/perf/go-kernel-parity-scaffolding.md',
      'docs/perf/go-kernel-slice7-checkpoint.md',
      'docs/decisions/0001-replaceable-go-kernel.md',
      'docs/go-kernel-port-audit.md',
      'tests/fixtures/kernel/jsonrpc/protocolCases.cjs',
      'tests/suites/go-kernel-protocol-contract.cjs',
      'tests/suites/go-kernel-compatibility-matrix.cjs',
      'tests/fixtures/kernel/tmux/snapshotCases.cjs',
      'tests/suites/go-kernel-tmux-snapshot-parser.cjs',
      'tests/fixtures/kernel/read-model/panelCases.cjs',
      'tests/suites/go-kernel-read-model-shadow.cjs',
      'tests/suites/go-kernel-fallback-policy.cjs',
      'tests/suites/go-kernel-boundary-guardrails.cjs',
      'docs/perf/v0.4.17-kernel-release-checklist.md',
    ]) {
      assert.ok(doc.includes(expected), `freeze doc should reference ${expected}`)
    }

    for (const capability of ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint']) {
      assert.ok(doc.includes(capability), `freeze doc should document capability ${capability}`)
    }

    for (const mode of ['disabled', 'typescript', 'go', 'auto']) {
      assert.ok(doc.includes(mode), `freeze doc should document mode ${mode}`)
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
      assert.ok(doc.includes(kind), `freeze doc should document fallbackKind ${kind}`)
    }

    for (const boundary of [
      'TypeScript/pi remains authoritative',
      'state/repository reads and writes',
      '`/team` runtime UI',
      'task status/owner/block/close governance',
      '`agentteam_receive` mailbox full-text/read boundary',
      '`agentteam_task action=report` TaskReport full-text boundary',
      'No `go.mod`, `go.sum`, checked-in native binary',
      '`package.json#files` must not package `kernel/`',
      'No `package.json` version change',
      'No performance p95 release gate',
      'string and numeric ids are echoed',
      'null and missing ids are omitted',
      'extra params are ignored',
      'Unknown extra capabilities are rejected',
      'strict rejection is intentional',
      'helperVersion` mismatch',
      '`businessPathsConnected:true`',
      'Slice 3 Tmux Parser Parity Corpus',
      'CRLF rows normalize',
      'duplicate pane ids keep first-seen',
      'After v0.6.50, Go may execute only the narrow `tmuxSnapshotCapture` list-panes snapshot command',
      'Slice 4 Read-Model Parity Corpus',
      'any key named `text` is stripped recursively',
      'Compact team config and PlanRun projections are included',
      'stateFilesWritten:false',
      'Slice 5 Fallback Policy',
      'Read-only shadow/fingerprint operations fail open to TypeScript',
      'Tmux parser helper failures fail open to the TypeScript parser',
      'Future write-side candidates fail closed by default',
      'no TS retry unless the operation is proven idempotent/retry-safe under the TypeScript lock',
      'fallback count stays stable',
      'Slice 6 Boundary Guardrails',
      'pane spawn/kill/window lifecycle, light/force reconcile, state files, runtime UI, governance, and full-text boundaries remain outside Go authority',
      '`package.json#files` must not include `kernel/`',
      'no `go.mod`, `go.sum`, checked-in native `.exe`, `.dll`, `.so`, `.dylib`, or temporary helper artifact is allowed',
      'GitHub-only v0.4.17 reviewer checklist',
    ]) {
      assert.ok(doc.includes(boundary), `freeze doc should state boundary: ${boundary}`)
    }

    for (const forbiddenPhrase of [
      'Go is default',
      'Go remains default',
      'Go is authoritative',
      'Go remains authoritative',
      'npm publish this',
      'run `npm version`',
      'add `go.mod`',
      'package native binary',
    ]) {
      assert.equal(doc.includes(forbiddenPhrase), false, `freeze doc must not imply forbidden action: ${forbiddenPhrase}`)
    }

    assert.ok(parity.includes('docs/perf/v0.4.17-kernel-contract-hardening.md'), 'parity doc should link the v0.4.17 freeze doc')
    assert.ok(checkpoint.includes('docs/perf/v0.4.17-kernel-contract-hardening.md'), 'checkpoint doc should link the v0.4.17 freeze doc')
    assert.ok(readme.includes('docs/perf/v0.4.17-kernel-contract-hardening.md'), 'README should link the v0.4.17 freeze doc')
    assert.ok(plan.includes('v0.4.17 — Go Kernel Contract Hardening'), 'plan should mention v0.4.17 contract hardening')
    assert.ok(plan.includes('docs/perf/v0.4.17-kernel-contract-hardening.md'), 'plan should link the v0.4.17 freeze doc')

    assert.equal(packageJson.version, '0.6.8', 'package version must remain unchanged')
    assert.equal((packageJson.files || []).some(item => item.includes('kernel')), false, 'kernel source must not be packaged')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
    for (const rel of ['go.mod', 'go.sum']) {
      assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist at repo root`)
      assert.equal(fs.existsSync(path.join(root, 'kernel/go/agentteam-kernel', rel)), false, `${rel} must not exist in source-only helper`)
    }
  },
}
