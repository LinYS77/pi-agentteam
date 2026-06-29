const assert = require('node:assert/strict')
const cp = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const builder = require('../../scripts/lib/go-helper-artifact-builder.cjs')
const {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  runInstalledLayoutConsumptionProof,
} = require('../../scripts/lib/go-helper-clean-install-proof.cjs')

const CLI = 'scripts/verify-go-helper-clean-install-proof.cjs'
const DOC = 'docs/perf/v0.6.33-clean-install-native-helper-consumption.md'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITIES = ['health', 'profile', MODULE, 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability']
const FIXED_GENERATED_AT = '2026-06-14T03:00:00.000Z'
const FIXED_SOURCE_REVISION = '7777777777777777777777777777777777777777'
const RUN_IDENTITY = 'v0633-installed-layout-consumption-suite'

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function mkTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0633-installed-layout-suite-'))
  assert.equal(path.dirname(root), os.tmpdir(), 'suite temp root must be under OS tmpdir')
  return root
}

function assertNoTextLeaks(value, roots) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'summary must not leak absolute temp/repo roots')
  }
  assert.equal(text.includes(process.cwd()), false, 'summary must not leak cwd')
  assert.equal(/stdout|stderr|Error:|AssertionError|\bat\s+|stack|agentteam-v0633-|node_modules\/pi-agentteam|\.tgz|package\/index\.ts|raw manifest|raw provenance|raw verifier|artifact-index body|manifest body|provenance body|license body|attestation body/i.test(text), false, 'summary must not leak raw npm/helper/verifier output, temp paths, package listings, or raw metadata bodies')
}

function assertSummary(summary) {
  assert.equal(summary.ok, true)
  assert.equal(summary.status, 'verified')
  assert.equal(summary.resultMarker, 'installed-layout-consumption-prototype')
  assert.equal(summary.proofKind, 'verified-artifact-installed-layout-explicit-preview')
  assert.equal(summary.reviewOnly, true)
  assert.equal(summary.prototype, true)
  assert.equal(summary.nonAvailability, true)
  assert.equal(summary.normalUserAvailability, false)
  assert.equal(summary.nativePackageDelivery, false)
  assert.equal(summary.releaseAsset, false)
  assert.equal(summary.installSource, false)
  assert.equal(summary.packageArtifact, false)
  assert.equal(summary.defaultResolverChanged, false)
  assert.equal(summary.defaultGoChanged, false)
  assert.equal(summary.fallbackDeletionApproved, false)

  assert.equal(summary.package.name, PACKAGE_NAME)
  assert.equal(summary.package.version, PACKAGE_VERSION)
  assert.equal(summary.package.tsPiFacade, true)
  assert.equal(summary.package.nativeMetadata, false)
  assert.equal(summary.package.lifecycleHooks, false)
  assert.equal(summary.package.unsafeScripts, false)

  assert.equal(summary.artifact.verification, 'existing-strict-review-artifact-verifier')
  assert.equal(summary.artifact.resultMarker, 'review-artifact-reverified')
  assert.equal(summary.artifact.target, 'linux-x64-glibc')
  assert.equal(summary.artifact.reviewOnly, true)
  assert.equal(summary.artifact.releaseAsset, false)
  assert.equal(summary.artifact.installSource, false)
  assert.equal(summary.artifact.normalUserAvailability, false)
  assert.equal(summary.artifact.rawVerifierJsonIncluded, false)

  assert.equal(summary.installedPackage.name, PACKAGE_NAME)
  assert.equal(summary.installedPackage.version, PACKAGE_VERSION)
  assert.equal(summary.installedPackage.rootKind, 'os-temp-project-node_modules-package')
  assert.equal(summary.installedPackage.sourceKind, 'installed-package-root')
  assert.equal(summary.installedPackage.loadedFromInstalledPackageRoot, true)
  assert.equal(summary.installedPackage.repoSourceLoaded, false)
  assert.equal(summary.installedPackage.requiredFilesPresent, true)
  assert.equal(summary.installedPackage.nativeLayoutInjectedAfterInstall, true)
  assert.equal(summary.installedPackage.layoutRelDir, `native/${MODULE}/${HELPER_VERSION}/linux-x64-glibc`)
  assert.equal(summary.installedPackage.manifestRelPath, `native/${MODULE}/${HELPER_VERSION}/linux-x64-glibc/manifest.json`)
  assert.equal(summary.installedPackage.copiedVerifiedFiles, 7)

  assert.equal(summary.preview.explicitMode, 'go-packaged-preview')
  assert.equal(summary.preview.tmuxSnapshotParse, true)
  assert.equal(summary.preview.compactReadModelFingerprint, 'typescript-fallback')
  assert.equal(summary.preview.helperCalls, 2)
  assert.equal(summary.preview.fallbackCalls, 0)
  assert.equal(summary.preview.helperPathRedacted, true)
  assert.equal(summary.preview.nonPreviewModesIgnoredInstalledLayout, true)

  assert.equal(summary.cleanup.defaultCleanup, true)
  assert.equal(summary.cleanup.cleaned, true)
  assert.equal(summary.cleanup.kept, false)
  assert.equal(summary.cleanup.pathsRedacted, true)

  for (const forbidden of [
    'normal-user native availability is proven',
    'real package-manager native delivery is complete',
    'install source is approved',
    'default resolver is enabled',
    'default Go is enabled',
    'fallback deletion is approved',
  ]) {
    assert.equal(JSON.stringify(summary).includes(forbidden), false, `summary must not overclaim: ${forbidden}`)
  }
}

