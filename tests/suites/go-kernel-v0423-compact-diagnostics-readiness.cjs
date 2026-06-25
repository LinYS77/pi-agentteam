const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.23-compact-native-failure-diagnostics.md'
const PLAN = 'docs/agentteam方案书.md'
const EXPECTED_VERSION = '0.6.8'
const REPRESENTATIVE_FAILURE_KINDS = [
  'missing-helper',
  'helper-unsupported-version',
  'helper-unsupported-protocol',
  'helper-unsupported-capability',
  'helper-timeout',
  'helper-spawn-error',
  'helper-crash',
  'helper-malformed-json',
  'helper-incompatible-response',
  'helper-unsafe-response-shape',
  'previous-helper-failure',
]
const SAFE_SUMMARY_KEYS = ['module', 'capability', 'status', 'resultMarker', 'failureKind', 'summary', 'remediation', 'hint', 'releaseDecision'].sort()
const FORBIDDEN_SENTINELS = [
  '/tmp/V0423_READINESS_HELPER_PATH_SHOULD_NOT_LEAK/agentteam-go-helper',
  'V0423_READINESS_STDOUT_SHOULD_NOT_LEAK',
  'V0423_READINESS_STDERR_SHOULD_NOT_LEAK',
  '/home/user/private/v0423-readiness-repo',
  process.cwd(),
  'V0423_READINESS_RAW_CUTOVER_REASON_SHOULD_NOT_LEAK',
  '{"team":{"raw":"V0423_READINESS_RAW_TEAM_JSON_SHOULD_NOT_LEAK"}}',
  'V0423_READINESS_SIDECAR_CACHE_INDEX_SHOULD_NOT_LEAK',
  'V0423_READINESS_RAW_MANIFEST_CHECKSUM_PROVENANCE_SHOULD_NOT_LEAK',
  'V0423_READINESS_WORKER_PROMPT_SHOULD_NOT_LEAK',
  'Error: V0423_READINESS_STACK_TRACE_SHOULD_NOT_LEAK\n    at secret (/repo/file.ts:1:1)',
  'V0423_READINESS_MAILBOX_REPORT_TEXT_SHOULD_NOT_LEAK',
  '@earendil-works/agentteam-native-readiness-internal',
]

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

function assertNoForbiddenLeaks(value, label) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  for (const sentinel of FORBIDDEN_SENTINELS) {
    assert.equal(serialized.includes(sentinel), false, `${label} must not leak ${sentinel}`)
  }
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, EXPECTED_VERSION, 'package version must remain unchanged')
  assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'package.json#files must exclude kernel/')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package.json#files must exclude native/helper/generated artifacts')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'os'), false, 'main package must not define native os metadata')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'cpu'), false, 'main package must not define native cpu metadata')
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

function assertRuntimeUiQuiet(root) {
  for (const rel of ['teamPanel/dataSource.ts', 'teamPanel/viewModel.ts', 'teamPanel/readModel.ts', 'teamPanel.ts', 'renderers.ts']) {
    const source = read(root, rel)
    assert.equal(/cutoverReason/.test(source), false, `${rel} must not render raw cutoverReason`)
    assert.equal(/PI_AGENTTEAM_KERNEL_PACKAGED_HELPER|go-packaged-preview/.test(source), false, `${rel} must not branch on packaged preview`)
    assert.equal(/releaseDecision|platformHint|freshnessHint|remediation|formatTmuxSnapshotParseFailureReadiness|summarizeTmuxSnapshotParseFailureDiagnostic/.test(source), false, `${rel} must not render compact readiness diagnostics yet`)
  }
}

