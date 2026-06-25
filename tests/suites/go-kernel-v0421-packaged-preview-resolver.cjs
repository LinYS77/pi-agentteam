const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.21-go-packaged-preview-resolver.md'
const PLAN = 'docs/agentteam方案书.md'
const REQUIRED_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint']
const HELPER_VERSION = '0.3.0-read-model-shadow'
const SENTINELS = {
  stdout: 'PACKAGED_PREVIEW_STDOUT_SHOULD_NOT_LEAK',
  stderr: 'PACKAGED_PREVIEW_STDERR_SHOULD_NOT_LEAK',
  fullPath: 'packaged-preview-secret-helper-path',
  repoPath: '/tmp/packaged-preview-repo-path-SHOULD_NOT_LEAK',
  cwdPath: '/tmp/packaged-preview-cwd-path-SHOULD_NOT_LEAK',
  mailbox: 'PACKAGED_PREVIEW_MAILBOX_SHOULD_NOT_LEAK',
  report: 'PACKAGED_PREVIEW_REPORT_SHOULD_NOT_LEAK',
  rawState: 'PACKAGED_PREVIEW_RAW_STATE_SHOULD_NOT_LEAK',
  sidecar: 'PACKAGED_PREVIEW_SIDECAR_SHOULD_NOT_LEAK',
  cache: 'PACKAGED_PREVIEW_CACHE_SHOULD_NOT_LEAK',
  index: 'PACKAGED_PREVIEW_INDEX_SHOULD_NOT_LEAK',
  workerPrompt: 'PACKAGED_PREVIEW_WORKER_PROMPT_SHOULD_NOT_LEAK',
}