function writeFakeGo(binDir) {
  fs.mkdirSync(binDir, { recursive: true })
  const fakeGoPath = path.join(binDir, 'go')
  fs.writeFileSync(fakeGoPath, `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
if (args[0] === 'version') {
  process.stdout.write('go version go1.99.0 agentteam-fake/host\\n')
  process.exit(0)
}
if (args[0] !== 'build') process.exit(2)
const output = args[args.indexOf('-o') + 1]
const health = ${JSON.stringify({ ok: true, implementation: 'go', protocolVersion: PROTOCOL_VERSION, helperVersion: HELPER_VERSION, capabilities: CAPABILITIES, businessPathsConnected: false })}
const helperSource = [
  '#!/usr/bin/env node',
  'let input = ""',
  "process.stdin.setEncoding('utf8')",
  "process.stdin.on('data', chunk => { input += chunk })",
  "process.stdin.on('end', () => {",
  "  const request = input.trim() ? JSON.parse(input.trim().split('\\\\n')[0]) : {}",
  '  const health = ' + JSON.stringify(health),
  "  function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\\\n') }",
  "  if (request.method === 'health') respond(health)",
  "  else if (request.method === 'profile') respond({ ...health, profile: { scope: 'skeleton-only', params: request.params || {}, stateConnected: false, tmuxConnected: false, tmuxSnapshotParseConnected: true, tmuxSnapshotCaptureConnected: true, compactReadModelFingerprintConnected: true, workerLifecycleInspectPaneConnected: true, workerLifecycleListAgentTeamPanesConnected: true, panelConnected: false, taskReportPlanRunConnected: false } })",
  "  else if (request.method === 'tmuxSnapshotParse') respond({ ok: true, capturedAt: Number((request.params || {}).capturedAt || 0), panes: [{ paneId: '%1', target: 'installed:@1', label: 'installed-helper', currentCommand: 'pi' }], byPaneId: { '%1': { paneId: '%1', target: 'installed:@1', label: 'installed-helper', currentCommand: 'pi' } } })",
  "  else if (request.method === 'compactReadModelFingerprint') respond({ ok: true, projection: request.params && request.params.input, fingerprint: 'helper-should-not-run', inputKind: 'compact-panel-data', readOnly: true, fullTextIncluded: false, stateFilesRead: false, stateFilesWritten: false })",
  "  else if (request.method === 'workerLifecycle') { const params = request.params || {}; if (params.operation === 'listAgentTeamPanes') respond({ ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes: [], byPaneId: {}, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'captureCurrentPaneBinding') respond({ ok: true, operation: 'captureCurrentPaneBinding', capability: 'workerLifecycle', paneId: '%fake-current', target: 'test:@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'listPanesInWindow') respond({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: params.target || 'test:@1', exists: true, paneIds: ['%fake-current'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findAgentTeamWindowTarget') respond({ ok: true, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findWindowTargetByName') respond({ ok: true, operation: 'findWindowTargetByName', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', windowName: params.windowName || 'agentteam', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'sessionExists') respond({ ok: true, operation: 'sessionExists', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'markWindowAsAgentTeam') respond({ ok: false, operation: 'markWindowAsAgentTeam', capability: 'workerLifecycle', target: '', marked: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', error: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'refreshWindowPaneLabels') respond({ ok: false, operation: 'refreshWindowPaneLabels', capability: 'workerLifecycle', target: '', refreshed: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle refreshWindowPaneLabels unavailable (invalid-target)', error: 'Go worker lifecycle refreshWindowPaneLabels unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'createTeammatePane') respond({ ok: false, operation: 'createTeammatePane', capability: 'workerLifecycle', target: '', paneId: '', created: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle createTeammatePane unavailable (invalid-target)', error: 'Go worker lifecycle createTeammatePane unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'clearPaneLabel') respond({ ok: false, operation: 'clearPaneLabel', capability: 'workerLifecycle', paneId: '', cleared: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-pane-id', reason: 'Go worker lifecycle clearPaneLabel unavailable (invalid-pane-id)', error: 'Go worker lifecycle clearPaneLabel unavailable (invalid-pane-id)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'setPaneLabel') respond({ ok: false, operation: 'setPaneLabel', capability: 'workerLifecycle', paneId: '', labeled: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-pane-id', reason: 'Go worker lifecycle setPaneLabel unavailable (invalid-pane-id)', error: 'Go worker lifecycle setPaneLabel unavailable (invalid-pane-id)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else respond({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId: params.paneId || '', requestedPaneId: params.paneId || '', exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', error: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) }",
  "  else if (request.method === 'tmuxAvailability') respond({ ok: true, capability: 'tmuxAvailability', available: true, version: 'tmux 3.4', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })",
  "  else process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'method not found' } }) + '\\\\n')",
  '})',
].join('\\n') + '\\n'
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, helperSource, 'utf8')
if (process.platform !== 'win32') fs.chmodSync(output, 0o755)
`, 'utf8')
  fs.chmodSync(fakeGoPath, 0o755)
}

