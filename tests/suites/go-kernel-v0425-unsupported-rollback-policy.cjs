const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const FAILURE_CASES = [
  'unsupported os/arch/libc',
  'missing helper package/artifact',
  'bad package metadata',
  'checksum/provenance/license mismatch or missing',
  'non-executable helper',
  'stale helper',
  'helper/package version skew',
  'protocol skew',
  'capability skew',
  'corrupt helper output',
  'broken diagnostics',
  'bad resolver default',
  'package unpublish/deprecation',
]
const ROLLBACK_SCENARIOS = [
  'bad metadata',
  'bad helper artifact',
  'checksum/provenance mismatch',
  'unsupported platform',
  'broken diagnostics',
  'package unpublish/deprecation',
  'stale helper',
  'bad default resolver decision',
]
const ROLLBACK_OWNERS = [
  'release owner',
  'package owner',
  'diagnostics owner',
  'runtime owner',
  'support-policy owner',
]
const FAILURE_KINDS = new Set([
  'unsupported_platform',
  'artifact_missing',
  'metadata_invalid',
  'integrity_mismatch',
  'artifact_not_executable',
  'artifact_stale',
  'version_skew',
  'protocol_skew',
  'capability_skew',
  'helper_smoke_failed',
  'diagnostics_broken',
  'bad_default_resolver',
  'package_unavailable',
])
const FORBIDDEN_LEAK_PATTERNS = [
  /\/tmp\/|\/home\/|[A-Z]:\\/i,
  /stdout|stderr/i,
  /repo|cwd|working directory/i,
  /raw manifest|checksum=[a-f0-9]{16,}|provenance|package internals/i,
  /stack trace|Error:|AssertionError|\bat\s+\w+/i,
  /mailbox|report text/i,
]

function compactDiagnostic(caseName) {
  const table = {
    'unsupported os/arch/libc': ['unsupported_platform', 'Keep TypeScript default and publish only after support policy approval.', 'platform-unsupported'],
    'missing helper package/artifact': ['artifact_missing', 'Keep TypeScript default and republish corrected helper package.', 'helper-missing'],
    'bad package metadata': ['metadata_invalid', 'Block default/native/fallback deletion until package metadata is corrected.', 'metadata-invalid'],
    'checksum/provenance/license mismatch or missing': ['integrity_mismatch', 'Reject helper package and republish with valid integrity metadata.', 'integrity-mismatch'],
    'non-executable helper': ['artifact_not_executable', 'Reject helper package and publish corrected executable artifact.', 'executable-bit'],
    'stale helper': ['artifact_stale', 'Roll forward or deprecate stale helper package before any default path.', 'helper-stale'],
    'helper/package version skew': ['version_skew', 'Align helper and package versions before enabling native path.', 'version-skew'],
    'protocol skew': ['protocol_skew', 'Reject helper until protocol version matches TS adapter contract.', 'protocol-skew'],
    'capability skew': ['capability_skew', 'Reject helper unless tmuxSnapshotParse capability is declared.', 'capability-skew'],
    'corrupt helper output': ['helper_smoke_failed', 'Fail closed and keep default TypeScript behavior.', 'helper-output'],
    'broken diagnostics': ['diagnostics_broken', 'Disable native/default path until diagnostics are compact and no-leak.', 'diagnostics-broken'],
    'bad resolver default': ['bad_default_resolver', 'Disable default resolver decision and require corrected release.', 'resolver-default'],
    'package unpublish/deprecation': ['package_unavailable', 'Disable native/default path and publish/deprecate corrected package policy.', 'package-unavailable'],
  }
  const row = table[caseName]
  assert.ok(row, `missing compact diagnostic case ${caseName}`)
  return {
    module: MODULE,
    capability: MODULE,
    status: 'unavailable',
    resultMarker: 'fail-closed',
    failureKind: row[0],
    remediation: row[1],
    hint: row[2],
    releaseDecision: 'block-default-native-fallback-deletion',
    rollback: 'corrected-release-tag-package-deprecation-or-default-disable-policy',
    hiddenTypescriptFallbackAfterCutover: false,
  }
}

function assertNoLeaks(value, label) {
  const text = JSON.stringify(value)
  for (const pattern of FORBIDDEN_LEAK_PATTERNS) {
    assert.equal(pattern.test(text), false, `${label} should not leak ${pattern}`)
  }
  assert.equal(text.includes('helperPath'), false, `${label} should not leak helperPath`) 
  assert.equal(text.includes('manifestBody'), false, `${label} should not leak manifest body`) 
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

function assertRepoArtifactSanity(root) {
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|clean-install-manifest|rollback-manifest)\.(?:json|jsonc|yaml|yml)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated manifest/package artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false, 'package files must not include native/helper/generated artifacts')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    assert.equal(/go\s+(?:build|install)\b/.test(command), false, `${name} must not build/install helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild/i.test(command), false, `${name} must not download/build native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
}

