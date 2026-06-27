const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  APPROVED_EMBEDDED_NATIVE_FILES,
  APPROVED_EMBEDDED_NATIVE_PREFIX,
  DEFAULT_GO_CUTOVER_SCHEMA_VERSION,
  DEFAULT_GO_CUTOVER_THEME,
  EXPLICIT_PREVIEW_MODE,
  FAILURE_CLASSES,
  GO_AUTHORITY,
  HELPER_VERSION,
  PACKAGE_RELEASE_GUARDS,
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  REQUIRED_CAPABILITIES,
  ROLLBACK_MODES,
  SELECTED_MODULE,
  TS_AUTHORITY,
  defaultGoCutoverTmuxSnapshot,
} = require('../fixtures/kernel/v0648/defaultGoCutoverTmuxSnapshot.cjs')
const { cases } = require('../fixtures/kernel/tmux/snapshotCases.cjs')

const DOC = 'docs/perf/v0.6.48-default-go-cutover-tmux-snapshot.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0648/defaultGoCutoverTmuxSnapshot.cjs'
const SUITE = 'tests/suites/go-kernel-v0648-default-go-cutover-tmux-snapshot.cjs'
const MANIFEST = `${APPROVED_EMBEDDED_NATIVE_PREFIX}manifest.json`
const HELPER = `${APPROVED_EMBEDDED_NATIVE_PREFIX}agentteam-tmuxSnapshotParse`
const ROOT_FORBIDDEN_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
]
const RELEASE_OVERCLAIMS = [
  'v0.7 release-ready approval is granted',
  'v0.7 is release-ready',
  'v0.7 is release ready',
  'ready for release',
  'release can ship',
  'npm publish completed',
  'npm version completed',
  'tag/release created: true',
  'tag was created',
  'GitHub release created',
  'native package approved: true',
  'native helper package approved: true',
  'signing approved: true',
  'second platform support approved: true',
]
const REQUIRED_DOC = [
  '# v0.6.48 Default-Go Cutover For tmuxSnapshotParse',
  'Result: v0.6.48 enables the approved actual default-Go cutover for `tmuxSnapshotParse` only.',
  'default/unset and explicit `go` resolve the embedded main-package helper manifest',
  '`tmux/snapshot.ts` no longer contains a TypeScript runtime parser fallback.',
  'missing, unsupported, integrity-failed, and incompatible helper paths return an unknown/stale snapshot',
  '`disabled` and `typescript` remain the rollback/default-disable modes',
  '`go-packaged-preview` remains explicit preview-only behavior',
  '`compactReadModelFingerprint` remains TypeScript-owned for default/`go` cutover behavior',
  'Go still does not execute tmux, capture panes, own pane/session/worker lifecycle, write state, govern task/report/PlanRun, read full-text mailbox/report bodies, render UI, or manage package/release behavior.',
  'No `npm version`, `npm publish`, tag, GitHub release, lockfile, `go.mod`, or `go.sum` is introduced.',
  'Package/release/signing/second-platform approval remains false.',
  '`native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/`',
  '`tests/fixtures/kernel/v0648/defaultGoCutoverTmuxSnapshot.cjs`',
  '`tests/suites/go-kernel-v0648-default-go-cutover-tmux-snapshot.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.48 actual default-Go cutover for `tmuxSnapshotParse`',
  'docs/perf/v0.6.48-default-go-cutover-tmux-snapshot.md',
  'default/unset 与 explicit `go` 进入 embedded helper cutover path',
  '该切片历史事实仍限定为 parser-only',
  'v0.6.49 对 post-v0.6.49 future-only boundary 做架构 supersede',
  'rollback/default-disable 仍通过 `disabled` 或 `typescript` 模式完成',
  '**v0.6.48 actual default-Go cutover for `tmuxSnapshotParse`**',
]
const FORBIDDEN_ARTIFACT = /(?:^|\/)(?:pi-agentteam-.*\.tgz|.*\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig))$/i
const FORBIDDEN_RAW_EVIDENCE = /(?:^|\/)(?:.*v0648.*raw.*|.*default-go-cutover.*\.json|.*raw-tmux.*|.*tmux.*stdout.*|.*tmux.*stderr.*|.*state-archive.*|.*raw-state.*|.*mailbox.*body.*|.*report.*body.*|.*worker.*transcript.*|.*terminal.*raw.*log.*)$/i

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
}

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'data') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertNoReleaseOverclaims(source, label) {
  for (const forbidden of RELEASE_OVERCLAIMS) assert.equal(source.includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
}

function assertNoLeak(value, rawInputs = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  assert.equal(text.includes(process.cwd()), false, 'diagnostics must not leak process cwd')
  for (const rawInput of rawInputs) assert.equal(text.includes(rawInput), false, 'diagnostics must not leak raw tmux stdout')
  assert.equal(/MAILBOX_BODY|REPORT_BODY|worker transcript|rawState|stateArchive|stdout\s*:|stderr\s*:|stack|AssertionError|\bat\s+/i.test(text), false, 'diagnostics must stay compact')
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(defaultGoCutoverTmuxSnapshot)), defaultGoCutoverTmuxSnapshot, 'fixture should be deterministic plain data')
  assert.equal(defaultGoCutoverTmuxSnapshot.schemaVersion, DEFAULT_GO_CUTOVER_SCHEMA_VERSION)
  assert.equal(defaultGoCutoverTmuxSnapshot.theme, DEFAULT_GO_CUTOVER_THEME)
  assert.equal(defaultGoCutoverTmuxSnapshot.packageVersion, PACKAGE_VERSION)
  assert.equal(defaultGoCutoverTmuxSnapshot.selectedModule, SELECTED_MODULE)
  assert.equal(defaultGoCutoverTmuxSnapshot.helperVersion, HELPER_VERSION)
  assert.equal(defaultGoCutoverTmuxSnapshot.protocolVersion, PROTOCOL_VERSION)
  assert.equal(defaultGoCutoverTmuxSnapshot.approvedEmbeddedNativePrefix, APPROVED_EMBEDDED_NATIVE_PREFIX)
  assert.deepEqual(defaultGoCutoverTmuxSnapshot.approvedEmbeddedNativeFiles, [...APPROVED_EMBEDDED_NATIVE_FILES])
  assert.deepEqual(defaultGoCutoverTmuxSnapshot.requiredCapabilities, [...REQUIRED_CAPABILITIES])
  assert.deepEqual(defaultGoCutoverTmuxSnapshot.failureClasses, [...FAILURE_CLASSES])
  assert.deepEqual(defaultGoCutoverTmuxSnapshot.rollbackModes, [...ROLLBACK_MODES])
  assert.equal(defaultGoCutoverTmuxSnapshot.explicitPreviewMode, EXPLICIT_PREVIEW_MODE)
  assert.equal(defaultGoCutoverTmuxSnapshot.goAuthority, GO_AUTHORITY)
  assert.deepEqual(defaultGoCutoverTmuxSnapshot.tsAuthority, [...TS_AUTHORITY])
  assert.deepEqual(defaultGoCutoverTmuxSnapshot.packageReleaseGuards, [...PACKAGE_RELEASE_GUARDS])
  assert.equal(defaultGoCutoverTmuxSnapshot.fallbackDeleted, true)
  assert.equal(defaultGoCutoverTmuxSnapshot.defaultGoEnabled, true)
  assert.equal(defaultGoCutoverTmuxSnapshot.defaultResolverEnabled, true)
  assert.equal(defaultGoCutoverTmuxSnapshot.defaultResolverSource, 'main-package-embedded-helper-manifest')
  assert.equal(defaultGoCutoverTmuxSnapshot.packageReleaseApproved, false)
  assert.equal(defaultGoCutoverTmuxSnapshot.nativePackageManagerDeliveryApproved, false)
  assert.equal(defaultGoCutoverTmuxSnapshot.signingApproved, false)
  assert.equal(defaultGoCutoverTmuxSnapshot.secondPlatformSupportApproved, false)
}

