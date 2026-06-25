const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.23-compact-native-failure-diagnostics.md'
const PLAN = 'docs/agentteam方案书.md'
const EXPECTED_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const REQUIRED_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint']
const SAFE_DIAGNOSTIC_KEYS = ['module', 'capability', 'status', 'resultMarker', 'failureKind', 'remediation', 'platformHint', 'freshnessHint', 'releaseDecision'].sort()
const SENTINELS = {
  helperPath: 'v0423-parser-policy-secret-helper-path',
  stdout: 'V0423_POLICY_STDOUT_SHOULD_NOT_LEAK',
  stderr: 'V0423_POLICY_STDERR_SHOULD_NOT_LEAK',
  repo: '/tmp/v0423-policy-repo-SHOULD_NOT_LEAK',
  cwd: '/tmp/v0423-policy-cwd-SHOULD_NOT_LEAK',
  rawCutoverReason: 'V0423_POLICY_RAW_CUTOVER_REASON_SHOULD_NOT_LEAK',
  rawTeamJson: '{"team":{"raw":"V0423_POLICY_RAW_TEAM_JSON_SHOULD_NOT_LEAK"}}',
  sidecar: 'V0423_POLICY_SIDECAR_SHOULD_NOT_LEAK',
  cache: 'V0423_POLICY_CACHE_SHOULD_NOT_LEAK',
  index: 'V0423_POLICY_INDEX_SHOULD_NOT_LEAK',
  manifest: 'V0423_POLICY_RAW_MANIFEST_CHECKSUM_PROVENANCE_SHOULD_NOT_LEAK',
  workerPrompt: 'V0423_POLICY_WORKER_PROMPT_SHOULD_NOT_LEAK',
  stack: 'V0423_POLICY_STACK_TRACE_SHOULD_NOT_LEAK',
  mailbox: 'V0423_POLICY_MAILBOX_REPORT_TEXT_SHOULD_NOT_LEAK',
  packageInternal: '@earendil-works/agentteam-native-secret-internal',
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
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
function validSnapshot(extra) {
  return {
    capturedAt: request.params.capturedAt,
    panes: [{ paneId: '%go', target: 'go:@1', label: 'go', currentCommand: 'pi' }],
    byPaneId: { '%go': { paneId: '%go', target: 'go:@1', label: 'go', currentCommand: 'pi' } },
    ok: true,
    ...(extra || {}),
  }
}
${handlerSource}
`
}

function writeHelper(root, name, source) {
  const file = path.join(root, SENTINELS.helperPath, `${name}.cjs`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, source, 'utf8')
  fs.chmodSync(file, 0o755)
  return file
}

function throwingFallback() {
  throw new Error('TypeScript parser fallback must not be called in v0.4.23 cutover/preview failure policy regression')
}

function assertNoForbiddenLeaks(value, label) {
  const serialized = JSON.stringify(value)
  for (const [name, sentinel] of Object.entries(SENTINELS)) {
    assert.equal(serialized.includes(sentinel), false, `${label} must not leak ${name}`)
  }
  assert.equal(serialized.includes('/tmp/v0423-policy-repo'), false, `${label} must not leak repo path prefix`)
  assert.equal(serialized.includes('/tmp/v0423-policy-cwd'), false, `${label} must not leak cwd path prefix`)
}

function assertNoMigrationFallback(metadata, label) {
  assert.equal(metadata.kernel.fallbacks, 0, `${label} must not increment migration fallback count`)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackKind'), false, `${label} must not expose migration fallbackKind`)
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.kernel, 'fallbackReason'), false, `${label} must not expose migration fallbackReason`)
}

function assertCompactDiagnostic(diagnostics, expectedKind, label) {
  const diagnostic = diagnostics.createTmuxSnapshotParseFailureDiagnostic(expectedKind)
  assert.deepEqual(Object.keys(diagnostic).sort(), Object.keys(diagnostic).sort().filter(key => SAFE_DIAGNOSTIC_KEYS.includes(key)), `${label} diagnostic should only expose safe keys`)
  assert.equal(diagnostic.module, 'tmuxSnapshotParse', `${label} diagnostic module`)
  assert.equal(diagnostic.capability, 'tmuxSnapshotParse', `${label} diagnostic capability`)
  assert.equal(diagnostic.status, 'unknown', `${label} diagnostic status`)
  assert.equal(diagnostic.resultMarker, 'stale', `${label} diagnostic resultMarker`)
  assert.equal(diagnostic.failureKind, expectedKind, `${label} diagnostic failureKind`)
  assert.ok(diagnostic.remediation && diagnostic.remediation.length <= 140, `${label} diagnostic remediation should be short`)
  assert.ok(diagnostic.platformHint || diagnostic.freshnessHint, `${label} diagnostic should include platform/freshness hint`)
  assert.equal(diagnostic.releaseDecision, 'docs/perf/v0.4.23-compact-native-failure-diagnostics.md', `${label} diagnostic release decision`)
  assertNoForbiddenLeaks(diagnostic, `${label} diagnostic`)
  return diagnostic
}

function assertFailClosedPolicy(adapter, snapshot, diagnostics, expectedKind, expectedMode, expectedCalls, label) {
  assert.equal(snapshot.ok, false, `${label} snapshot ok:false`)
  assert.equal(snapshot.status, 'unknown', `${label} snapshot status`)
  assert.equal(snapshot.resultMarker, 'stale', `${label} snapshot resultMarker`)
  assert.deepEqual(snapshot.panes, [], `${label} snapshot panes must be empty`)
  assert.deepEqual(snapshot.byPaneId, {}, `${label} snapshot byPaneId must be empty`)
  assert.notEqual(snapshot.ok, true, `${label} must not be false successful empty snapshot`)
  assert.equal(snapshot.module, 'tmuxSnapshotParse', `${label} snapshot module`)
  assert.equal(snapshot.capability, 'tmuxSnapshotParse', `${label} snapshot capability`)
  assert.equal(snapshot.cutoverFailureKind, expectedKind, `${label} snapshot cutoverFailureKind`)
  assert.match(snapshot.reason, new RegExp(`Go kernel cutover unavailable \\(${expectedKind}\\)`), `${label} snapshot reason compact kind`)
  assert.match(snapshot.error, new RegExp(`Go kernel cutover unavailable \\(${expectedKind}\\)`), `${label} snapshot error compact kind`)
  assert.ok(String(snapshot.reason).length <= 220, `${label} snapshot reason compact length`)
  assert.ok(String(snapshot.error).length <= 220, `${label} snapshot error compact length`)
  assertNoForbiddenLeaks(snapshot, `${label} snapshot`)

  const metadata = adapter.metadata()
  assert.equal(metadata.kernel.requestedMode, expectedMode, `${label} metadata requestedMode`)
  assert.equal(metadata.kernel.mode, 'typescript', `${label} metadata mode after failure`)
  assert.equal(metadata.kernel.enabled, false, `${label} metadata enabled after failure`)
  assert.equal(metadata.kernel.calls, expectedCalls, `${label} metadata helper call count`)
  assert.equal(metadata.kernel.cutoverModule, 'tmuxSnapshotParse', `${label} metadata cutover module`)
  assert.equal(metadata.kernel.cutoverStatus, 'unavailable', `${label} metadata cutover status`)
  assert.equal(metadata.kernel.cutoverFailureKind, expectedKind, `${label} metadata cutover failure kind`)
  assert.match(metadata.kernel.cutoverReason, new RegExp(`Go kernel cutover unavailable \\(${expectedKind}\\)`), `${label} metadata cutover reason compact kind`)
  assertNoMigrationFallback(metadata, `${label} metadata`)
  assertNoForbiddenLeaks(metadata, `${label} metadata`)

  const diagnostic = assertCompactDiagnostic(diagnostics, expectedKind, label)
  assertNoForbiddenLeaks({ snapshot, metadata, diagnostic }, `${label} combined readiness-relevant surface`)
}

function assertRuntimeUiQuiet(root) {
  for (const rel of ['teamPanel/dataSource.ts', 'teamPanel/viewModel.ts', 'teamPanel/readModel.ts', 'teamPanel.ts', 'renderers.ts']) {
    const source = read(root, rel)
    assert.equal(/cutoverReason/.test(source), false, `${rel} must not render raw cutoverReason`)
    assert.equal(/PI_AGENTTEAM_KERNEL_PACKAGED_HELPER|go-packaged-preview/.test(source), false, `${rel} must not branch on packaged preview`)
    assert.equal(/releaseDecision|platformHint|freshnessHint|remediation/.test(source), false, `${rel} must not render compact diagnostics yet`)
  }
}

function assertPanelBoundarySource(root) {
  const dataSource = read(root, 'teamPanel/dataSource.ts')
  const runtime = read(root, 'adapters/tmux/teamPanes.ts')
  assert.match(dataSource, /snapshotForOrphanDiscovery/, 'data source should isolate orphan discovery snapshot selection')
  assert.match(dataSource, /snapshot\.module === 'tmuxSnapshotParse'/, 'cutover orphan discovery should require module marker')
  assert.match(dataSource, /snapshot\.capability === 'tmuxSnapshotParse'/, 'cutover orphan discovery should require capability marker')
  assert.match(dataSource, /Boolean\(snapshot\.cutoverFailureKind\)/, 'cutover orphan discovery should require cutover failure marker')
  assert.match(dataSource, /snapshot\?\.ok === false \? undefined : snapshot/, 'generic ok:false fallback behavior should stay explicit')
  assert.match(runtime, /snapshot\?\.ok === false[\s\S]*return false/, 'parser-unavailable reconcile should short-circuit non-destructively')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, EXPECTED_VERSION, 'package version must remain unchanged')
  assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'package.json#files must exclude kernel/')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package.json#files must exclude native/helper/generated artifacts')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    assert.equal(/go\s+(?:build|install)\b/.test(command), false, `${name} must not build/install helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild/i.test(command), false, `${name} must not download/build native helper`)
    assert.equal(/kernel\//i.test(command) && /pack|publish|files|npm/i.test(command), false, `${name} must not package kernel/native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
  const nativeArtifacts = walkFiles(root)
    .filter(file => !file.includes(`${path.sep}node_modules${path.sep}`) && !file.includes(`${path.sep}.git${path.sep}`))
    .filter(file => /\.(?:exe|dll|so|dylib|tgz)$/i.test(file))
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
  assert.deepEqual(nativeArtifacts, [], 'native/package artifacts must not be checked in')
}

