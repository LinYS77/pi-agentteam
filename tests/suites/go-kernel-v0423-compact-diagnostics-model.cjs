const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.23-compact-native-failure-diagnostics.md'
const PLAN = 'docs/agentteam方案书.md'
const EXPECTED_VERSION = '0.6.8'
const EXPECTED_FAILURE_KINDS = [
  'missing-helper',
  'disabled-helper',
  'helper-unsupported-protocol',
  'helper-unsupported-version',
  'helper-unsupported-capability',
  'helper-timeout',
  'helper-spawn-error',
  'helper-crash',
  'helper-nonzero-exit',
  'helper-empty-response',
  'helper-malformed-json',
  'helper-jsonrpc-error',
  'helper-incompatible-response',
  'helper-unsafe-response-shape',
  'previous-helper-failure',
  'tmux-command-timeout',
  'tmux-command-failed',
  'tmux-unavailable',
]
const ASSIGNED_FAILURE_KINDS = [
  'missing-helper',
  'helper-unsupported-version',
  'helper-unsupported-protocol',
  'helper-unsupported-capability',
  'helper-timeout',
  'helper-spawn-error',
  'helper-crash',
  'helper-nonzero-exit',
  'helper-empty-response',
  'helper-malformed-json',
  'helper-jsonrpc-error',
  'helper-incompatible-response',
  'helper-unsafe-response-shape',
  'previous-helper-failure',
  'tmux-command-timeout',
  'tmux-command-failed',
  'tmux-unavailable',
]
const SAFE_KEYS = ['module', 'capability', 'status', 'resultMarker', 'failureKind', 'remediation', 'platformHint', 'freshnessHint', 'releaseDecision'].sort()
const FORBIDDEN_SENTINELS = [
  '/tmp/V0423_HELPER_PATH_SHOULD_NOT_LEAK/agentteam-go-helper',
  'V0423_STDOUT_SHOULD_NOT_LEAK',
  'V0423_STDERR_SHOULD_NOT_LEAK',
  '/home/user/private/repo',
  process.cwd(),
  'raw cutoverReason should not leak',
  '{"team":{"raw":"V0423_RAW_TEAM_JSON_SHOULD_NOT_LEAK"}}',
  'V0423_SIDECAR_CACHE_INDEX_SHOULD_NOT_LEAK',
  'sha256-deadbeef-provenance-payload-should-not-leak',
  'V0423_WORKER_PROMPT_SHOULD_NOT_LEAK',
  'Error: V0423_STACK_TRACE_SHOULD_NOT_LEAK\n    at secret (/repo/file.ts:1:1)',
  'V0423_MAILBOX_REPORT_TEXT_SHOULD_NOT_LEAK',
  '@earendil-works/agentteam-native-linux-x64-internal',
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
    assert.equal(/cutoverReason/.test(source), false, `${rel} must not render cutoverReason`)
    assert.equal(/PI_AGENTTEAM_KERNEL_PACKAGED_HELPER|go-packaged-preview/.test(source), false, `${rel} must not branch on packaged preview`)
    assert.equal(/releaseDecision|platformHint|freshnessHint|failureKind.*remediation|remediation.*failureKind/.test(source), false, `${rel} must not render compact diagnostics yet`)
  }
}

module.exports = {
  name: 'Go kernel v0.4.23 compact diagnostics model',
  async run(env) {
    const root = env.helpers.extRoot
    const kernel = env.helpers.requireDist('core/kernel.js')
    const diagnostics = env.helpers.requireDist('core/kernelDiagnostics.js')
    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const source = read(root, 'core/kernelDiagnostics.ts')

    assert.ok(doc.includes('## Slice 2 Compact Diagnostics Model Evidence'), 'diagnostics doc should include Slice 2 evidence')
    assert.ok(plan.includes('tests/suites/go-kernel-v0423-compact-diagnostics-model.cjs'), 'roadmap should reference Slice 2 model suite')
    assert.equal(source.includes("'node:"), false, 'diagnostics helper must not import node modules')
    for (const forbiddenPattern of [/from ['"]node:/, /require\(['"]node:/, /child_process/, /spawnSync\b/, /execFile\b/, /process\.env/, /process\.cwd/, /readFile\b/, /writeFile\b/]) {
      assert.equal(forbiddenPattern.test(source), false, `diagnostics helper should stay pure/read-only and not match ${forbiddenPattern}`)
    }

    assert.deepEqual(kernel.AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS, EXPECTED_FAILURE_KINDS, 'failure vocabulary should remain stable')
    assert.deepEqual(ASSIGNED_FAILURE_KINDS.every(kind => kernel.AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS.includes(kind)), true, 'assigned failure kinds should be covered')

    const allDiagnostics = diagnostics.listTmuxSnapshotParseFailureDiagnostics()
    assert.equal(allDiagnostics.length, EXPECTED_FAILURE_KINDS.length, 'one diagnostic per failure kind')
    assert.deepEqual(allDiagnostics.map(item => item.failureKind), EXPECTED_FAILURE_KINDS, 'diagnostics should preserve stable failure order')

    for (const failureKind of EXPECTED_FAILURE_KINDS) {
      const diagnostic = diagnostics.createTmuxSnapshotParseFailureDiagnostic(failureKind)
      assert.deepEqual(Object.keys(diagnostic).sort(), Object.keys(diagnostic).sort().filter(key => SAFE_KEYS.includes(key)), `${failureKind} should include only safe keys`)
      assert.equal(diagnostic.module, 'tmuxSnapshotParse', `${failureKind} module`)
      assert.equal(diagnostic.capability, 'tmuxSnapshotParse', `${failureKind} capability`)
      assert.equal(diagnostic.status, 'unknown', `${failureKind} status`)
      assert.equal(diagnostic.resultMarker, 'stale', `${failureKind} resultMarker`)
      assert.equal(diagnostic.failureKind, failureKind, `${failureKind} failureKind`)
      assert.equal(typeof diagnostic.remediation, 'string', `${failureKind} remediation type`)
      assert.ok(diagnostic.remediation.length > 0 && diagnostic.remediation.length <= 140, `${failureKind} remediation should be short`)
      assert.equal(diagnostic.releaseDecision, 'docs/perf/v0.4.23-compact-native-failure-diagnostics.md', `${failureKind} release decision pointer`)
      assert.ok(diagnostic.platformHint || diagnostic.freshnessHint, `${failureKind} should include a platform or freshness hint`)
      if (diagnostic.platformHint) assert.ok(diagnostic.platformHint.length <= 120, `${failureKind} platform hint compact`)
      if (diagnostic.freshnessHint) assert.ok(diagnostic.freshnessHint.length <= 120, `${failureKind} freshness hint compact`)
      const serialized = JSON.stringify({ diagnostic, sentinelsShouldStayOutside: false })
      for (const sentinel of FORBIDDEN_SENTINELS) {
        assert.equal(serialized.includes(sentinel), false, `${failureKind} must not leak ${sentinel}`)
      }
    }

    for (const failureKind of ASSIGNED_FAILURE_KINDS) {
      const diagnostic = diagnostics.createTmuxSnapshotParseFailureDiagnostic(failureKind)
      assert.equal(diagnostic.failureKind, failureKind, `${failureKind} assigned mapping should exist`)
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
