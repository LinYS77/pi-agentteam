const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.22-native-helper-package-metadata.md'
const PLAN = 'docs/agentteam方案书.md'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const REQUIRED_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint']
const SENTINELS = {
  stdout: 'V0422_PREVIEW_STDOUT_SHOULD_NOT_LEAK',
  stderr: 'V0422_PREVIEW_STDERR_SHOULD_NOT_LEAK',
  mailbox: 'V0422_PREVIEW_MAILBOX_SHOULD_NOT_LEAK',
  report: 'V0422_PREVIEW_REPORT_SHOULD_NOT_LEAK',
  rawState: 'V0422_PREVIEW_RAW_STATE_SHOULD_NOT_LEAK',
  sidecar: 'V0422_PREVIEW_SIDECAR_SHOULD_NOT_LEAK',
  cache: 'V0422_PREVIEW_CACHE_SHOULD_NOT_LEAK',
  index: 'V0422_PREVIEW_INDEX_SHOULD_NOT_LEAK',
  workerPrompt: 'V0422_PREVIEW_WORKER_PROMPT_SHOULD_NOT_LEAK',
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function helperSource(paneId, options = {}) {
  return `#!/usr/bin/env node
const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8').trim()
const request = input ? JSON.parse(input) : {}
const marker = ${JSON.stringify(options.marker || '')}
if (marker) fs.appendFileSync(marker, request.method + '\\n')
const baseHealth = {
  ok: true,
  implementation: 'go',
  protocolVersion: 1,
  adapterVersion: '${HELPER_VERSION}',
  helperVersion: '${options.helperVersion || HELPER_VERSION}',
  capabilities: ${JSON.stringify(options.capabilities || REQUIRED_CAPABILITIES)},
  businessPathsConnected: false,
}
function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n') }
if (request.method === 'health') respond(baseHealth)
else if (request.method === 'tmuxSnapshotParse') respond({ capturedAt: request.params.capturedAt, panes: [{ paneId: '${paneId}', target: 'preview:@1', label: 'preview helper', currentCommand: 'pi' }], byPaneId: { '${paneId}': { paneId: '${paneId}', target: 'preview:@1', label: 'preview helper', currentCommand: 'pi' } }, ok: true })
else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params.input, fingerprint: 'helper-should-not-be-used', inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })
else respond(baseHealth)
`
}

function writeHelper(root, name, source) {
  const file = path.join(root, `${name}.cjs`)
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return file
}

function tmuxFallback(stdout, capturedAt) {
  const pane = { paneId: '%ts', target: 'ts:@1', label: 'TypeScript fallback', currentCommand: 'pi' }
  return { capturedAt, panes: [pane], byPaneId: { [pane.paneId]: pane }, ok: true }
}

function throwingFallback() {
  throw new Error('TypeScript parser fallback must not be called in cutover/preview failure path')
}

function compactInput() {
  return { team: { name: 'v0422-preview-invariants' }, mailbox: [{ text: SENTINELS.mailbox }], tasks: [] }
}

function assertNoMigrationFallback(metadata, label) {
  assert.equal(metadata.kernel.fallbacks, 0, `${label} should not increment migration fallbacks`)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false, `${label} should not expose fallbackKind`)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackReason'), false, `${label} should not expose fallbackReason`)
}

function assertFailClosed(adapter, snapshot, expectedKind, label) {
  assert.equal(snapshot.ok, false, `${label} should fail closed`)
  assert.equal(snapshot.status, 'unknown', `${label} status`)
  assert.equal(snapshot.resultMarker, 'stale', `${label} result marker`)
  assert.equal(snapshot.module, 'tmuxSnapshotParse', `${label} module`)
  assert.equal(snapshot.capability, 'tmuxSnapshotParse', `${label} capability`)
  assert.equal(snapshot.cutoverFailureKind, expectedKind, `${label} cutover kind`)
  assert.deepEqual(snapshot.panes, [], `${label} panes`)
  assert.deepEqual(snapshot.byPaneId, {}, `${label} byPaneId`)
  const serialized = JSON.stringify({ snapshot, metadata: adapter.metadata() })
  for (const sentinel of Object.values(SENTINELS)) {
    assert.equal(serialized.includes(sentinel), false, `${label} must not leak sentinel`)
  }
  assertNoMigrationFallback(adapter.metadata(), label)
}

