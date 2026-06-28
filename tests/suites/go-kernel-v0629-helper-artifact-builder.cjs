const assert = require('node:assert/strict')
const cp = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const builder = require('../../scripts/lib/go-helper-artifact-builder.cjs')

const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITIES = ['health', 'profile', MODULE, 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability']
const FIXED_GENERATED_AT = '2026-06-12T00:00:00.000Z'
const FIXED_REVISION = '0123456789abcdef0123456789abcdef01234567'
const SECRET_STDOUT = 'V0629_STDOUT_SHOULD_NOT_LEAK'
const SECRET_STDERR = 'V0629_STDERR_SHOULD_NOT_LEAK'
const SECRET_PATH = 'v0629-secret-path-should-not-leak'

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function mkTempRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  assert.equal(path.dirname(root), os.tmpdir(), 'temp root must be directly under OS tmpdir')
  return root
}

function safeReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/')
}

function assertUnder(root, filePath, label) {
  const relative = path.relative(root, filePath)
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `${label} must stay under output root`)
}

function assertSafeRelPath(relPath, label) {
  assert.equal(path.isAbsolute(relPath), false, `${label} must be package-relative`)
  assert.equal(relPath.includes('..'), false, `${label} must not traverse`)
  assert.equal(relPath.includes('\\'), false, `${label} must use package-relative POSIX separators`)
}

function assertNoLeaks(value, roots = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'metadata/diagnostic must not leak absolute paths')
  }
  assert.equal(text.includes(SECRET_STDOUT), false, 'diagnostic must not leak stdout body')
  assert.equal(text.includes(SECRET_STDERR), false, 'diagnostic must not leak stderr body')
  assert.equal(text.includes(SECRET_PATH), false, 'diagnostic must not leak path sentinels')
  assert.equal(/stdout|stderr|Error:|AssertionError|at build|stack/i.test(text), false, 'diagnostic must stay compact')
}

function assertBuilderDiagnostic(error, failureKind, roots = []) {
  assert.ok(error instanceof builder.GoHelperArtifactBuilderError, 'expected compact builder error')
  const diagnostic = error.toDiagnostic()
  assert.equal(diagnostic.ok, false)
  assert.equal(diagnostic.status, 'unavailable')
  assert.equal(diagnostic.module, MODULE)
  assert.equal(diagnostic.capability, MODULE)
  assert.equal(diagnostic.resultMarker, 'fail-closed')
  assert.equal(diagnostic.failureKind, failureKind)
  assertNoLeaks(diagnostic, roots)
}

