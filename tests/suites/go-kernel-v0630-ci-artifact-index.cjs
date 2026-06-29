const assert = require('node:assert/strict')
const cp = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  BUILDER_COMMAND,
  assertWorkflowContract,
  readWorkflow,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const builder = require('../../scripts/lib/go-helper-artifact-builder.cjs')

const DOC = 'docs/perf/v0.6.30-ci-review-artifact-prototype.md'
const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const CAPABILITIES = ['health', 'profile', MODULE, 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability']
const FIXED_GENERATED_AT = '2026-06-12T00:00:00.000Z'
const FIXED_REVISION = 'abcdef0123456789abcdef0123456789abcdef01'
const GITHUB_ENV = {
  GITHUB_REPOSITORY: 'LinYS77/PI-agentteam',
  GITHUB_WORKFLOW: 'Go Helper Review Artifact',
  GITHUB_RUN_ID: '123456789',
  GITHUB_RUN_ATTEMPT: '2',
  GITHUB_SHA: 'fedcba9876543210fedcba9876543210fedcba98',
  GITHUB_REF: 'refs/pull/42/merge',
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function mkTempRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  assert.equal(path.dirname(root), os.tmpdir(), 'temp root must be directly under OS tmpdir')
  return root
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/')
}

function assertSafeRelPath(relPath, label) {
  assert.equal(typeof relPath, 'string', `${label} should be a string`)
  assert.equal(path.isAbsolute(relPath), false, `${label} must be package-relative`)
  assert.equal(relPath.includes('..'), false, `${label} must not traverse`)
  assert.equal(relPath.includes('\\'), false, `${label} must use package-relative POSIX separators`)
}

function assertNoLeaks(value, roots = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'index metadata must not leak absolute paths')
  }
  assert.equal(text.includes(process.cwd()), false, 'index metadata must not leak cwd')
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
  "const fs = require('node:fs')",
  "const input = fs.readFileSync(0, 'utf8').trim()",
  "const request = input ? JSON.parse(input.split('\\\\n')[0]) : {}",
  'const health = ' + JSON.stringify(health),
  "function respond(result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\\\n') }",
  "if (request.method === 'health') respond(health)",
  "else if (request.method === 'tmuxSnapshotParse') respond({ ok: true, capturedAt: Number((request.params || {}).capturedAt || 0), panes: [{ paneId: '%1', target: 'test:@1', label: 'team-lead', currentCommand: 'pi' }], byPaneId: { '%1': { paneId: '%1', target: 'test:@1', label: 'team-lead', currentCommand: 'pi' } } })",
  "else if (request.method === 'workerLifecycle') { const params = request.params || {}; if (params.operation === 'listAgentTeamPanes') respond({ ok: true, operation: 'listAgentTeamPanes', capability: 'workerLifecycle', panes: [], byPaneId: {}, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'captureCurrentPaneBinding') respond({ ok: true, operation: 'captureCurrentPaneBinding', capability: 'workerLifecycle', paneId: '%fake-current', target: 'test:@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'listPanesInWindow') respond({ ok: true, operation: 'listPanesInWindow', capability: 'workerLifecycle', target: params.target || 'test:@1', exists: true, paneIds: ['%fake-current'], readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findAgentTeamWindowTarget') respond({ ok: true, operation: 'findAgentTeamWindowTarget', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'findWindowTargetByName') respond({ ok: true, operation: 'findWindowTargetByName', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', windowName: params.windowName || 'agentteam', exists: true, target: (params.sessionName || 'test') + ':@1', windowId: '@1', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'sessionExists') respond({ ok: true, operation: 'sessionExists', capability: 'workerLifecycle', sessionName: params.sessionName || 'test', exists: true, readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }); else if (params.operation === 'markWindowAsAgentTeam') respond({ ok: false, operation: 'markWindowAsAgentTeam', capability: 'workerLifecycle', target: '', marked: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', error: 'Go worker lifecycle markWindowAsAgentTeam unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'refreshWindowPaneLabels') respond({ ok: false, operation: 'refreshWindowPaneLabels', capability: 'workerLifecycle', target: '', refreshed: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle refreshWindowPaneLabels unavailable (invalid-target)', error: 'Go worker lifecycle refreshWindowPaneLabels unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'createTeammatePane') respond({ ok: false, operation: 'createTeammatePane', capability: 'workerLifecycle', target: '', paneId: '', created: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-target', reason: 'Go worker lifecycle createTeammatePane unavailable (invalid-target)', error: 'Go worker lifecycle createTeammatePane unavailable (invalid-target)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'clearPaneLabel') respond({ ok: false, operation: 'clearPaneLabel', capability: 'workerLifecycle', paneId: '', cleared: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-pane-id', reason: 'Go worker lifecycle clearPaneLabel unavailable (invalid-pane-id)', error: 'Go worker lifecycle clearPaneLabel unavailable (invalid-pane-id)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else if (params.operation === 'setPaneLabel') respond({ ok: false, operation: 'setPaneLabel', capability: 'workerLifecycle', paneId: '', labeled: false, status: 'unknown', resultMarker: 'stale', failureKind: 'invalid-pane-id', reason: 'Go worker lifecycle setPaneLabel unavailable (invalid-pane-id)', error: 'Go worker lifecycle setPaneLabel unavailable (invalid-pane-id)', readOnly: false, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: true }); else respond({ ok: false, operation: 'inspectPane', capability: 'workerLifecycle', paneId: params.paneId || '', requestedPaneId: params.paneId || '', exists: false, status: 'unknown', resultMarker: 'stale', failureKind: 'pane-not-found', reason: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', error: 'Go worker lifecycle inspectPane unavailable (pane-not-found)', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false }) }",
  "else if (request.method === 'tmuxAvailability') respond({ ok: true, capability: 'tmuxAvailability', available: true, version: 'tmux 3.4', readOnly: true, stateFilesRead: false, stateFilesWritten: false, tmuxMutation: false })",
  "else process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'method not found' } }) + '\\\\n')",
].join('\\n') + '\\n'
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, helperSource, 'utf8')
if (process.platform !== 'win32') fs.chmodSync(output, 0o755)
`, 'utf8')
  fs.chmodSync(fakeGoPath, 0o755)
}

function createFakeGoEnv(tempRoot, overrides = {}) {
  const binDir = path.join(tempRoot, 'fake-bin')
  writeFakeGo(binDir)
  return {
    ...process.env,
    ...overrides,
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
  }
}

function assertFileRows(outputRoot, index, expectedRows) {
  assert.equal(index.files.length, expectedRows.length, 'index file list should cover generated artifact files only')
  const byKind = new Map(index.files.map(row => [row.kind, row]))
  for (const [kind, relPath] of expectedRows) {
    const row = byKind.get(kind)
    assert.ok(row, `index should include ${kind}`)
    assert.equal(row.path, relPath, `${kind} path should match generated metadata`)
    assertSafeRelPath(row.path, `${kind} path`)
    const filePath = path.join(outputRoot, row.path)
    assert.equal(fs.existsSync(filePath), true, `${kind} file should exist`)
    assert.equal(row.sha256, sha256(filePath), `${kind} sha256 should match actual bytes`)
    assert.equal(row.size, fs.statSync(filePath).size, `${kind} size should match actual bytes`)
  }
}

function assertArtifactIndex(root, outputRoot, result, expectedGithub) {
  assert.ok(result.artifactIndexPath, 'artifact index path should be returned when enabled')
  assert.equal(result.summary.files.artifactIndex, toPosix(path.relative(outputRoot, result.artifactIndexPath)))
  assertSafeRelPath(result.summary.files.artifactIndex, 'summary artifact index')
  assert.equal(fs.existsSync(result.artifactIndexPath), true, 'artifact-index.json should exist')
  assert.equal(result.artifactIndexPath.startsWith(root), false, 'artifact-index.json must not be under repo root')

  const index = readJson(result.artifactIndexPath)
  assert.deepEqual(index, result.artifactIndex)
  assert.equal(index.schemaVersion, 1)
  assert.equal(index.packageName, PACKAGE_NAME)
  assert.equal(index.packageVersion, PACKAGE_VERSION)
  assert.equal(index.module, MODULE)
  assert.equal(index.capability, MODULE)
  assert.equal(index.helperVersion, HELPER_VERSION)
  assert.equal(index.protocolVersion, PROTOCOL_VERSION)
  assert.equal(index.target, result.summary.target)
  assert.deepEqual(index.platform, result.manifest.platform)
  assert.equal(index.sourceRevision, FIXED_REVISION)
  assert.equal(index.generatedAt, FIXED_GENERATED_AT)
  assert.deepEqual(index.github, expectedGithub)
  assert.equal(index.reviewOnly, true)
  assert.equal(index.releaseAsset, false)
  assert.equal(index.installSource, false)
  assert.equal(index.normalUserAvailability, false)
  assert.deepEqual(index.retentionHint, { kind: 'github-actions-artifact', days: 7 })
  assert.equal(index.expiresHint, 'retention-days:7')

  assertFileRows(outputRoot, index, [
    ['helper', result.summary.artifact],
    ['manifest', result.summary.files.manifest],
    ['checksums', result.summary.files.checksums],
    ['provenance', result.summary.files.provenance],
    ['license', result.summary.files.license],
    ['license-metadata', result.summary.files.licenseMetadata],
    ['attestation', result.summary.files.attestation],
  ])
  assertNoLeaks([index, result.summary], [root, outputRoot, process.cwd()])
}

function runBuilderIndexPositive(root) {
  let tempRoot
  try {
    tempRoot = mkTempRoot('agentteam-v0630-index-positive-')
    const outputRoot = path.join(tempRoot, 'artifact-output')
    const env = createFakeGoEnv(tempRoot, GITHUB_ENV)
    const result = builder.buildGoHelperArtifact({
      extRoot: root,
      outputRoot,
      env,
      artifactIndex: true,
      generatedAt: FIXED_GENERATED_AT,
      runIdentity: 'suite-index-run',
      sourceRevision: FIXED_REVISION,
    })
    assertArtifactIndex(root, outputRoot, result, {
      repository: GITHUB_ENV.GITHUB_REPOSITORY,
      workflow: 'Go-Helper-Review-Artifact',
      runId: GITHUB_ENV.GITHUB_RUN_ID,
      runAttempt: GITHUB_ENV.GITHUB_RUN_ATTEMPT,
      sha: GITHUB_ENV.GITHUB_SHA,
      ref: GITHUB_ENV.GITHUB_REF,
    })
    assert.equal(readJson(result.manifestPath).files.artifactIndex, undefined, 'manifest schema must not depend on artifact-index')
    assert.equal(readJson(result.provenancePath).artifactIndex, undefined, 'provenance schema must not depend on artifact-index')
  } finally {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function runBuilderIndexUnknownGithub(root) {
  let tempRoot
  try {
    tempRoot = mkTempRoot('agentteam-v0630-index-unknown-')
    const outputRoot = path.join(tempRoot, 'artifact-output')
    const env = createFakeGoEnv(tempRoot, {
      GITHUB_REPOSITORY: '',
      GITHUB_WORKFLOW: '',
      GITHUB_RUN_ID: '',
      GITHUB_RUN_ATTEMPT: '',
      GITHUB_SHA: '',
      GITHUB_REF: '',
    })
    const result = builder.buildGoHelperArtifact({
      extRoot: root,
      outputRoot,
      env,
      ciReview: true,
      generatedAt: FIXED_GENERATED_AT,
      runIdentity: 'suite-index-unknown-run',
      sourceRevision: FIXED_REVISION,
    })
    assertArtifactIndex(root, outputRoot, result, {
      repository: 'unknown-repository',
      workflow: 'unknown-workflow',
      runId: 'unknown-run-id',
      runAttempt: 'unknown-run-attempt',
      sha: 'unknown-sha',
      ref: 'unknown-ref',
    })
  } finally {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function runCliIndexPositive(root) {
  let tempRoot
  try {
    tempRoot = mkTempRoot('agentteam-v0630-index-cli-')
    const outputRoot = path.join(tempRoot, 'cli-output')
    const env = createFakeGoEnv(tempRoot, GITHUB_ENV)
    const cli = path.join(root, 'scripts', 'build-go-helper-artifact.cjs')
    const run = cp.spawnSync(process.execPath, [cli, '--output-root', outputRoot, '--ci-review', '--json'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      env,
    })
    assert.equal(run.status, 0, run.stderr)
    const summary = JSON.parse(run.stdout)
    assert.equal(summary.ok, true)
    assert.equal(summary.files.artifactIndex.endsWith('/artifact-index.json'), true, 'CLI summary should include artifact-index path')
    assertSafeRelPath(summary.files.artifactIndex, 'cli artifact index')
    assert.equal(fs.existsSync(path.join(outputRoot, summary.files.artifactIndex)), true, 'CLI should write artifact-index.json')
    assertNoLeaks(summary, [root, outputRoot, process.cwd()])
  } finally {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function assertRuntimeIndependent(root) {
  const kernel = fs.readFileSync(path.join(root, 'core', 'kernel.ts'), 'utf8')
  const resolver = fs.readFileSync(path.join(root, 'core', 'kernelPackagedResolver.ts'), 'utf8')
  assert.equal(/artifact-index|artifactIndex/.test(kernel), false, 'runtime kernel must not read/use artifact-index')
  assert.equal(/artifact-index|artifactIndex/.test(resolver), false, 'packaged resolver must not read/use artifact-index')
}

function assertPackageNativeSanity(root) {
  const packageJson = readJson(path.join(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain unchanged')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact-index|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include native/helper/generated/index outputs')
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
}

function assertNoGeneratedCommitted(root) {
  const forbidden = []
  function walk(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const full = path.join(dir, entry.name)
      const rel = toPosix(path.relative(root, full))
      if (entry.isDirectory()) walk(full)
      else if (!rel.startsWith('tests/suites/') && !rel.startsWith('tests/helpers/') && !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam') && (/artifact-index\.json$/i.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|zip)$/i.test(rel))) forbidden.push(rel)
    }
  }
  walk(root)
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated artifact indexes or native artifacts')
}

function assertDocAndWorkflow(root) {
  const doc = fs.readFileSync(path.join(root, DOC), 'utf8')
  for (const expected of [
    'Slice 2 — Builder CI Mode and Artifact Index',
    '`--artifact-index`',
    '`--ci-review`',
    '`artifact-index.json`',
    'review/transport metadata, not runtime resolver input',
    '`reviewOnly: true`',
    '`releaseAsset: false`',
    '`installSource: false`',
    '`normalUserAvailability: false`',
    'package-relative paths only',
    'No artifact download/reverify verifier in Slice 2',
    'No matrix expansion in Slice 2',
  ]) {
    assert.ok(doc.includes(expected), `doc should include ${expected}`)
  }
  assertWorkflowContract(root)
  const workflow = readWorkflow(root)
  assert.ok(workflow.includes(BUILDER_COMMAND), 'workflow should invoke builder in CI review index mode')
  assert.ok(workflow.includes('artifact-index.json'), 'workflow should assert artifact-index.json exists before upload')
}

module.exports = {
  name: 'Go kernel v0.6.30 CI artifact index',
  async run(env) {
    const root = env.helpers.extRoot
    runBuilderIndexPositive(root)
    runBuilderIndexUnknownGithub(root)
    runCliIndexPositive(root)
    assertDocAndWorkflow(root)
    assertRuntimeIndependent(root)
    assertPackageNativeSanity(root)
    assertNoGeneratedCommitted(root)
  },
}