module.exports = {
  name: 'Go kernel v0.4.23 compact diagnostics readiness',
  async run(env) {
    const root = env.helpers.extRoot
    const kernel = env.helpers.requireDist('core/kernel.js')
    const diagnostics = env.helpers.requireDist('core/kernelDiagnostics.js')
    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const source = read(root, 'core/kernelDiagnostics.ts')

    assert.ok(doc.includes('## Slice 4 Compact Diagnostics Readiness Surface Evidence'), 'diagnostics doc should include Slice 4 evidence')
    assert.ok(plan.includes('tests/suites/go-kernel-v0423-compact-diagnostics-readiness.cjs'), 'roadmap should reference Slice 4 readiness suite')
    assert.equal(source.includes("'node:"), false, 'diagnostics readiness helper must not import node modules')
    for (const forbiddenPattern of [/from ['"]node:/, /require\(['"]node:/, /child_process/, /spawnSync\b/, /execFile\b/, /process\.env/, /process\.cwd/, /readFile\b/, /writeFile\b/, /tmux\/client/, /state\//]) {
      assert.equal(forbiddenPattern.test(source), false, `diagnostics readiness helper should stay pure/read-only and not match ${forbiddenPattern}`)
    }

    for (const failureKind of REPRESENTATIVE_FAILURE_KINDS) {
      const diagnostic = diagnostics.createTmuxSnapshotParseFailureDiagnostic(failureKind)
      const summary = diagnostics.summarizeTmuxSnapshotParseFailureDiagnostic(diagnostic)
      const formatted = diagnostics.formatTmuxSnapshotParseFailureReadiness(diagnostic)

      assert.deepEqual(Object.keys(summary).sort(), Object.keys(summary).sort().filter(key => SAFE_SUMMARY_KEYS.includes(key)), `${failureKind} summary should only expose safe keys`)
      assert.equal(summary.module, 'tmuxSnapshotParse', `${failureKind} summary module`)
      assert.equal(summary.capability, 'tmuxSnapshotParse', `${failureKind} summary capability`)
      assert.equal(summary.status, 'unknown', `${failureKind} summary status`)
      assert.equal(summary.resultMarker, 'stale', `${failureKind} summary result marker`)
      assert.equal(summary.failureKind, failureKind, `${failureKind} summary failure kind`)
      assert.equal(summary.remediation, diagnostic.remediation, `${failureKind} summary remediation`)
      assert.equal(summary.releaseDecision, diagnostic.releaseDecision, `${failureKind} summary release decision pointer`)
      assert.ok(summary.summary.includes('tmuxSnapshotParse unknown/stale'), `${failureKind} summary should include compact status text`)
      assert.ok(summary.summary.includes(failureKind), `${failureKind} summary should include failure kind`)
      assert.ok(summary.summary.length <= 96, `${failureKind} summary text should be compact`)
      assert.ok(summary.remediation.length <= 140, `${failureKind} remediation should stay compact`)
      assert.ok(summary.hint && summary.hint.length <= 120, `${failureKind} readiness summary should include compact hint`)

      assert.ok(formatted.includes(`module=${summary.module}`), `${failureKind} formatted module`)
      assert.ok(formatted.includes(`capability=${summary.capability}`), `${failureKind} formatted capability`)
      assert.ok(formatted.includes(`status=${summary.status}`), `${failureKind} formatted status`)
      assert.ok(formatted.includes(`resultMarker=${summary.resultMarker}`), `${failureKind} formatted resultMarker`)
      assert.ok(formatted.includes(`failureKind=${failureKind}`), `${failureKind} formatted failureKind`)
      assert.ok(formatted.includes(`remediation=${summary.remediation}`), `${failureKind} formatted remediation`)
      assert.ok(formatted.includes(`releaseDecision=${summary.releaseDecision}`), `${failureKind} formatted release decision`)
      assert.ok(formatted.length <= 420, `${failureKind} formatted readiness line should be compact`)
      assert.equal(formatted, diagnostics.formatTmuxSnapshotParseFailureReadiness(diagnostic), `${failureKind} formatted readiness should be stable`)
      assert.deepEqual(summary, diagnostics.summarizeTmuxSnapshotParseFailureDiagnostic(diagnostic), `${failureKind} readiness summary should be stable`)

      assertNoForbiddenLeaks(summary, `${failureKind} summary`)
      assertNoForbiddenLeaks(formatted, `${failureKind} formatted readiness`)
    }

    const defaultMetadata = kernel.createAgentTeamKernelAdapter({ env: {} }).metadata()
    assert.equal(defaultMetadata.kernel.requestedMode, 'default', 'unset mode should normalize to default after v0.6.48')
    assert.equal(defaultMetadata.kernel.mode, 'go', 'unset mode should use embedded Go for tmuxSnapshotParse')
    assert.equal(defaultMetadata.kernel.enabled, true, 'default embedded helper should enable parser-only Go')
    assert.equal(defaultMetadata.kernel.cutoverStatus, 'active', 'default embedded helper should be active')

    const previewMetadata = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: {} }).metadata()
    assert.equal(previewMetadata.kernel.requestedMode, 'go-packaged-preview', 'preview mode should remain explicit')
    assert.equal(previewMetadata.kernel.requestedKnownKernel, true, 'preview mode should remain known')
    assert.equal(previewMetadata.kernel.enabled, false, 'preview without packaged helper should not enable Go')
    assert.equal(previewMetadata.kernel.fallbacks, 0, 'preview mode should not use migration fallback count')

    const cutoverMetadata = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', env: {} }).metadata()
    assert.equal(cutoverMetadata.kernel.requestedMode, 'go-cutover', 'go-cutover remains explicit')
    assert.equal(cutoverMetadata.kernel.enabled, false, 'go-cutover without helper remains unavailable')
    assert.equal(cutoverMetadata.kernel.cutoverModule, 'tmuxSnapshotParse', 'go-cutover module unchanged')
    assert.equal(cutoverMetadata.kernel.cutoverStatus, 'unavailable', 'go-cutover missing helper fails closed')

    const readModelBench = require(path.join(root, 'tests/bench/team-read-model-baseline.cjs'))
    assert.equal(readModelBench.shouldRunShadow('go-cutover'), false, 'go-cutover should not run read-model shadow')
    assert.equal(readModelBench.shouldRunShadow('go-packaged-preview'), false, 'preview mode should not run read-model shadow')

    assertRuntimeUiQuiet(root)
    assertPackageNativeSanity(root)
  },
}