function buildTempReviewArtifact(root, tempRoot) {
  const fakeBin = path.join(tempRoot, 'fake-bin')
  writeFakeGo(fakeBin)
  const artifactRoot = path.join(tempRoot, 'review-artifact')
  builder.buildGoHelperArtifact({
    extRoot: root,
    outputRoot: artifactRoot,
    env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}` },
    ciReview: true,
    generatedAt: FIXED_GENERATED_AT,
    sourceRevision: FIXED_SOURCE_REVISION,
    runIdentity: RUN_IDENTITY,
  })
  return artifactRoot
}

function assertCliBuild(root) {
  const result = cp.spawnSync(process.execPath, [CLI, '--repo-root', root, '--build-review-artifact', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  })
  assert.equal(result.status, 0, `CLI --build-review-artifact should pass\nstdout=${result.stdout}\nstderr=${result.stderr}`)
  assert.equal(result.stderr, '', 'CLI should not emit stderr on success')
  const summary = JSON.parse(result.stdout)
  assert.equal(summary.artifact.builtLocally, true)
  assert.equal(summary.artifact.source, 'local-os-temp-review-artifact-build')
  assertSummary(summary)
  assertNoTextLeaks(summary, [root])
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of [
    'Slice 3 — Verified Artifact to Installed Layout Consumption Evidence',
    '`runInstalledLayoutConsumptionProof`',
    '`--build-review-artifact`',
    '`--artifact-root <path>`',
    'The proof first runs the existing strict review artifact verifier',
    'It copies only the verified `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc` layout into the temp installed package root.',
    'It loads transpiled kernel code from the temp installed package root, not from the repo source checkout.',
    'Only explicit `go-packaged-preview` consumes the installed layout.',
    '`compactReadModelFingerprint` remains TypeScript fallback / non-cutover and does not call the helper.',
    'Slice 3 is an installed-layout consumption prototype only.',
    'It is not package-manager-delivered native helper evidence, not install source approval, not normal-user availability, not default resolver approval, and not default Go approval.',
  ]) {
    assert.ok(doc.includes(expected), `${DOC} should include ${expected}`)
  }
}

module.exports = {
  name: 'Go kernel v0.6.33 installed-layout consumption',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)

    const tempRoots = []
    const summary = runInstalledLayoutConsumptionProof({
      repoRoot: root,
      buildReviewArtifact: true,
      onTempRoots(roots) {
        tempRoots.push(roots.packRoot, roots.installProjectRoot)
      },
    })
    assert.equal(summary.artifact.builtLocally, true)
    assert.equal(summary.artifact.source, 'local-os-temp-review-artifact-build')
    assertSummary(summary)
    assertNoTextLeaks(summary, [root, ...tempRoots])
    for (const tempRoot of tempRoots) assert.equal(fs.existsSync(tempRoot), false, `temp root should be cleaned: ${tempRoot}`)

    let tempRoot
    try {
      tempRoot = mkTempRoot()
      const artifactRoot = buildTempReviewArtifact(root, tempRoot)
      const external = runInstalledLayoutConsumptionProof({ repoRoot: root, artifactRoot })
      assert.equal(external.artifact.builtLocally, false)
      assert.equal(external.artifact.source, 'external-artifact-root-verified')
      assertSummary(external)
      assertNoTextLeaks(external, [root, tempRoot, artifactRoot])
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }

    assertCliBuild(root)
  },
}