function writeFakeGo(binDir) {
  fs.mkdirSync(binDir, { recursive: true })
  const fakeGoPath = path.join(binDir, 'go')
  fs.writeFileSync(fakeGoPath, `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
function append(entry) {
  const recordPath = process.env.AGENTTEAM_FAKE_GO_RECORD
  if (!recordPath) return
  fs.appendFileSync(recordPath, JSON.stringify(entry) + '\\n')
}
if (args[0] === 'version') {
  append({ kind: 'version', args, cwd: process.cwd(), go111module: process.env.GO111MODULE || null })
  process.stdout.write('go version go1.99.0 agentteam-fake/host\\n')
  process.exit(0)
}
if (args[0] !== 'build') {
  process.stderr.write('unexpected fake go command ' + args.join(' ') + '\\n')
  process.exit(2)
}
const outIndex = args.indexOf('-o')
const output = outIndex >= 0 ? args[outIndex + 1] : ''
append({ kind: 'build', args, cwd: process.cwd(), go111module: process.env.GO111MODULE || null, output })
if (process.env.AGENTTEAM_FAKE_GO_FAIL_BUILD === '1') {
  process.stdout.write('${SECRET_STDOUT} /tmp/${SECRET_PATH}\\n')
  process.stderr.write('${SECRET_STDERR} ' + process.cwd() + '\\n')
  process.exit(1)
}
if (!output) {
  process.stderr.write('missing -o output\\n')
  process.exit(2)
}
const helperVersion = process.env.AGENTTEAM_FAKE_HELPER_VERSION || '${HELPER_VERSION}'
const protocolVersion = Number(process.env.AGENTTEAM_FAKE_PROTOCOL_VERSION || '${PROTOCOL_VERSION}')
const capabilities = process.env.AGENTTEAM_FAKE_CAPABILITIES ? JSON.parse(process.env.AGENTTEAM_FAKE_CAPABILITIES) : ${JSON.stringify(CAPABILITIES)}
const healthLine = 'const baseHealth = ' + JSON.stringify({ ok: true, implementation: 'go', protocolVersion, helperVersion, capabilities, businessPathsConnected: false })
const helperSource = [
  '#!/usr/bin/env node',
  "const fs = require('node:fs')",
  "const input = fs.readFileSync(0, 'utf8').trim()",
  "const request = input ? JSON.parse(input.split('\\\\n')[0]) : {}",
  healthLine,
  "function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\\\n') }",
  "function error(code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code, message } }) + '\\\\n') }",
  "if (request.method === 'health') respond(baseHealth)",
  "else if (request.method === 'tmuxSnapshotParse') { const params = request.params || {}; const byPaneId = {}; const panes = []; for (const line of String(params.stdout || '').split('\\\\n')) { if (!line) continue; const fields = line.split('\\\\t'); if (fields.length < 4 || !fields[0]) continue; const item = { paneId: fields[0], target: fields[1], label: fields[2], currentCommand: fields[3] }; if (!byPaneId[item.paneId]) panes.push(item); byPaneId[item.paneId] = item } respond({ ok: true, capturedAt: Number(params.capturedAt || 0), panes, byPaneId }) }",
  "else if (request.method === 'workerLifecycle') { const params = request.params || {}; if (params.operation === 'listAgentTeamPanes') respond({ ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes: [], byPaneId: {}, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'captureCurrentPaneBinding') respond({ ok: true, operation: 'captureCurrentPaneBinding', capability: 'workerLifecycle', paneId: '%fake-current', target: 'fake:@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'listPanesInWindow') respond({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: params.target || 'fake:@1', exists: true, paneIds: ['%fake-current'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findAgentTeamWindowTarget') respond({ ok: true, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', sessionName: params.sessionName || 'fake', exists: true, target: (params.sessionName || 'fake') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findWindowTargetByName') respond({ ok: true, operation: 'findWindowTargetByName', capability: 'workerLifecycle', sessionName: params.sessionName || 'fake', windowName: params.windowName || 'agentteam', exists: true, target: (params.sessionName || 'fake') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'sessionExists') respond({ ok: true, operation: 'sessionExists', capability: 'workerLifecycle', sessionName: params.sessionName || 'fake', exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'markWindowAsAgentTeam') respond({ ok: false, operation: 'markWindowAsAgentTeam', capability: 'workerLifecycle', target: '', marked: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', error: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'refreshWindowPaneLabels') respond({ ok: false, operation: 'refreshWindowPaneLabels', capability: 'workerLifecycle', target: '', refreshed: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle refreshWindowPaneLabels unavailable (invalid-target)', error: 'Go worker lifecycle refreshWindowPaneLabels unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'clearPaneLabel') respond({ ok: false, operation: 'clearPaneLabel', capability: 'workerLifecycle', paneId: '', cleared: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-pane-id', reason: 'Go worker lifecycle clearPaneLabel unavailable (invalid-pane-id)', error: 'Go worker lifecycle clearPaneLabel unavailable (invalid-pane-id)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'setPaneLabel') respond({ ok: false, operation: 'setPaneLabel', capability: 'workerLifecycle', paneId: '', labeled: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-pane-id', reason: 'Go worker lifecycle setPaneLabel unavailable (invalid-pane-id)', error: 'Go worker lifecycle setPaneLabel unavailable (invalid-pane-id)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else respond({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId: params.paneId || '', requestedPaneId: params.paneId || '', exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', error: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) }",
  "else if (request.method === 'tmuxAvailability') respond({ ok: true, capability: 'tmuxAvailability', available: true, version: 'tmux 3.4', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })",
  "else error(-32601, 'method not found')",
].join('\\n') + '\\n'
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, helperSource, 'utf8')
if (process.platform !== 'win32') fs.chmodSync(output, 0o755)
`, 'utf8')
  fs.chmodSync(fakeGoPath, 0o755)
  return fakeGoPath
}