function assertReadModelTsFallback(adapter, label) {
  const beforeCalls = adapter.metadata().kernel.calls
  const result = adapter.compactReadModelFingerprint(compactInput())
  assert.equal(result.ok, true, `${label} read-model result`)
  assert.equal(result.readOnly, true, `${label} read-model readonly`)
  assert.equal(result.fullTextIncluded, false, `${label} no full text`)
  assert.notEqual(result.fingerprint, 'helper-should-not-be-used', `${label} should not use helper fingerprint`)
  assert.equal(adapter.metadata().kernel.calls, beforeCalls, `${label} should not call helper for read-model`)
}

function assertRuntimeUiQuiet(root) {
  for (const rel of ['teamPanel/dataSource.ts', 'teamPanel/viewModel.ts', 'teamPanel/readModel.ts', 'teamPanel.ts', 'renderers.ts']) {
    const source = read(root, rel)
    assert.equal(/cutoverReason/.test(source), false, `${rel} must not render cutoverReason`)
    assert.equal(/PI_AGENTTEAM_KERNEL_PACKAGED_HELPER|go-packaged-preview/.test(source), false, `${rel} must not branch on packaged preview`)
    assert.equal(/cutoverFailureKind.*render|render.*cutoverFailureKind|cutover unavailable/.test(source), false, `${rel} must not add runtime cutover diagnostics`)
  }
}