function assertDocs(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  assert.equal(exists(root, ROADMAP), true, `${ROADMAP} should exist`)
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoReleaseOverclaims(doc, DOC)
  assertNoReleaseOverclaims(roadmap, ROADMAP)
  assert.equal(/"records"\s*:|"profileSummary"\s*:|"runId"\s*:|"jobs"\s*:|"stdout"\s*:|"stderr"\s*:/i.test(doc), false, `${DOC} must not embed raw JSON evidence`)
}

function assertEmbeddedManifest(root) {
  assert.equal(exists(root, MANIFEST), true, `${MANIFEST} should exist`)
  assert.equal(exists(root, HELPER), true, `${HELPER} should exist`)
  const manifest = JSON.parse(read(root, MANIFEST))
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.packageName, 'pi-agentteam')
  assert.equal(manifest.packageVersion, PACKAGE_VERSION)
  assert.equal(manifest.module, SELECTED_MODULE)
  assert.equal(manifest.helperVersion, HELPER_VERSION)
  assert.equal(manifest.protocolVersion, PROTOCOL_VERSION)
  assert.deepEqual(manifest.capabilities, [...REQUIRED_CAPABILITIES])
  assert.equal(manifest.businessPathsConnected, false)
  assert.equal(manifest.artifact.path, HELPER)
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')
  assert.equal(manifest.artifact.executable, true)
  assert.equal(manifest.files.manifest, MANIFEST)
  assert.equal(manifest.files.helper, HELPER)
  for (const rel of APPROVED_EMBEDDED_NATIVE_FILES) assert.equal(exists(root, rel), true, `${rel} should exist`)
  const helperBuffer = fs.readFileSync(path.join(root, ...HELPER.split('/')))
  assert.equal(crypto.createHash('sha256').update(helperBuffer).digest('hex'), manifest.artifact.sha256)
  assert.equal(fs.statSync(path.join(root, ...HELPER.split('/'))).size, manifest.artifact.size)
  assert.notEqual(fs.statSync(path.join(root, ...HELPER.split('/'))).mode & 0o111, 0, 'embedded helper should be executable')
}