function createFakeGoEnv(tempRoot, overrides = {}) {
  const binDir = path.join(tempRoot, 'fake-bin')
  writeFakeGo(binDir)
  const recordPath = path.join(tempRoot, 'fake-go-record.jsonl')
  return {
    env: {
      ...process.env,
      ...overrides,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
      AGENTTEAM_FAKE_GO_RECORD: recordPath,
    },
    recordPath,
  }
}

function readFakeGoRecords(recordPath) {
  return fs.readFileSync(recordPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
}

function assertPackageNativeSanity(root) {
  const packageJson = safeReadJson(path.join(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain unchanged')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include native/helper/generated outputs')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not run npm pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b/.test(command), false, `${name} must not build/install/module-manage helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild|postinstall/i.test(command), false, `${name} must not download/build native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
}

function assertRuntimeUnchanged(root) {
  const kernelSource = fs.readFileSync(path.join(root, 'core/kernel.ts'), 'utf8')
  const kernelContractSource = fs.readFileSync(path.join(root, 'core/kernelContract.ts'), 'utf8')
  assert.equal(kernelSource.includes('build-go-helper-artifact'), false, 'runtime kernel must not import builder')
  assert.equal(kernelSource.includes('.agentteam-artifacts'), false, 'runtime kernel must not discover local artifact output')
  assert.equal(kernelSource.includes("from './kernelContract.js'"), true, 'runtime kernel should source embedded manifest path from the shared contract')
  assert.equal(kernelContractSource.includes('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json'), true, 'contract may define only the approved embedded tmuxSnapshotParse manifest')
  const manifestPaths = [...kernelContractSource.matchAll(/native\/[^'"`\s]+manifest\.json/g)].map(match => match[0])
  assert.deepEqual([...new Set(manifestPaths)], ['native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json'], 'contract must not define unapproved native manifests')
}

function assertNoRepoGeneratedOutputs(root) {
  const generatedNames = /(?:^|\/)(?:SHA256SUMS|manifest|provenance|license|attestation\.intoto)\.(?:json|jsonl|txt|sha256)$/i
  const forbidden = []
  function walk(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const full = path.join(dir, entry.name)
      const rel = toPosix(path.relative(root, full))
      if (entry.isDirectory()) {
        if (rel === '.agentteam-artifacts' || rel.startsWith('.agentteam-artifacts/')) forbidden.push(rel)
        walk(full)
      } else if (!rel.startsWith('tests/suites/') && !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam') && !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/') && (/\.(?:exe|dll|so|dylib|tgz|tar|zip)$/i.test(rel) || generatedNames.test(rel))) {
        forbidden.push(rel)
      }
    }
  }
  walk(root)
  assert.deepEqual(forbidden, [], 'Slice 1 must not check in generated native/helper metadata or binaries')
}

function assertPositiveArtifact(root, outputRoot, result, recordPath) {
  assert.equal(result.outputRoot, outputRoot)
  assert.equal(result.outputRootKind, 'os-temp')
  assert.equal(result.summary.ok, true)
  assert.equal(result.summary.status, 'available')
  assert.equal(result.summary.resultMarker, 'local-helper-artifact-built')
  assert.equal(result.summary.module, MODULE)
  assert.equal(result.summary.capability, MODULE)
  assert.equal(result.summary.helperVersion, HELPER_VERSION)
  assert.equal(result.summary.protocolVersion, PROTOCOL_VERSION)
  assert.equal(result.summary.smoke.health, true)
  assert.equal(result.summary.smoke.tmuxSnapshotParse, true)
  assert.equal(result.summary.smoke.workerLifecycleInspectPane, true)
  assert.equal(result.summary.smoke.workerLifecycleListAgentTeamPanes, true)
  assert.equal(result.summary.smoke.workerLifecycleCaptureCurrentPaneBinding, true)
  assert.equal(result.summary.smoke.workerLifecycleListPanesInWindow, true)
  assert.equal(result.summary.smoke.workerLifecycleFindAgentTeamWindowTarget, true)
  assert.equal(result.summary.smoke.workerLifecycleFindWindowTargetByName, true)
  assert.equal(result.summary.smoke.workerLifecycleSessionExists, true)
  assert.equal(result.summary.smoke.workerLifecycleMarkWindowAsAgentTeam, true)
  assert.equal(result.summary.smoke.workerLifecycleRefreshWindowPaneLabels, true)
  assert.equal(result.summary.smoke.workerLifecycleSetPaneLabel, true)
  assert.equal(result.summary.smoke.workerLifecycleClearPaneLabel, true)
  assert.equal(result.summary.smoke.tmuxAvailability, true)

  const expectedPrefix = `native/${MODULE}/${HELPER_VERSION}/${result.summary.target}/`
  assert.ok(result.summary.artifact.startsWith(expectedPrefix), 'artifact path should use native/module/helperVersion/target layout')
  assertSafeRelPath(result.summary.artifact, 'summary artifact')

  for (const filePath of [result.helperPath, result.manifestPath, result.checksumPath, result.provenancePath, result.licensePath, result.licenseMetadataPath, result.attestationPath]) {
    assertUnder(outputRoot, filePath, filePath)
    assert.equal(filePath.startsWith(root), false, 'generated outputs must not be under repo root')
    assert.equal(fs.existsSync(filePath), true, `${filePath} should exist`)
  }

  if (process.platform !== 'win32') {
    assert.notEqual(fs.statSync(result.helperPath).mode & 0o111, 0, 'helper must be executable on POSIX')
  }

  const manifest = safeReadJson(result.manifestPath)
  assert.deepEqual(manifest, result.manifest)
  assert.equal(manifest.packageName, PACKAGE_NAME)
  assert.equal(manifest.packageVersion, PACKAGE_VERSION)
  assert.equal(manifest.module, MODULE)
  assert.equal(manifest.helperVersion, HELPER_VERSION)
  assert.equal(manifest.protocolVersion, PROTOCOL_VERSION)
  assert.deepEqual(manifest.capabilities, CAPABILITIES)
  assert.equal(manifest.artifact.path, result.summary.artifact)
  assert.equal(manifest.artifact.sha256, sha256(result.helperPath))
  assert.equal(manifest.artifact.executable, true)
  assert.equal(manifest.build.env.GO111MODULE, 'off')
  assert.deepEqual(manifest.build.command, ['go', 'build', '-trimpath', '-o', manifest.artifact.path, '.'])
  assert.equal(manifest.build.cwd, 'kernel/go/agentteam-kernel')
  assert.equal(manifest.build.toolchain, 'go version go1.99.0 agentteam-fake/host')
  assert.equal(manifest.build.generatedAt, FIXED_GENERATED_AT)
  assert.deepEqual(manifest.smoke.tmuxSnapshotParse, { ok: true, paneCount: 1, capturedAt: 1700000000000 })
  assert.deepEqual(manifest.smoke.workerLifecycleInspectPane, { ok: false, acceptedFailureKinds: ['pane-not-found', 'tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'] })
  assert.deepEqual(manifest.smoke.workerLifecycleListAgentTeamPanes, { ok: true, acceptedFailureKinds: ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'] })
  assert.deepEqual(manifest.smoke.workerLifecycleCaptureCurrentPaneBinding, { ok: true, acceptedFailureKinds: ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found'] })
  assert.deepEqual(manifest.smoke.workerLifecycleListPanesInWindow, { ok: true, acceptedFailureKinds: ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'] })
  assert.deepEqual(manifest.smoke.workerLifecycleFindAgentTeamWindowTarget, { ok: true, acceptedFailureKinds: ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found'] })
  assert.deepEqual(manifest.smoke.workerLifecycleFindWindowTargetByName, { ok: true, acceptedFailureKinds: ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found'] })
  assert.deepEqual(manifest.smoke.workerLifecycleSessionExists, { ok: true, acceptedFailureKinds: ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found'] })
  assert.deepEqual(manifest.smoke.workerLifecycleMarkWindowAsAgentTeam, { ok: false, acceptedFailureKinds: ['invalid-target'] })
  assert.deepEqual(manifest.smoke.workerLifecycleRefreshWindowPaneLabels, { ok: false, acceptedFailureKinds: ['invalid-target'] })
  assert.deepEqual(manifest.smoke.workerLifecycleSetPaneLabel, { ok: false, acceptedFailureKinds: ['invalid-pane-id'] })
  assert.deepEqual(manifest.smoke.workerLifecycleClearPaneLabel, { ok: false, acceptedFailureKinds: ['invalid-pane-id'] })
  assert.deepEqual(manifest.smoke.tmuxAvailability, { ok: true, acceptedFailureKinds: ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'] })
  assert.equal(manifest.source.path, 'kernel/go/agentteam-kernel')
  assert.equal(manifest.source.revision, FIXED_REVISION)
  assert.equal(manifest.license.name, 'MIT')
  assert.equal(manifest.license.sha256, sha256(result.licensePath))
  assert.equal(manifest.attestation.kind, 'placeholder-only')
  assert.equal(manifest.attestation.signed, false)

  for (const relPath of [
    manifest.artifact.path,
    manifest.files.helper,
    manifest.files.manifest,
    manifest.files.checksums,
    manifest.files.provenance,
    manifest.files.license,
    manifest.files.licenseMetadata,
    manifest.files.attestation,
    manifest.license.path,
    manifest.license.metadataPath,
    manifest.attestation.path,
  ]) {
    assertSafeRelPath(relPath, relPath)
  }

  const provenance = safeReadJson(result.provenancePath)
  assert.equal(provenance.build.command[1], 'build')
  assert.equal(provenance.build.command[2], '-trimpath')
  assert.equal(provenance.smoke.health, true)
  assert.equal(provenance.smoke.tmuxSnapshotParse.ok, true)
  assert.deepEqual(provenance.smoke.workerLifecycleInspectPane.acceptedFailureKinds, ['pane-not-found', 'tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'])
  assert.deepEqual(provenance.smoke.workerLifecycleListAgentTeamPanes.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'])
  assert.deepEqual(provenance.smoke.workerLifecycleCaptureCurrentPaneBinding.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found'])
  assert.deepEqual(provenance.smoke.workerLifecycleListPanesInWindow.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'])
  assert.deepEqual(provenance.smoke.workerLifecycleFindAgentTeamWindowTarget.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found'])
  assert.deepEqual(provenance.smoke.workerLifecycleFindWindowTargetByName.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found'])
  assert.deepEqual(provenance.smoke.workerLifecycleSessionExists.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found'])
  assert.deepEqual(provenance.smoke.workerLifecycleMarkWindowAsAgentTeam.acceptedFailureKinds, ['invalid-target'])
  assert.deepEqual(provenance.smoke.workerLifecycleRefreshWindowPaneLabels.acceptedFailureKinds, ['invalid-target'])
  assert.deepEqual(provenance.smoke.workerLifecycleSetPaneLabel.acceptedFailureKinds, ['invalid-pane-id'])
  assert.deepEqual(provenance.smoke.workerLifecycleClearPaneLabel.acceptedFailureKinds, ['invalid-pane-id'])
  assert.deepEqual(provenance.smoke.tmuxAvailability.acceptedFailureKinds, ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout'])
  const licenseMetadata = safeReadJson(result.licenseMetadataPath)
  assert.equal(licenseMetadata.path, manifest.license.path)
  assert.equal(licenseMetadata.sha256, sha256(result.licensePath))
  const attestation = JSON.parse(fs.readFileSync(result.attestationPath, 'utf8').trim())
  assert.equal(attestation.predicate.placeholderOnly, true)
  assert.equal(attestation.predicate.signed, false)
  assert.equal(attestation.predicate.signing, 'not-real-signing')

  const checksums = fs.readFileSync(result.checksumPath, 'utf8')
  for (const relPath of [manifest.files.helper, manifest.files.manifest, manifest.files.provenance, manifest.files.license, manifest.files.licenseMetadata, manifest.files.attestation]) {
    assert.ok(checksums.includes(`  ${relPath}\n`), `checksums should include ${relPath}`)
  }
  assertNoLeaks([manifest, provenance, licenseMetadata, attestation, checksums], [root, outputRoot, process.cwd()])

  const records = readFakeGoRecords(recordPath)
  const versionCall = records.find(record => record.kind === 'version')
  const buildCall = records.find(record => record.kind === 'build')
  assert.ok(versionCall, 'builder should check go version')
  assert.ok(buildCall, 'builder should run go build')
  assert.deepEqual(buildCall.args, ['build', '-trimpath', '-o', result.helperPath, '.'])
  assert.equal(buildCall.go111module, 'off')
  assert.equal(toPosix(path.relative(root, buildCall.cwd)), 'kernel/go/agentteam-kernel')
}

function runFakePositive(root) {
  let tempRoot
  try {
    tempRoot = mkTempRoot('agentteam-v0629-builder-positive-')
    const outputRoot = path.join(tempRoot, 'artifact-output')
    const { env, recordPath } = createFakeGoEnv(tempRoot)
    const result = builder.buildGoHelperArtifact({
      extRoot: root,
      outputRoot,
      env,
      generatedAt: FIXED_GENERATED_AT,
      runIdentity: 'suite-fake-run',
      sourceRevision: FIXED_REVISION,
    })
    assertPositiveArtifact(root, outputRoot, result, recordPath)
  } finally {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function runCliFakePositive(root) {
  let tempRoot
  try {
    tempRoot = mkTempRoot('agentteam-v0629-builder-cli-')
    const outputRoot = path.join(tempRoot, 'cli-output')
    const { env } = createFakeGoEnv(tempRoot)
    const cli = path.join(root, 'scripts', 'build-go-helper-artifact.cjs')
    const run = cp.spawnSync(process.execPath, [cli, '--output-root', outputRoot, '--json'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      env,
    })
    assert.equal(run.status, 0, run.stderr)
    const summary = JSON.parse(run.stdout)
    assert.equal(summary.ok, true)
    assert.equal(summary.resultMarker, 'local-helper-artifact-built')
    assert.equal(summary.outputRootKind, 'os-temp')
    assert.equal(summary.helperVersion, HELPER_VERSION)
    assert.equal(summary.smoke.tmuxSnapshotParse, true)
    assert.equal(summary.smoke.workerLifecycleInspectPane, true)
    assert.equal(summary.smoke.workerLifecycleListAgentTeamPanes, true)
    assert.equal(summary.smoke.workerLifecycleCaptureCurrentPaneBinding, true)
    assert.equal(summary.smoke.workerLifecycleListPanesInWindow, true)
    assert.equal(summary.smoke.workerLifecycleFindAgentTeamWindowTarget, true)
    assert.equal(summary.smoke.workerLifecycleFindWindowTargetByName, true)
    assert.equal(summary.smoke.workerLifecycleSessionExists, true)
    assert.equal(summary.smoke.workerLifecycleMarkWindowAsAgentTeam, true)
    assert.equal(summary.smoke.workerLifecycleRefreshWindowPaneLabels, true)
    assert.equal(summary.smoke.workerLifecycleSetPaneLabel, true)
    assert.equal(summary.smoke.workerLifecycleClearPaneLabel, true)
    assert.equal(summary.smoke.tmuxAvailability, true)
    assertSafeRelPath(summary.artifact, 'cli summary artifact')
    assertNoLeaks(summary, [root, outputRoot, process.cwd()])
  } finally {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function runNegativeCases(root) {
  let tempRoot
  try {
    tempRoot = mkTempRoot('agentteam-v0629-builder-negative-')
    const outputRoot = path.join(tempRoot, 'artifact-output')
    const { env } = createFakeGoEnv(tempRoot, { AGENTTEAM_FAKE_GO_FAIL_BUILD: '1' })
    assert.throws(() => builder.buildGoHelperArtifact({
      extRoot: root,
      outputRoot,
      env,
      generatedAt: FIXED_GENERATED_AT,
      runIdentity: 'suite-fail-run',
      sourceRevision: FIXED_REVISION,
    }), error => {
      assertBuilderDiagnostic(error, 'go-build-failed', [root, outputRoot, tempRoot, process.cwd()])
      return true
    })

    const unavailableBin = path.join(tempRoot, 'empty-bin')
    fs.mkdirSync(unavailableBin)
    assert.throws(() => builder.buildGoHelperArtifact({
      extRoot: root,
      outputRoot: path.join(tempRoot, 'unavailable-output'),
      env: { ...process.env, PATH: unavailableBin },
      generatedAt: FIXED_GENERATED_AT,
      runIdentity: 'suite-unavailable-run',
      sourceRevision: FIXED_REVISION,
    }), error => {
      assertBuilderDiagnostic(error, 'go-unavailable', [root, tempRoot, process.cwd()])
      return true
    })

    const skew = createFakeGoEnv(tempRoot, { AGENTTEAM_FAKE_HELPER_VERSION: 'skewed-helper-version' })
    assert.throws(() => builder.buildGoHelperArtifact({
      extRoot: root,
      outputRoot: path.join(tempRoot, 'skew-output'),
      env: skew.env,
      generatedAt: FIXED_GENERATED_AT,
      runIdentity: 'suite-skew-run',
      sourceRevision: FIXED_REVISION,
    }), error => {
      assertBuilderDiagnostic(error, 'metadata-invalid', [root, tempRoot, process.cwd()])
      return true
    })

    assert.throws(() => builder.buildGoHelperArtifact({
      extRoot: root,
      outputRoot: path.join(root, 'v0629-forbidden-output'),
      env: createFakeGoEnv(tempRoot).env,
      generatedAt: FIXED_GENERATED_AT,
      runIdentity: 'suite-forbidden-run',
      sourceRevision: FIXED_REVISION,
    }), error => {
      assertBuilderDiagnostic(error, 'output-root-forbidden', [root, tempRoot, process.cwd()])
      return true
    })

    assert.doesNotThrow(() => builder.assertAllowedOutputRoot(path.join(root, '.agentteam-artifacts', 'reviewer-output'), root), 'ignored repo-local artifact root should be allowed without creating it')
    assert.equal(fs.existsSync(path.join(root, '.agentteam-artifacts')), false, '.agentteam-artifacts must not be created by tests')
  } finally {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function hasGoToolchain() {
  return cp.spawnSync('go', ['version'], { encoding: 'utf8', timeout: 10_000 }).status === 0
}

function runOptionalRealGoBuild(root) {
  if (!hasGoToolchain()) return false
  let tempRoot
  try {
    tempRoot = mkTempRoot('agentteam-v0629-builder-real-')
    const result = builder.buildGoHelperArtifact({
      extRoot: root,
      outputRoot: tempRoot,
      generatedAt: FIXED_GENERATED_AT,
      runIdentity: 'suite-real-go-run',
      sourceRevision: FIXED_REVISION,
    })
    assert.equal(result.summary.ok, true)
    assert.equal(result.summary.helperVersion, HELPER_VERSION)
    assert.equal(result.summary.protocolVersion, PROTOCOL_VERSION)
    assert.equal(result.summary.smoke.health, true)
    assert.equal(result.summary.smoke.tmuxSnapshotParse, true)
    assert.equal(result.summary.smoke.workerLifecycleInspectPane, true)
    assert.equal(result.summary.smoke.workerLifecycleListAgentTeamPanes, true)
    assert.equal(result.summary.smoke.workerLifecycleCaptureCurrentPaneBinding, true)
    assert.equal(result.summary.smoke.workerLifecycleListPanesInWindow, true)
    assert.equal(result.summary.smoke.workerLifecycleFindAgentTeamWindowTarget, true)
    assert.equal(result.summary.smoke.workerLifecycleFindWindowTargetByName, true)
    assert.equal(result.summary.smoke.workerLifecycleSessionExists, true)
    assert.equal(result.summary.smoke.workerLifecycleMarkWindowAsAgentTeam, true)
    assert.equal(result.summary.smoke.workerLifecycleRefreshWindowPaneLabels, true)
    assert.equal(result.summary.smoke.workerLifecycleSetPaneLabel, true)
    assert.equal(result.summary.smoke.workerLifecycleClearPaneLabel, true)
    assert.equal(result.summary.smoke.tmuxAvailability, true)
    assertSafeRelPath(result.summary.artifact, 'real go artifact')
    assertNoLeaks([result.summary, result.manifest], [root, tempRoot, process.cwd()])
    return true
  } finally {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

module.exports = {
  name: 'Go kernel v0.6.29 helper artifact builder',
  async run(env) {
    const root = env.helpers.extRoot
    runFakePositive(root)
    runCliFakePositive(root)
    runNegativeCases(root)
    assertPackageNativeSanity(root)
    assertRuntimeUnchanged(root)
    assertNoRepoGeneratedOutputs(root)
    const realGoBuildRan = runOptionalRealGoBuild(root)
    assert.equal(typeof realGoBuildRan, 'boolean')
  },
}