function assertKernelDefaultsSource(root) {
  const source = fs.readFileSync(path.join(root, 'core/kernel.ts'), 'utf8')
  assert.ok(source.includes("if (!raw || raw === 'none' || raw === 'off' || raw === 'disabled') return 'disabled'"), 'unset kernel default should remain disabled')
  assert.ok(source.includes('const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)'), 'metadata should derive requested mode from explicit mode/env only')
  assert.ok(source.includes("const activeMode: AgentTeamKernelActiveMode = usesGo() ? 'go' : 'typescript'"), 'unset/preview metadata should keep TypeScript mode when Go is unavailable')
  assert.ok(source.includes("enabled: activeMode === 'go'"), 'unset/preview metadata should keep Go disabled unless Go is active')
  assert.ok(source.includes("'go-packaged-preview'"), 'go-packaged-preview should remain explicit known mode')
  assert.ok(source.includes("requestedMode === 'go-packaged-preview'"), 'go-packaged-preview should require explicit request')
  assert.ok(source.includes('const startupFallback = cutoverRequested ? undefined'), 'go-packaged-preview should not use migration fallback count')
}

module.exports = {
  name: 'Go kernel v0.4.25 unsupported platform rollback policy',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = fs.readFileSync(path.join(root, 'docs/perf/v0.4.25-native-helper-availability-proof.md'), 'utf8')
    const docLower = doc.toLowerCase()

    for (const expected of [
      'Slice 4 — Unsupported Platform and Rollback/Version-Skew Policy',
      'unsupported-platform matrix',
      'rollback/version-skew policy',
      'unsupported platforms fail closed with compact no-leak diagnostics',
      'keep default/native/fallback deletion blocked unless support policy is narrowed and approved',
      'rollback is corrected release/tag/package/deprecation/default-disable policy',
      'not hidden runtime TypeScript fallback after cutover',
      'future normal-user diagnostics UX',
      'must not leak helper path/stdout/stderr/repo/cwd/raw manifest/checksum/provenance/package internals/stack/mailbox/report text',
      'tests/suites/go-kernel-v0425-unsupported-rollback-policy.cjs',
      'TS/pi control plane remains mandatory',
      'Go helper remains behind TS adapter/ports via subprocess/RPC/stdin-stdout',
      'parser-only stdin/stdout `tmuxSnapshotParse`',
      'STOP for production runtime resolver behavior',
      'STOP for package metadata changes',
      'STOP for default Go enablement',
      'STOP for TypeScript fallback deletion',
      'STOP for hidden TS parser fallback as rollback after cutover',
      'STOP for `/team readiness` expansion',
      'STOP for Slice 5 work',
    ]) {
      assert.ok(docLower.includes(expected.toLowerCase()), `doc should include ${expected}`)
    }

    for (const expected of FAILURE_CASES) {
      assert.ok(docLower.includes(expected.toLowerCase()), `doc should include fail-closed case ${expected}`)
      const diagnostic = compactDiagnostic(expected)
      assert.equal(diagnostic.status, 'unavailable', `${expected} status should fail closed`) 
      assert.equal(diagnostic.resultMarker, 'fail-closed', `${expected} result marker should fail closed`) 
      assert.ok(FAILURE_KINDS.has(diagnostic.failureKind), `${expected} failureKind should be compact`) 
      assert.equal(diagnostic.releaseDecision, 'block-default-native-fallback-deletion', `${expected} should block release decision`) 
      assert.equal(diagnostic.hiddenTypescriptFallbackAfterCutover, false, `${expected} must not hide TS fallback after cutover`) 
      assertNoLeaks(diagnostic, expected)
    }

    for (const expected of ROLLBACK_SCENARIOS) {
      assert.ok(docLower.includes(expected.toLowerCase()), `doc should include rollback scenario ${expected}`)
    }
    for (const expected of ROLLBACK_OWNERS) {
      assert.ok(docLower.includes(expected.toLowerCase()), `doc should include rollback owner ${expected}`)
    }

    for (const forbiddenPhrase of [
      'normal-user native availability is proven',
      'normal-user availability is proven',
      'native/default cutover is approved',
      'fallback deletion is approved',
      'native packaging is approved',
      'npm publish is approved',
      'npm version is approved',
      'Go is default',
      'Go remains default',
      'Go is a pi extension',
      'native Go pi extension is assumed',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'Go reads mailbox full text',
      'hidden runtime TypeScript fallback is rollback',
    ]) {
      assert.equal(doc.includes(forbiddenPhrase), false, `doc must not imply forbidden approval: ${forbiddenPhrase}`)
    }

    assertPackageNativeSanity(root)
    assertKernelDefaultsSource(root)
    assertRepoArtifactSanity(root)
  },
}
