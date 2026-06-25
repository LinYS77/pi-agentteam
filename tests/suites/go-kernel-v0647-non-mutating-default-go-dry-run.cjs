const assert = require('node:assert/strict')
const cp = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const {
  DEFAULT_GO_DRY_RUN_SCHEMA_VERSION,
  DEFAULT_GO_DRY_RUN_THEME,
  DRY_RUN_RUNTIME_PATH,
  FAILURE_CLASSES,
  FAILURE_EXPECTATIONS,
  GO_AUTHORITY,
  GO_FORBIDDEN_SCOPE,
  NO_LEAK_MARKERS,
  PACKAGE_RUNTIME_INVARIANTS,
  REQUIRED_CAPABILITIES,
  SELECTED_MODULE,
  SMOKE_CHECKS,
  STATUS,
  STOP_ITEMS,
  SUMMARY_CONTRACT,
  VALIDATION_COMMANDS,
  defaultGoDryRunContract,
} = require('../fixtures/kernel/v0647/defaultGoDryRunContract.cjs')
const {
  RESULT_MARKER,
  formatV0647DefaultGoDryRunText,
  verifyV0647DefaultGoDryRun,
} = require('../../scripts/lib/v0647-default-go-dry-run-harness.cjs')

const DOC = 'docs/perf/v0.6.47-non-mutating-default-go-dry-run.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0647/defaultGoDryRunContract.cjs'
const SUITE = 'tests/suites/go-kernel-v0647-non-mutating-default-go-dry-run.cjs'
const CLI = 'scripts/verify-v0647-default-go-dry-run.cjs'
const LIB = 'scripts/lib/v0647-default-go-dry-run-harness.cjs'
const ROOT_FORBIDDEN_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
]
const APPROVED_EMBEDDED_NATIVE_PREFIX = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'
const POSITIVE_OVERCLAIMS = [
  'default Go enabled: true',
  'default Go is enabled',
  'default resolver enabled: true',
  'default resolver is enabled',
  'TypeScript fallback deleted: true',
  'TypeScript fallback deletion approved: true',
  'fallback deletion approved: true',
  'fallback deletion is approved',
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
]
const REQUIRED_DOC = [
  '# v0.6.47 Non-Mutating Default-Go Dry-Run',
  'Result: v0.6.47 implements a real non-mutating default-Go dry-run runtime/verifier path for `tmuxSnapshotParse`.',
  'Final result remains `ready:false`.',
  '`scripts/verify-v0647-default-go-dry-run.cjs`',
  '`scripts/lib/v0647-default-go-dry-run-harness.cjs`',
  '`tests/fixtures/kernel/v0647/defaultGoDryRunContract.cjs`',
  '`tests/suites/go-kernel-v0647-non-mutating-default-go-dry-run.cjs`',
  'wouldUseGoForTmuxSnapshotParse:true',
  'defaultBehaviorChanged:false',
  'fallbackDeleted:false',
  'goAuthority:"tmuxSnapshotParse-parser-only"',
  'default/unset remains disabled/TypeScript',
  '`go-cutover` remains explicit helper-path only',
  '`go-packaged-preview` remains explicit preview only and non-default',
  'The TypeScript parser fallback remains present.',
  'missing, corrupt, wrong-version, unsupported-platform, and malformed helper cases fail closed',
  'No raw smoke logs, raw timing JSON, native binaries, tarballs, release assets, lockfiles, `go.mod`, or `go.sum` are introduced.',
  'NO-GO for actual default Go enablement',
  'NO-GO for actual default resolver enablement',
  'NO-GO for TypeScript fallback deletion',
  'NO-GO for package/native release work',
]
const REQUIRED_ROADMAP = [
  'v0.6.47 non-mutating default-Go dry-run implementation',
  'docs/perf/v0.6.47-non-mutating-default-go-dry-run.md',
  '真实 non-mutating default-Go dry-run runtime/verifier path',
  '仍 `ready:false`',
  'actual default Go NO-GO',
  '**v0.6.47 non-mutating default-Go dry-run implementation**',
]

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