function writeHelper(name, source, executable = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-packaged-preview-${name}-`))
  const file = path.join(dir, SENTINELS.fullPath, `${name}.cjs`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, executable ? 0o755 : 0o644)
  return { dir, file }
}

function runWithHelper(name, source, action, options = {}) {
  const helper = writeHelper(name, source, options.executable !== false)
  try {
    return action(helper.file, helper.dir)
  } finally {
    fs.rmSync(helper.dir, { recursive: true, force: true })
  }
}

function helperSource(handlerSource) {
  return `#!/usr/bin/env node
const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input) : {}
const leak = ${JSON.stringify(SENTINELS)}
const baseHealth = {
  ok: true,
  implementation: 'go',
  protocolVersion: 1,
  adapterVersion: '${HELPER_VERSION}',
  helperVersion: '${HELPER_VERSION}',
  capabilities: ${JSON.stringify(REQUIRED_CAPABILITIES)},
  businessPathsConnected: false,
}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
function raw(value) { process.stdout.write(value) }
function stderr(value) { process.stderr.write(value) }
function validSnapshot(paneId) {
  return {
    capturedAt: request.params.capturedAt,
    panes: [{ paneId, target: 'preview:@1', label: 'go packaged preview', currentCommand: 'pi' }],
    byPaneId: { [paneId]: { paneId, target: 'preview:@1', label: 'go packaged preview', currentCommand: 'pi' } },
    ok: true,
  }
}
${handlerSource}
`
}

function compatibleHelper(paneId) {
  return helperSource(`
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'profile') respond({ ...baseHealth, profile: { scope: 'skeleton-only', params: request.params || {}, stateConnected: false, tmuxConnected: false, tmuxSnapshotParseConnected: true, tmuxSnapshotCaptureConnected: true, compactReadModelFingerprintConnected: true, panelConnected: false, taskReportPlanRunConnected: false } })
else if (request.method === 'tmuxSnapshotParse') respond(validSnapshot('${paneId}'))
else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params.input, fingerprint: 'helper-should-not-be-used', inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })
else respond({ ok: true })
`)
}

function tmuxFallback(stdout, capturedAt) {
  const panes = stdout ? [{ paneId: '%ts', target: 'ts:@1', label: 'TypeScript fallback', currentCommand: 'pi' }] : []
  return { capturedAt, panes, byPaneId: Object.fromEntries(panes.map(item => [item.paneId, item])), ok: true }
}

function throwingTmuxFallback() {
  throw new Error('TypeScript parser fallback must not be called in packaged preview cutover path')
}

function compactInput() {
  return {
    mode: 'attached',
    team: { name: 'preview-team', leaderCwd: '/tmp/preview-team' },
    members: [],
    tasks: [],
    mailbox: [],
  }
}

function assertNoSentinelLeaks(value, label) {
  const serialized = JSON.stringify(value)
  for (const [name, sentinel] of Object.entries(SENTINELS)) {
    assert.equal(serialized.includes(sentinel), false, `${label} must not leak ${name}`)
  }
  assert.equal(serialized.includes('/tmp/packaged-preview-repo-path'), false, `${label} must not leak repo path prefix`)
  assert.equal(serialized.includes('/tmp/packaged-preview-cwd-path'), false, `${label} must not leak cwd path prefix`)
}

function assertNoMigrationFallback(metadata, label) {
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false, `${label} must not expose migration fallbackKind`)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackReason'), false, `${label} must not expose migration fallbackReason`)
}

function assertCutoverFailure(adapter, snapshot, expectedKind, label, expectedCalls = 0) {
  assert.equal(snapshot.ok, false, `${label} should fail closed`)
  assert.equal(snapshot.status, 'unknown', `${label} should mark unknown`)
  assert.equal(snapshot.resultMarker, 'stale', `${label} should mark stale`)
  assert.equal(snapshot.module, 'tmuxSnapshotParse', `${label} should name module`)
  assert.equal(snapshot.capability, 'tmuxSnapshotParse', `${label} should name capability`)
  assert.equal(snapshot.cutoverFailureKind, expectedKind, `${label} failure kind`)
  assert.deepEqual(snapshot.panes, [], `${label} should not return panes`)
  assert.deepEqual(snapshot.byPaneId, {}, `${label} should not return byPaneId`)
  assert.match(snapshot.reason, new RegExp(`Go kernel cutover unavailable \\(${expectedKind}\\)`), `${label} reason should be compact`)
  assert.ok(String(snapshot.reason).length <= 220, `${label} reason should stay compact`)
  assertNoSentinelLeaks(snapshot, `${label} snapshot`)

  const metadata = adapter.metadata()
  assert.equal(metadata.kernel.requestedMode, 'go-packaged-preview', `${label} requested mode`)
  assert.equal(metadata.kernel.mode, 'typescript', `${label} should disable helper after failure`)
  assert.equal(metadata.kernel.enabled, false, `${label} should not report Go enabled`)
  assert.equal(metadata.kernel.calls, expectedCalls, `${label} helper call count`)
  assert.equal(metadata.kernel.fallbacks, 0, `${label} must not use migration fallback count`)
  assert.equal(metadata.kernel.cutoverModule, 'tmuxSnapshotParse', `${label} cutover module`)
  assert.equal(metadata.kernel.cutoverStatus, 'unavailable', `${label} cutover status`)
  assert.equal(metadata.kernel.cutoverFailureKind, expectedKind, `${label} metadata failure kind`)
  assertNoMigrationFallback(metadata, `${label} metadata`)
  assertNoSentinelLeaks(metadata, `${label} metadata`)
}

module.exports = {
  name: 'Go kernel v0.4.21 packaged helper preview resolver',
  async run(env) {
    const kernel = env.helpers.requireDist('core/kernel.js')
    const source = env.helpers.readSource('core/kernel.ts')
    const doc = fs.readFileSync(path.join(env.helpers.extRoot, DOC), 'utf8')
    const plan = fs.readFileSync(path.join(env.helpers.extRoot, PLAN), 'utf8')

    for (const expected of [
      'v0.4.21 Go Packaged Helper Preview Resolver',
      'explicit, non-default packaged-helper preview resolver',
      'tmuxSnapshotParse` only',
      'does not change package metadata',
      'add native artifacts',
      'make Go default',
      'delete the TypeScript parser fallback',
      'docs/perf/v0.4.21-go-runtime-availability.md',
      'docs/perf/v0.4.21-go-native-artifact-contract.md',
      'docs/perf/v0.4.21-go-package-policy-guardrails.md',
      'docs/perf/v0.4.21-go-resolver-diagnostics-design.md',
      'packaged helper discovery does not run in default, disabled, typescript, go, auto, or current `go-cutover`',
      'compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
      'runtime `/team` remains quiet',
      'explicit helper path wins first',
      'PI_AGENTTEAM_KERNEL_PACKAGED_HELPER',
      'unsupported-platform` maps to compact cutover failure kind `missing-helper`',
      'integrity-failed` maps to compact cutover failure kind `helper-incompatible-response`',
      'The preview resolver is a skeleton for local validation',
      'TypeScript parser fallback callback is not invoked',
      'migration fallback fields `fallbackKind`, `fallbackReason`, and fallback counts are not used',
      'no helper build/install/download/package/version/publish scripts',
      'no `optionalDependencies` or native companion package metadata',
      'no checked-in native artifacts',
    ]) {
      assert.ok(doc.includes(expected), `preview resolver doc should include ${expected}`)
    }
    assert.ok(plan.includes(DOC), 'roadmap should reference packaged preview resolver doc')

    assert.equal(kernel.normalizeAgentTeamKernelMode('go-packaged-preview'), 'go-packaged-preview')
    assert.equal(kernel.normalizeAgentTeamKernelMode('GO-PACKAGED-PREVIEW'), 'go-packaged-preview')
    assert.equal(kernel.isKnownAgentTeamKernelMode('go-packaged-preview'), true)

    const defaultAdapter = kernel.createAgentTeamKernelAdapter({ env: {} })
    assert.equal(defaultAdapter.metadata().kernel.requestedMode, 'default')
    assert.equal(defaultAdapter.metadata().kernel.mode, 'go')
    assert.equal(defaultAdapter.metadata().kernel.enabled, true)
    assert.equal(defaultAdapter.metadata().kernel.calls, 0)
    assert.equal(defaultAdapter.metadata().kernel.cutoverStatus, 'active')

    const missingPackaged = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: { PATH: process.env.PATH } })
    const missingSnapshot = missingPackaged.parseTmuxPaneSnapshot(`%p\t${SENTINELS.repoPath}\t${SENTINELS.mailbox}\tpi`, 1700005000001, throwingTmuxFallback)
    assertCutoverFailure(missingPackaged, missingSnapshot, 'missing-helper', 'preview missing packaged helper', 0)
    assert.match(missingPackaged.metadata().kernel.cutoverReason, /packaged helper not configured/)

    runWithHelper('packaged-success', compatibleHelper('%packaged'), packagedPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: packagedPath, env: { PATH: process.env.PATH } })
      const readModel = adapter.compactReadModelFingerprint(compactInput())
      assert.equal(readModel.readOnly, true, 'read-model should stay TS fallback')
      assert.equal(adapter.metadata().kernel.calls, 0, 'read-model should not call packaged helper')
      const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700005000002, throwingTmuxFallback)
      assert.equal(snapshot.ok, true)
      assert.equal(snapshot.panes[0].paneId, '%packaged')
      const metadata = adapter.metadata()
      assert.equal(metadata.kernel.requestedMode, 'go-packaged-preview')
      assert.equal(metadata.kernel.mode, 'go')
      assert.equal(metadata.kernel.enabled, true)
      assert.equal(metadata.kernel.calls, 2, 'health preflight plus tmuxSnapshotParse')
      assert.equal(metadata.kernel.fallbacks, 0)
      assert.equal(metadata.kernel.cutoverModule, 'tmuxSnapshotParse')
      assert.equal(metadata.kernel.cutoverStatus, 'active')
      assert.equal(metadata.kernel.helperPath, path.basename(packagedPath))
      assertNoMigrationFallback(metadata, 'packaged success')
      assertNoSentinelLeaks(metadata, 'packaged success metadata')
    })

    runWithHelper('explicit-precedence-explicit', compatibleHelper('%explicit'), explicitPath => {
      runWithHelper('explicit-precedence-packaged', compatibleHelper('%packaged-wrong'), packagedPath => {
        const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', helperPath: explicitPath, packagedHelperPath: packagedPath, env: { PATH: process.env.PATH } })
        const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700005000003, throwingTmuxFallback)
        assert.equal(snapshot.ok, true)
        assert.equal(snapshot.panes[0].paneId, '%explicit', 'explicit helper path should beat packaged helper path')
        assert.equal(adapter.metadata().kernel.helperPath, path.basename(explicitPath))
      })
    })

    runWithHelper('not-discovered', helperSource(`
fs.writeFileSync(process.env.SHOULD_NOT_RUN_FILE, 'called')
if (request.method === 'health') respond(baseHealth)
else respond(validSnapshot('%unexpected'))
`), packagedPath => {
      for (const mode of ['disabled', 'typescript', 'auto', 'go-cutover']) {
        const marker = path.join(path.dirname(packagedPath), `called-${mode}`)
        const adapter = kernel.createAgentTeamKernelAdapter({ mode, packagedHelperPath: packagedPath, env: { SHOULD_NOT_RUN_FILE: marker, PATH: process.env.PATH } })
        const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700005000004, mode === 'go-cutover' ? throwingTmuxFallback : tmuxFallback)
        if (mode === 'go-cutover') {
          assert.equal(snapshot.ok, false, 'current go-cutover should not use packaged discovery and should fail closed without explicit helper')
          assert.equal(snapshot.cutoverFailureKind, 'missing-helper')
        } else {
          assert.equal(snapshot.ok, true, `${mode} should keep TypeScript behavior when callback is supplied`)
          assert.equal(snapshot.panes[0].paneId, '%ts')
        }
        assert.equal(fs.existsSync(marker), false, `${mode} must not run packaged helper discovery`)
      }

      for (const mode of [undefined, 'go']) {
        const marker = path.join(path.dirname(packagedPath), `called-${mode || 'default'}`)
        const adapter = kernel.createAgentTeamKernelAdapter({ mode, packagedHelperPath: packagedPath, env: { SHOULD_NOT_RUN_FILE: marker, PATH: process.env.PATH } })
        const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700005000004, throwingTmuxFallback)
        assert.equal(snapshot.ok, true, `${mode || 'default'} should use approved embedded helper while ignoring arbitrary packagedHelperPath`)
        assert.equal(snapshot.panes[0].paneId, '%ts')
        assert.equal(fs.existsSync(marker), false, `${mode || 'default'} must not run arbitrary packaged helper path`)
      }
    })

    const unsupported = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperStatus: 'unsupported-platform', packagedHelperPath: path.join(os.tmpdir(), SENTINELS.fullPath, 'unsupported-helper') })
    const unsupportedSnapshot = unsupported.parseTmuxPaneSnapshot('%p\tgo:@1\tlabel\tpi', 1700005000005, throwingTmuxFallback)
    assertCutoverFailure(unsupported, unsupportedSnapshot, 'missing-helper', 'preview unsupported platform', 0)
    assert.match(unsupported.metadata().kernel.cutoverReason, /unsupported platform/)

    const integrity = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperStatus: 'integrity-failed', packagedHelperPath: path.join(os.tmpdir(), SENTINELS.fullPath, 'integrity-helper') })
    const integritySnapshot = integrity.parseTmuxPaneSnapshot('%p\tgo:@1\tlabel\tpi', 1700005000006, throwingTmuxFallback)
    assertCutoverFailure(integrity, integritySnapshot, 'helper-incompatible-response', 'preview integrity failed', 0)
    assert.match(integrity.metadata().kernel.cutoverReason, /integrity check failed/)

    runWithHelper('permission-denied', compatibleHelper('%permission'), helperPath => {
      fs.chmodSync(helperPath, 0o644)
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: helperPath, env: { PATH: process.env.PATH } })
      const snapshot = adapter.parseTmuxPaneSnapshot('%p\tgo:@1\tlabel\tpi', 1700005000007, throwingTmuxFallback)
      assertCutoverFailure(adapter, snapshot, 'helper-spawn-error', 'preview non-executable helper', 1)
    })

    runWithHelper('version-skew', helperSource(`
if (request.method === 'health') respond({ ...baseHealth, helperVersion: '9.9.9-${SENTINELS.stdout}' })
else respond(validSnapshot('%wrong-version'))
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: helperPath, env: { PATH: process.env.PATH } })
      const snapshot = adapter.parseTmuxPaneSnapshot('%p\tgo:@1\tlabel\tpi', 1700005000008, throwingTmuxFallback)
      assertCutoverFailure(adapter, snapshot, 'helper-unsupported-version', 'preview version skew', 1)
    })

    runWithHelper('malformed', helperSource(`
if (request.method === 'health') respond(baseHealth)
else {
  raw('{ malformed ' + leak.stdout + ' ' + leak.repoPath + '\\n')
  stderr(leak.stderr + ' ' + leak.mailbox + ' ' + leak.report + ' ' + leak.workerPrompt + '\\n')
}
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: helperPath, env: { PATH: process.env.PATH } })
      const snapshot = adapter.parseTmuxPaneSnapshot('%p\tgo:@1\tlabel\tpi', 1700005000009, throwingTmuxFallback)
      assertCutoverFailure(adapter, snapshot, 'helper-malformed-json', 'preview malformed helper', 2)
    })

    runWithHelper('unsafe', helperSource(`
if (request.method === 'health') respond(baseHealth)
else respond({
  ...validSnapshot('%unsafe'),
  text: leak.stdout,
  mailbox: [{ text: leak.mailbox }],
  reports: [{ body: leak.report }],
  rawState: leak.rawState,
  sidecar: leak.sidecar,
  cache: leak.cache,
  index: leak.index,
})
`), helperPath => {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: helperPath, env: { PATH: process.env.PATH } })
      const snapshot = adapter.parseTmuxPaneSnapshot('%p\tgo:@1\tlabel\tpi', 1700005000010, throwingTmuxFallback)
      assertCutoverFailure(adapter, snapshot, 'helper-unsafe-response-shape', 'preview unsafe helper', 2)
    })

    for (const rel of ['teamPanel/dataSource.ts', 'teamPanel/viewModel.ts', 'teamPanel/readModel.ts', 'runtime/repository.ts', 'state/repository.ts', 'adapters/tmux/teamPanes.ts', 'adapters/tmux/index.ts']) {
      const fileSource = env.helpers.readSource(rel)
      assert.equal(fileSource.includes('PI_AGENTTEAM_KERNEL_PACKAGED_HELPER'), false, `${rel} must not read packaged helper env`)
      assert.equal(fileSource.includes('go-packaged-preview'), false, `${rel} must not branch on packaged preview mode`)
    }
    assert.match(source, /defaultAgentTeamKernelPackagedHelperPath/, 'packaged resolver seam should live in kernel adapter')

    const packageJson = JSON.parse(fs.readFileSync(path.join(env.helpers.extRoot, 'package.json'), 'utf8'))
    assert.equal(packageJson.version, '0.6.8', 'package version must remain unchanged')
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'no optional native packages yet')
    assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'kernel source must not be packaged')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
    for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
      assert.equal(fs.existsSync(path.join(env.helpers.extRoot, rel)), false, `${rel} must not exist for packaged preview resolver`)
    }
  },
}