module.exports = {
  name: 'Go kernel v0.4.22 packaged preview invariants',
  async run(env) {
    const root = env.helpers.extRoot
    const kernel = env.helpers.requireDist('core/kernel.js')
    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    assert.ok(doc.includes('## Slice 5 go-packaged-preview Runtime Invariants'), 'metadata doc should include Slice 5 invariant section')
    assert.ok(doc.includes('Default/unset remains disabled/TypeScript'), 'metadata doc should state default invariant')
    assert.ok(doc.includes('`compactReadModelFingerprint` remains TypeScript fallback / non-cutover'), 'metadata doc should state read-model invariant')
    assert.ok(plan.includes('tests/suites/go-kernel-v0422-packaged-preview-invariants.cjs'), 'roadmap should reference Slice 5 invariant suite')

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0422-preview-invariants-'))
    try {
      const packagedMarker = path.join(tempRoot, 'packaged-called.log')
      const explicitMarker = path.join(tempRoot, 'explicit-called.log')
      const packagedHelper = writeHelper(tempRoot, 'packaged-helper', helperSource('%packaged', { marker: packagedMarker }))
      const explicitHelper = writeHelper(tempRoot, 'explicit-helper', helperSource('%explicit', { marker: explicitMarker }))
      const wrongVersionHelper = writeHelper(tempRoot, 'wrong-version-helper', helperSource('%wrong-version', { helperVersion: '9.9.9' }))

      const defaultAdapter = kernel.createAgentTeamKernelAdapter({ env: { PI_AGENTTEAM_KERNEL_PACKAGED_HELPER: packagedHelper, V0422_HELPER_MARKER: packagedMarker, PATH: process.env.PATH } })
      assert.equal(defaultAdapter.metadata().kernel.requestedMode, 'disabled', 'default remains disabled')
      assert.equal(defaultAdapter.metadata().kernel.mode, 'typescript', 'default remains TypeScript')
      assert.equal(defaultAdapter.metadata().kernel.enabled, false, 'default does not enable Go')
      const defaultSnapshot = defaultAdapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700007000001, tmuxFallback)
      assert.equal(defaultSnapshot.panes[0].paneId, '%ts', 'default should use TS fallback')
      assert.equal(fs.existsSync(packagedMarker), false, 'default must not discover packaged helper')

      for (const mode of ['disabled', 'typescript', 'go', 'auto']) {
        const marker = path.join(tempRoot, `${mode}-called.log`)
        const adapter = kernel.createAgentTeamKernelAdapter({ mode, packagedHelperPath: packagedHelper, env: { V0422_HELPER_MARKER: marker, PATH: process.env.PATH } })
        const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700007000002, tmuxFallback)
        assert.equal(snapshot.panes[0].paneId, '%ts', `${mode} should not use packaged helper`)
        assert.equal(fs.existsSync(marker), false, `${mode} must not call packaged helper`)
      }

      const goCutoverPackagedOnly = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', packagedHelperPath: packagedHelper, env: { V0422_HELPER_MARKER: packagedMarker, PATH: process.env.PATH } })
      const cutoverPackagedSnapshot = goCutoverPackagedOnly.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700007000003, throwingFallback)
      assertFailClosed(goCutoverPackagedOnly, cutoverPackagedSnapshot, 'missing-helper', 'go-cutover without explicit helper')
      assert.equal(fs.existsSync(packagedMarker), false, 'go-cutover must not discover packaged helper')

      const goCutoverExplicit = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', helperPath: explicitHelper, env: { V0422_HELPER_MARKER: explicitMarker, PATH: process.env.PATH } })
      const cutoverExplicitSnapshot = goCutoverExplicit.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700007000004, throwingFallback)
      assert.equal(cutoverExplicitSnapshot.ok, true, 'go-cutover explicit helper should still work')
      assert.equal(cutoverExplicitSnapshot.panes[0].paneId, '%explicit', 'go-cutover should use explicit helper')
      assert.equal(fs.existsSync(explicitMarker), true, 'go-cutover explicit helper should be called')
      assert.equal(goCutoverExplicit.metadata().kernel.requestedMode, 'go-cutover')
      assert.equal(goCutoverExplicit.metadata().kernel.cutoverStatus, 'active')
      assertNoMigrationFallback(goCutoverExplicit.metadata(), 'go-cutover explicit helper')

      const previewDefault = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: { PATH: process.env.PATH } })
      assert.equal(previewDefault.metadata().kernel.requestedMode, 'go-packaged-preview', 'preview mode explicit')
      assert.equal(previewDefault.metadata().kernel.enabled, false, 'preview without helper disabled')
      const previewMissingSnapshot = previewDefault.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700007000005, throwingFallback)
      assertFailClosed(previewDefault, previewMissingSnapshot, 'missing-helper', 'preview missing helper')

      const previewExplicitWins = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', helperPath: explicitHelper, packagedHelperPath: packagedHelper, env: { V0422_HELPER_MARKER: explicitMarker, PATH: process.env.PATH } })
      const previewExplicitSnapshot = previewExplicitWins.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700007000006, throwingFallback)
      assert.equal(previewExplicitSnapshot.ok, true, 'preview explicit helper should work')
      assert.equal(previewExplicitSnapshot.panes[0].paneId, '%explicit', 'explicit helper should win over packaged helper')
      assert.equal(previewExplicitWins.metadata().kernel.helperPath, path.basename(explicitHelper), 'metadata should expose compact explicit helper basename')

      const previewPackaged = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: packagedHelper, env: { V0422_HELPER_MARKER: packagedMarker, PATH: process.env.PATH } })
      const previewPackagedSnapshot = previewPackaged.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700007000007, throwingFallback)
      assert.equal(previewPackagedSnapshot.ok, true, 'preview packaged helper should work only in explicit preview')
      assert.equal(previewPackagedSnapshot.panes[0].paneId, '%packaged', 'preview packaged helper should be used')
      assert.equal(previewPackaged.metadata().kernel.requestedMode, 'go-packaged-preview')
      assert.equal(previewPackaged.metadata().kernel.cutoverStatus, 'active')
      assertNoMigrationFallback(previewPackaged.metadata(), 'preview packaged helper')

      const previewWrongVersion = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: wrongVersionHelper, env: { PATH: process.env.PATH } })
      const wrongVersionSnapshot = previewWrongVersion.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700007000008, throwingFallback)
      assertFailClosed(previewWrongVersion, wrongVersionSnapshot, 'helper-unsupported-version', 'preview wrong version')

      assertReadModelTsFallback(kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', helperPath: explicitHelper, env: { PATH: process.env.PATH } }), 'go-cutover')
      assertReadModelTsFallback(kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: packagedHelper, env: { PATH: process.env.PATH } }), 'go-packaged-preview')

      assertRuntimeUiQuiet(root)
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  },
}