function assertPackageSurface(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.type, 'module')
  for (const rel of APPROVED_EMBEDDED_NATIVE_FILES) assert.equal(packageJson.files.includes(rel), true, `package files should include ${rel}`)
  for (const field of ['main', 'exports', 'optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'bin', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)
  }
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
}

function assertSourceBoundaries(root) {
  const kernelSource = read(root, 'core/kernel.ts')
  const snapshotSource = read(root, 'tmux/snapshot.ts')
  const goSource = read(root, 'kernel/go/agentteam-kernel/main.go')
  assert.match(kernelSource, /export type AgentTeamKernelKnownMode = 'default' \| 'disabled' \| 'typescript' \| 'go'/, 'default should be a known mode')
  assert.match(kernelSource, /if \(!raw \|\| raw === 'default'\) return 'default'/, 'unset/default should normalize to default')
  assert.match(kernelSource, /const defaultCutoverRequested = defaultRequested \|\| requestedMode === 'go'/, 'default and go should request cutover')
  assert.match(kernelSource, /defaultAgentTeamKernelEmbeddedHelperManifestPath\(\)/, 'default/go should use embedded manifest')
  assert.match(kernelSource, /defaultAgentTeamKernelEmbeddedHelperRoot\(\)/, 'default/go should use embedded root')
  assert.match(kernelSource, /packagedPreviewRequested/, 'packaged preview should remain explicit')
  assert.match(kernelSource, /if \(cutoverRequested \|\| !fallback\) return cutoverUnavailableSnapshot\(capturedAt\)/, 'cutover should fail closed without fallback')
  assert.match(kernelSource, /if \(cutoverRequested\) return fallback\(compactInput\)/, 'default/go compact read model stays TypeScript-owned')
  assert.equal(snapshotSource.includes('parseTmuxPaneSnapshotWithTypeScript'), false, 'TypeScript runtime parser fallback should be deleted')
  assert.match(snapshotSource, /createAgentTeamKernelAdapter\(\)\.parseTmuxPaneSnapshot\(stdout, capturedAt\)/, 'tmux snapshot parser should delegate to kernel adapter')
  assert.match(snapshotSource, /createAgentTeamKernelAdapter\(\)\.captureTmuxSnapshot\(capturedAt\)/, 'post-v0.6.49 tmux snapshot capture should delegate to kernel adapter')
  assert.equal(snapshotSource.includes('runTmuxNoThrow(['), false, 'post-v0.6.49 tmux capture no longer uses the TypeScript tmux client')
  assert.match(goSource, /case "tmuxSnapshotCapture"/, 'post-v0.6.49 first slice may add narrow tmux snapshot capture')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat\)/, 'Go tmux execution must be limited to snapshot capture')
}

function fallbackSnapshot(stdout, capturedAt) {
  const panes = stdout
    .split(/\n/)
    .filter(Boolean)
    .map(line => line.split('\t'))
    .filter(parts => parts.length >= 4 && parts[0])
    .map(parts => ({ paneId: parts[0], target: parts[1] || '', label: parts[2] || '', currentCommand: parts[3] || '' }))
  return { capturedAt, panes, byPaneId: Object.fromEntries(panes.map(item => [item.paneId, item])), ok: true }
}

function hasDistRuntime(env) {
  return typeof env.helpers.requireDist === 'function'
}