function assertNoPositiveOverclaims(source, label) {
  for (const forbidden of POSITIVE_OVERCLAIMS) assert.equal(source.includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
}

function assertNoLeaks(value, roots = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'summary must not leak absolute roots')
  }
  assert.equal(text.includes(process.cwd()), false, 'summary must not leak cwd')
  for (const marker of NO_LEAK_MARKERS) assert.equal(text.includes(marker), false, `summary must not leak ${marker}`)
  assert.equal(/stdout\s*:|stderr\s*:|stack|AssertionError|\bat\s+|kernel\/go\/agentteam-kernel|native\/tmuxSnapshotParse|manifest\.json|provenance\.json|attestation\.intoto|SHA256SUMS/i.test(text), false, 'summary must not leak raw helper/package internals')
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(defaultGoDryRunContract)), defaultGoDryRunContract, 'fixture should be plain deterministic data')
  assert.equal(defaultGoDryRunContract.schemaVersion, DEFAULT_GO_DRY_RUN_SCHEMA_VERSION)
  assert.equal(defaultGoDryRunContract.theme, DEFAULT_GO_DRY_RUN_THEME)
  assert.equal(defaultGoDryRunContract.status, STATUS)
  assert.equal(defaultGoDryRunContract.ready, false)
  assert.equal(defaultGoDryRunContract.selectedModule, SELECTED_MODULE)
  assert.equal(defaultGoDryRunContract.dryRunRuntimePath.cli, CLI)
  assert.equal(defaultGoDryRunContract.dryRunRuntimePath.harness, LIB)
  assert.equal(defaultGoDryRunContract.dryRunRuntimePath.resultMarker, RESULT_MARKER)
  assert.equal(defaultGoDryRunContract.dryRunRuntimePath.executionRoot, 'os-temp-only')
  assert.equal(defaultGoDryRunContract.dryRunRuntimePath.buildsHelperToTemp, true)
  assert.equal(defaultGoDryRunContract.dryRunRuntimePath.mutatesProductDefaults, false)
  assert.equal(defaultGoDryRunContract.dryRunRuntimePath.writesRepoArtifacts, false)
  assert.deepEqual(defaultGoDryRunContract.summaryContract, SUMMARY_CONTRACT)
  assert.equal(defaultGoDryRunContract.summaryContract.goAuthority, GO_AUTHORITY)
  assert.deepEqual(defaultGoDryRunContract.smokeChecks, SMOKE_CHECKS)
  assert.deepEqual(defaultGoDryRunContract.failureClasses, FAILURE_CLASSES)
  assert.deepEqual(defaultGoDryRunContract.failureExpectations, FAILURE_EXPECTATIONS)
  assert.deepEqual(defaultGoDryRunContract.packageRuntimeInvariants, PACKAGE_RUNTIME_INVARIANTS)
  assert.deepEqual(defaultGoDryRunContract.goForbiddenScope, defaultGoDryRunContract.goForbiddenScope)
  for (const item of ['tmux execution', 'tmux capture', 'worker lifecycle', 'state writes', 'task governance', 'report governance', 'PlanRun governance', 'mailbox full-text reads', 'report full-text reads', 'UI rendering', 'package release control']) {
    assert.equal(GO_FORBIDDEN_SCOPE.includes(item), true, `forbidden scope should include ${item}`)
  }
  for (const stop of ['default Go enabled', 'default resolver enabled', 'TypeScript fallback deleted', 'fallback deletion approved', 'v0.7 release-ready', 'tag/release created', 'npm version/publish', 'native package approved']) {
    assert.equal(STOP_ITEMS.includes(stop), true, `STOP_ITEMS should include ${stop}`)
  }
  assert.deepEqual(defaultGoDryRunContract.validationCommands, VALIDATION_COMMANDS)
}

function assertDocs(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  assert.equal(exists(root, ROADMAP), true, `${ROADMAP} should exist`)
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoPositiveOverclaims(doc, DOC)
  assertNoPositiveOverclaims(roadmap, ROADMAP)
  assert.equal(/"records"\s*:|"profileSummary"\s*:|"runId"\s*:|"jobs"\s*:|"manifest"\s*:|"provenance"\s*:|"stdout"\s*:|"stderr"\s*:/i.test(doc), false, `${DOC} must not embed raw JSON evidence`)
}