module.exports = {
  name: 'Go kernel v0.4.23 parser failure policy regression',
  async run(env) {
    const root = env.helpers.extRoot
    const kernel = env.helpers.requireDist('core/kernel.js')
    const diagnostics = env.helpers.requireDist('core/kernelDiagnostics.js')
    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    assert.ok(doc.includes('## Slice 3 Parser Failure Policy Regression Evidence'), 'diagnostics doc should include Slice 3 evidence')
    assert.ok(plan.includes('tests/suites/go-kernel-v0423-parser-failure-policy.cjs'), 'roadmap should reference Slice 3 policy suite')

    let fallbackCalls = 0
    const countedThrowingFallback = () => {
      fallbackCalls += 1
      return throwingFallback()
    }
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0423-parser-policy-'))
    try {
      const missingCutover = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', helperPath: path.join(tempRoot, SENTINELS.helperPath, 'missing-helper') })
      const missingCutoverSnapshot = missingCutover.parseTmuxPaneSnapshot(`%ts\t${SENTINELS.repo}\t${SENTINELS.mailbox}\tpi`, 1700008000001, countedThrowingFallback)
      assertFailClosedPolicy(missingCutover, missingCutoverSnapshot, diagnostics, 'missing-helper', 'go-cutover', 0, 'go-cutover missing helper')

      const wrongVersionHelper = writeHelper(tempRoot, 'wrong-version-helper', helperSource(`
if (request.method === 'health') respond({ ...baseHealth, helperVersion: '9.9.9-' + leak.stdout, protocolVersion: 1 })
else respond(validSnapshot())
`))
      const previewWrongVersion = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', packagedHelperPath: wrongVersionHelper, env: { PATH: process.env.PATH } })
      const previewWrongVersionSnapshot = previewWrongVersion.parseTmuxPaneSnapshot(`%ts\t${SENTINELS.cwd}\t${SENTINELS.rawTeamJson}\tpi`, 1700008000002, countedThrowingFallback)
      assertFailClosedPolicy(previewWrongVersion, previewWrongVersionSnapshot, diagnostics, 'helper-unsupported-version', 'go-packaged-preview', 1, 'go-packaged-preview wrong version')

      const unsafeHelper = writeHelper(tempRoot, 'unsafe-helper', helperSource(`
if (request.method === 'health') respond(baseHealth)
else respond(validSnapshot({
  rawCutoverReason: leak.rawCutoverReason,
  stdout: leak.stdout,
  stderr: leak.stderr,
  repo: leak.repo,
  cwd: leak.cwd,
  rawTeamJson: leak.rawTeamJson,
  sidecar: leak.sidecar,
  cache: leak.cache,
  index: leak.index,
  manifest: leak.manifest,
  workerPrompt: leak.workerPrompt,
  stack: leak.stack,
  mailbox: leak.mailbox,
  packageInternal: leak.packageInternal,
}))
`))
      const cutoverUnsafe = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', helperPath: unsafeHelper, env: { PATH: process.env.PATH } })
      const cutoverUnsafeSnapshot = cutoverUnsafe.parseTmuxPaneSnapshot(`%ts\t${SENTINELS.repo}\t${SENTINELS.packageInternal}\tpi`, 1700008000003, countedThrowingFallback)
      assertFailClosedPolicy(cutoverUnsafe, cutoverUnsafeSnapshot, diagnostics, 'helper-unsafe-response-shape', 'go-cutover', 2, 'go-cutover unsafe response')

      const previewMissing = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: { PATH: process.env.PATH } })
      const previewMissingSnapshot = previewMissing.parseTmuxPaneSnapshot(`%ts\t${SENTINELS.cwd}\t${SENTINELS.workerPrompt}\tpi`, 1700008000004, countedThrowingFallback)
      assertFailClosedPolicy(previewMissing, previewMissingSnapshot, diagnostics, 'missing-helper', 'go-packaged-preview', 0, 'go-packaged-preview missing helper')

      assert.equal(fallbackCalls, 0, 'TypeScript parser fallback must not be called in cutover/preview failure paths')
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }

    const defaultMetadata = kernel.createAgentTeamKernelAdapter({ env: {} }).metadata()
    assert.equal(defaultMetadata.kernel.requestedMode, 'default', 'unset mode should normalize to default after v0.6.48')
    assert.equal(defaultMetadata.kernel.mode, 'go', 'unset mode should use embedded Go for tmuxSnapshotParse')
    assert.equal(defaultMetadata.kernel.enabled, true, 'default embedded helper should enable parser-only Go')
    assert.equal(defaultMetadata.kernel.cutoverStatus, 'active', 'default embedded helper should be active')

    const readModelBench = require(path.join(root, 'tests/bench/team-read-model-baseline.cjs'))
    assert.equal(readModelBench.shouldRunShadow('go-cutover'), false, 'go-cutover should not run read-model shadow')
    assert.equal(readModelBench.shouldRunShadow('go-packaged-preview'), false, 'preview mode should not run read-model shadow')

    assertRuntimeUiQuiet(root)
    assertPanelBoundarySource(root)
    assertPackageNativeSanity(root)
  },
}