function assertDefaultGoRuntime(env) {
  if (!hasDistRuntime(env)) return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const tmuxSnapshot = env.helpers.requireDist('tmux/snapshot.js')
  const mixedCase = cases().find(item => item.name === 'mixed corpus canonical snapshot')
  const singleCase = cases().find(item => item.name === 'unicode labels and commands retained')
  assert.ok(mixedCase, 'mixed parity case should exist')
  assert.ok(singleCase, 'unicode parity case should exist')

  const defaultAdapter = kernel.createAgentTeamKernelAdapter({ env: {} })
  assert.equal(defaultAdapter.metadata().kernel.requestedMode, 'default')
  assert.equal(defaultAdapter.metadata().kernel.mode, 'go')
  assert.equal(defaultAdapter.metadata().kernel.enabled, true)
  assert.equal(defaultAdapter.metadata().kernel.cutoverStatus, 'active')
  let fallbackCalls = 0
  assert.deepEqual(defaultAdapter.parseTmuxPaneSnapshot(mixedCase.stdout, mixedCase.capturedAt, () => {
    fallbackCalls += 1
    return fallbackSnapshot(mixedCase.stdout, mixedCase.capturedAt)
  }), mixedCase.expected)
  assert.equal(fallbackCalls, 0, 'default parser must not call fallback callback')
  assert.equal(defaultAdapter.metadata().kernel.calls, 2, 'default parser should preflight health and parse through helper')
  assert.equal(defaultAdapter.metadata().kernel.cutoverStatus, 'active')

  const explicitGo = kernel.createAgentTeamKernelAdapter({ mode: 'go', env: {} })
  let explicitFallbackCalls = 0
  assert.deepEqual(explicitGo.parseTmuxPaneSnapshot(singleCase.stdout, singleCase.capturedAt, () => {
    explicitFallbackCalls += 1
    return fallbackSnapshot(singleCase.stdout, singleCase.capturedAt)
  }), singleCase.expected)
  assert.equal(explicitFallbackCalls, 0, 'explicit go parser must not call fallback callback')
  assert.equal(explicitGo.metadata().kernel.requestedMode, 'go')
  assert.equal(explicitGo.metadata().kernel.mode, 'go')
  assert.equal(explicitGo.metadata().kernel.cutoverStatus, 'active')

  assert.deepEqual(tmuxSnapshot.parseTmuxPaneSnapshot(singleCase.stdout, singleCase.capturedAt), singleCase.expected)
}

function assertFailClosedRuntime(env) {
  if (!hasDistRuntime(env)) return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const testCase = cases().find(item => item.name === 'sentinel-like label remains compact tmux label')
  assert.ok(testCase, 'sentinel no-leak case should exist')
  for (const [status, expectedKind] of [['unsupported-platform', 'missing-helper'], ['integrity-failed', 'helper-incompatible-response']]) {
    const adapter = kernel.createAgentTeamKernelAdapter({ env: {}, packagedHelperStatus: status })
    let fallbackCalls = 0
    const snapshot = adapter.parseTmuxPaneSnapshot(testCase.stdout, testCase.capturedAt, () => {
      fallbackCalls += 1
      return fallbackSnapshot(testCase.stdout, testCase.capturedAt)
    })
    assert.equal(fallbackCalls, 0, `${status} should not call fallback`)
    assert.equal(snapshot.ok, false)
    assert.equal(snapshot.status, 'unknown')
    assert.equal(snapshot.resultMarker, 'stale')
    assert.equal(snapshot.module, SELECTED_MODULE)
    assert.equal(snapshot.capability, SELECTED_MODULE)
    assert.equal(snapshot.cutoverFailureKind, expectedKind)
    assert.equal(adapter.metadata().kernel.cutoverStatus, 'unavailable')
    assert.equal(adapter.metadata().kernel.cutoverFailureKind, expectedKind)
    assertNoLeak(snapshot, [testCase.stdout])
    assertNoLeak(adapter.metadata(), [testCase.stdout])
  }
}