function assertRuntimeInvariants(root, env) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, PACKAGE_RUNTIME_INVARIANTS.packageName)
  assert.equal(packageJson.version, PACKAGE_RUNTIME_INVARIANTS.packageVersion)
  assert.equal(packageJson.type, PACKAGE_RUNTIME_INVARIANTS.packageType)
  assert.deepEqual(packageJson.pi?.extensions, [...PACKAGE_RUNTIME_INVARIANTS.piExtensions])
  for (const field of ['main', 'exports', 'types', 'optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)
  }
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish', 'prepack', 'postpack']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }

  const kernelSource = read(root, 'core/kernel.ts')
  assert.match(kernelSource, /if \(!raw \|\| raw === 'default'\) return 'default'/, 'default/unset should normalize to default cutover mode')
  assert.match(kernelSource, /const defaultCutoverRequested = defaultRequested \|\| requestedMode === 'go'/, 'default and go use approved embedded cutover path')
  assert.match(kernelSource, /defaultAgentTeamKernelEmbeddedHelperManifestPath\(\)/, 'default cutover should use embedded manifest')
  assert.match(kernelSource, /defaultAgentTeamKernelEmbeddedHelperRoot\(\)/, 'default cutover should use embedded helper root')
  assert.match(kernelSource, /requestedMode === 'go-cutover'/, 'go-cutover remains explicit')
  assert.match(kernelSource, /requestedMode === 'go-packaged-preview'/, 'go-packaged-preview remains explicit')
  assert.match(kernelSource, /AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse'/, 'tmuxSnapshotParse remains cutover module')
  assert.match(kernelSource, /compactReadModelFingerprint\(input, fallback = fallbackCompactReadModelFingerprint\)/, 'compactReadModelFingerprint fallback remains')
  assert.match(kernelSource, /if \(cutoverRequested\) return fallback\(compactInput\)/, 'compactReadModelFingerprint remains non-cutover')

  const snapshotSource = read(root, 'tmux/snapshot.ts')
  assert.equal(/parseTmuxPaneSnapshotWithTypeScript/.test(snapshotSource), false, 'approved v0.6.48 cutover deletes TypeScript parser fallback')
  assert.match(snapshotSource, /runTmuxNoThrow\(\[/, 'TypeScript still captures tmux output')
  assert.match(snapshotSource, /list-panes/, 'TypeScript still owns list-panes capture')

  if (typeof env.helpers.requireDist === 'function') {
    const kernel = env.helpers.requireDist('core/kernel.js')
    const adapter = kernel.createAgentTeamKernelAdapter({ env: {} })
    assert.equal(adapter.metadata().kernel.requestedMode, 'default')
    assert.equal(adapter.metadata().kernel.mode, 'go')
    assert.equal(adapter.metadata().kernel.enabled, true)
    assert.equal(adapter.metadata().kernel.calls, 0)
    assert.equal(adapter.metadata().kernel.cutoverStatus, 'active')
    assert.deepEqual(kernel.AGENTTEAM_KERNEL_CAPABILITIES, [...REQUIRED_CAPABILITIES])
  }
}

function assertVerifierSource(root) {
  assert.equal(exists(root, CLI), true, `${CLI} should exist`)
  assert.equal(exists(root, LIB), true, `${LIB} should exist`)
  const cli = read(root, CLI)
  const lib = read(root, LIB)
  assertIncludes(cli, 'verifyV0647DefaultGoDryRun', CLI)
  assertIncludes(lib, 'fakeFutureDefaultResolver', LIB)
  assertIncludes(lib, 'go-packaged-preview', LIB)
  assertIncludes(lib, 'defaultBehaviorChanged: true', LIB)
  assertIncludes(lib, 'fallbackDeleted: true', LIB)
  assertIncludes(lib, "goAuthority: GO_AUTHORITY", LIB)
  assertIncludes(lib, 'fs.mkdtempSync(path.join(os.tmpdir()', LIB)
  assert.equal(/npm\s+(?:pack|install|publish|version)\b/.test(lib), false, `${LIB} must not invoke npm packaging/release commands`)
  assert.equal(/cp\.spawnSync\(['"](?:git|gh|curl|wget)['"]|exec(?:File)?Sync\([^)]*['"](?:git|gh|curl|wget)['"]/.test(lib), false, `${LIB} must not invoke release/network commands`)
}

function assertSummary(root) {
  const summary = verifyV0647DefaultGoDryRun({ repoRoot: root })
  assert.equal(summary.ok, true)
  assert.equal(summary.resultMarker, RESULT_MARKER)
  assert.equal(summary.ready, false)
  assert.equal(summary.reviewOnly, true)
  assert.equal(summary.dryRun, true)
  assert.equal(summary.nonMutating, true)
  assert.equal(summary.selectedModule, SELECTED_MODULE)
  for (const [key, value] of Object.entries(SUMMARY_CONTRACT)) assert.equal(summary[key], value, `${key} should match summary contract`)
  assert.equal(summary.helper.built, true)
  assert.equal(summary.helper.rootKind, 'os-temp-only')
  assert.deepEqual(summary.helper.capabilities, [...REQUIRED_CAPABILITIES])
  assert.equal(summary.futureDefaultResolver.mode, defaultGoDryRunContract.dryRunRuntimePath.futureResolverMode)
  assert.equal(summary.futureDefaultResolver.manifestResolved, true)
  assert.equal(summary.smoke.directHelperHealth, true)
  assert.equal(summary.smoke.directHelperTmuxSnapshotParse, true)
  assert.equal(summary.smoke.futureDefaultResolver.wouldUseGo, true)
  assert.equal(summary.parity.passed, true)
  assert.ok(summary.parity.caseCount >= 10, 'parity should cover canonical corpus')
  assert.equal(summary.parity.rawStdoutIncluded, false)
  assert.equal(summary.failClosed.passed, true)
  assert.deepEqual(summary.failClosed.failures.map(item => item.name), [...FAILURE_CLASSES])
  for (const failure of summary.failClosed.failures) {
    assert.equal(failure.observed, FAILURE_EXPECTATIONS[failure.name], `${failure.name} failure kind`)
    assert.equal(failure.failClosed, true, `${failure.name} should fail closed`)
  }
  assert.equal(summary.noLeak.passed, true)
  assert.equal(summary.packageInvariants.packageVersion, PACKAGE_RUNTIME_INVARIANTS.packageVersion)
  assert.equal(summary.cleanup.cleaned, true)
  assertNoLeaks(summary, [root])

  const text = formatV0647DefaultGoDryRunText(summary)
  assertIncludes(text, 'wouldUseGoForTmuxSnapshotParse=true', 'human summary')
  assertIncludes(text, 'defaultBehaviorChanged=true', 'human summary')
  assertIncludes(text, 'fallbackDeleted=true', 'human summary')
  assertNoLeaks(text, [root])
}

function assertCli(root) {
  const result = cp.spawnSync(process.execPath, [CLI, '--repo-root', root, '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
    env: { ...process.env, PATH: process.env.PATH || '' },
  })
  assert.equal(result.status, 0, `CLI should pass\nstdout=${result.stdout}\nstderr=${result.stderr}`)
  assert.equal(result.stderr, '')
  const summary = JSON.parse(result.stdout)
  assert.equal(summary.ok, true)
  assert.equal(summary.resultMarker, RESULT_MARKER)
  assert.equal(summary.wouldUseGoForTmuxSnapshotParse, true)
  assert.equal(summary.defaultBehaviorChanged, true)
  assert.equal(summary.defaultGoEnabled, true)
  assert.equal(summary.defaultResolverEnabled, true)
  assert.equal(summary.fallbackDeleted, true)
  assertNoLeaks(summary, [root])
}

function assertArtifacts(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  const forbidden = []
  const raw = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && /(?:^|\/)(?:pi-agentteam-.*\.tgz|.*\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig))$/i.test(rel)) forbidden.push(rel)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && !rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/') && /(?:^|\/)(?:.*v0647.*raw.*|.*raw-tmux.*|.*tmux.*stdout.*|.*tmux.*stderr.*|.*state-archive.*|.*raw-state.*|.*mailbox.*body.*|.*report.*body.*|.*worker.*transcript.*|.*terminal.*raw.*log.*)$/i.test(rel)) raw.push(rel)
  }
  assert.deepEqual(forbidden.sort(), [], 'repo must not contain unapproved checked-in native/archive/signing/release artifacts')
  assert.deepEqual(raw.sort(), [], 'repo must not contain raw v0.6.47 evidence files')
}

module.exports = {
  name: 'Go kernel v0.6.47 non-mutating default-Go dry-run',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertRuntimeInvariants(root, env)
    assertVerifierSource(root)
    assertSummary(root)
    assertCli(root)
    assertArtifacts(root)
  },
}