function assertIncompatibleHelperFailClosed(env) {
  if (!hasDistRuntime(env)) return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const testCase = cases().find(item => item.name === 'single row with trailing newline')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0648-bad-helper-'))
  const helper = path.join(tmp, 'agentteam-tmuxSnapshotParse')
  fs.writeFileSync(helper, `#!/usr/bin/env node\nlet input = ''\nprocess.stdin.on('data', chunk => { input += chunk })\nprocess.stdin.on('end', () => {\n  const request = JSON.parse(input || '{}')\n  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { ok: true, implementation: 'go', protocolVersion: 999, adapterVersion: 'bad', helperVersion: 'bad', capabilities: ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'], businessPathsConnected: false } }) + '\\n')\n})\n`, 'utf8')
  fs.chmodSync(helper, 0o755)
  try {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'default', env: {}, helperPath: helper })
    let fallbackCalls = 0
    const snapshot = adapter.parseTmuxPaneSnapshot(testCase.stdout, testCase.capturedAt, () => {
      fallbackCalls += 1
      return fallbackSnapshot(testCase.stdout, testCase.capturedAt)
    })
    assert.equal(fallbackCalls, 0, 'incompatible helper should not call fallback')
    assert.equal(snapshot.ok, false)
    assert.equal(snapshot.resultMarker, 'stale')
    assert.equal(snapshot.cutoverFailureKind, 'helper-unsupported-version')
    assert.equal(adapter.metadata().kernel.cutoverStatus, 'unavailable')
    assert.equal(adapter.metadata().kernel.cutoverFailureKind, 'helper-unsupported-version')
    assertNoLeak(snapshot, [testCase.stdout, helper, tmp])
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

function assertRollbackModes(env) {
  if (!hasDistRuntime(env)) return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const testCase = cases().find(item => item.name === 'single row with trailing newline')
  for (const mode of ROLLBACK_MODES) {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode, env: {} })
    let fallbackCalls = 0
    const snapshot = adapter.parseTmuxPaneSnapshot(testCase.stdout, testCase.capturedAt)
    assert.equal(fallbackCalls, 0, `${mode} must not use hidden TypeScript parser fallback`)
    assert.equal(snapshot.ok, false)
    assert.equal(snapshot.status, 'unknown')
    assert.equal(snapshot.resultMarker, 'stale')
    assert.equal(snapshot.module, SELECTED_MODULE)
    assert.equal(snapshot.capability, SELECTED_MODULE)
    assert.equal(snapshot.cutoverFailureKind, 'previous-helper-failure')
    assert.equal(adapter.metadata().kernel.requestedMode, mode)
    assert.equal(adapter.metadata().kernel.mode, 'typescript')
    assert.equal(adapter.metadata().kernel.enabled, false)
    assert.equal(adapter.metadata().kernel.cutoverStatus, undefined)
    assertNoLeak(snapshot, [testCase.stdout])
  }
}

function assertReadModelStaysTypeScript(env) {
  if (!hasDistRuntime(env)) return
  const kernel = env.helpers.requireDist('core/kernel.js')
  const adapter = kernel.createAgentTeamKernelAdapter({ mode: 'go', env: {} })
  let fallbackCalls = 0
  const result = adapter.compactReadModelFingerprint({ teams: [{ name: 'team', text: 'MAILBOX_BODY_SHOULD_NOT_LEAK' }] }, input => {
    fallbackCalls += 1
    return {
      ok: true,
      projection: input,
      fingerprint: 'ts-owned-sentinel',
      inputKind: 'compact-panel-data',
      readOnly: true,
      fullTextIncluded: false,
      stateFilesRead: false,
      stateFilesWritten: false,
    }
  })
  assert.equal(fallbackCalls, 1, 'default/go compact read model should use TypeScript fallback')
  assert.equal(result.fingerprint, 'ts-owned-sentinel')
  assert.equal(result.fullTextIncluded, false)
  assert.equal(adapter.metadata().kernel.calls, 0, 'compact read model should not call Go helper in cutover mode')
}

function assertRepositoryArtifacts(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  const approvedNative = new Set(APPROVED_EMBEDDED_NATIVE_FILES)
  const nativeFiles = walkFiles(path.join(root, 'native')).map(file => toRel(root, file)).sort()
  assert.deepEqual(nativeFiles, [...approvedNative].sort(), 'native surface must be exactly the approved embedded helper files')
  const forbidden = []
  const raw = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && FORBIDDEN_ARTIFACT.test(rel)) forbidden.push(rel)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/') && FORBIDDEN_RAW_EVIDENCE.test(rel)) raw.push(rel)
  }
  assert.deepEqual(forbidden.sort(), [], 'repo must not contain unapproved native/archive/signing/release artifacts')
  assert.deepEqual(raw.sort(), [], 'repo must not contain raw v0.6.48 evidence files')
}

module.exports = {
  name: 'Go kernel v0.6.48 default-Go cutover for tmuxSnapshotParse',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertEmbeddedManifest(root)
    assertPackageSurface(root)
    assertSourceBoundaries(root)
    assertDefaultGoRuntime(env)
    assertFailClosedRuntime(env)
    assertIncompatibleHelperFailClosed(env)
    assertRollbackModes(env)
    assertReadModelStaysTypeScript(env)
    assertRepositoryArtifacts(root)
  },
}
