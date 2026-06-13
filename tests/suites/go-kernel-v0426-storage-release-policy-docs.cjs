const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { assertNoUnapprovedWorkflowReleaseOrPackageBehavior } = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const DOC = 'docs/perf/v0.4.26-go-helper-artifact-pipeline.md'
const PACKAGE_VERSION = '0.6.8'
const STORAGE_ROWS = [
  'OS temp/local outputs for tests',
  'ignored local prototype directory',
  'CI workflow workspace outputs',
  'GitHub Actions artifacts for prototype review',
  'GitHub release assets',
  'npm companion packages',
  'main package inclusion',
  'postinstall/download/install-time build',
]
const STORAGE_POLICIES = [
  'allowed only as test-local outputs and cleaned',
  'future only after explicit approval and excluded from package files',
  'future only after approval',
  'future prototype storage after approval',
  'review-only, limited retention, not release asset, not install source, not normal-user availability proof',
  'STOP until explicit release-policy approval',
  'STOP until package-owner approval',
  'STOP',
  'prohibited',
  'no postinstall/download/install-time build remains binding',
  'companion package path remains future option only',
]
const RETENTION_EXPECTATIONS = [
  'review-only',
  'limited retention',
  'not release asset',
  'not install source',
  'not normal-user availability proof',
]
const ROLLBACK_SCENARIOS = [
  'bad generated artifact',
  'bad manifest/checksum/provenance/license',
  'bad helper smoke',
  'stale helper',
  'unsupported platform',
  'broken diagnostics',
  'bad storage upload',
  'accidental release asset',
  'package deprecation/unpublish',
  'bad future default resolver',
]
const VERSION_SKEW_POLICIES = [
  'package version must match',
  'helper version must match',
  'protocol must match',
  'module must match',
  'capability must match',
  'platform must match',
  'checksum must match',
  'skew fails closed',
  'no hidden TS fallback as rollback after cutover',
  'rollback is corrected release/tag/package/deprecation/default-disable policy',
]
const STOP_GATES = [
  'STOP for active GitHub Actions artifact storage without explicit approval',
  'STOP for GitHub release assets until explicit release-policy approval',
  'STOP for npm companion packages until package-owner approval',
  'STOP for main package inclusion',
  'STOP for postinstall/download/install-time build',
  'STOP for helper build commands',
  'STOP for running `go build`',
  'STOP for CI workflow',
  'STOP for real repo artifacts/manifests',
  'STOP for package metadata changes',
  'STOP for production runtime resolver behavior',
  'STOP for production `core/kernel.ts` behavior changes',
  'STOP for default Go',
  'STOP for TypeScript fallback deletion',
  'STOP for hidden TS parser fallback rollback after cutover',
  'STOP for broadening Go authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
  'STOP for `compactReadModelFingerprint` cutover',
  'STOP for native Go pi extension assumption',
  'STOP for `/team readiness` expansion',
  'STOP for later work without separate approval',
]
const FORBIDDEN_DOC = [
  'artifact storage is active',
  'GitHub Actions artifacts are active',
  'GitHub release assets are approved',
  'release assets are approved',
  'normal-user availability is proven',
  'normal-user native availability is proven',
  'native/default cutover is approved',
  'fallback deletion is approved',
  'native packaging is approved',
  'npm publish is approved',
  'npm version is approved',
  'Go is default',
  'native Go pi extension is assumed',
  'broader Go authority is approved',
  'main package inclusion is approved',
  'postinstall download is allowed',
  'install-time build is allowed',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
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
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|smoke-handoff-manifest|storage-release-manifest|artifact-pipeline-output)\.(?:json|jsonc|yaml|yml|jsonl)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated manifest/package artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|generated|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false, 'package files must not include native/helper/generated outputs')
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

function assertNoCiReleaseOrPackageScripts(root) {
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
}

module.exports = {
  name: 'Go kernel v0.4.26 storage release policy docs',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = read(root, DOC)
    const lower = doc.toLowerCase()

    for (const expected of [
      'Slice 6 — Storage, Release, and Rollback Policy',
      'Slice 6 is docs/tests storage/release/rollback policy only',
      'Focused suite: `tests/suites/go-kernel-v0426-storage-release-policy-docs.cjs`',
      'Storage decision matrix',
      'Future GitHub Actions artifact retention/access expectations',
      'Rollback/deprecation/default-disable scenarios',
      'Version-skew policy',
      'Slice 6 preserves Slice 1-5 boundaries',
      'Proceed only with GitHub-only v0.4.26 Go helper artifact generation pipeline prototype checkpoint review after leader/user approval',
    ]) {
      assert.ok(lower.includes(expected.toLowerCase()), `doc should include ${expected}`)
    }

    for (const expected of STORAGE_ROWS) assertIncludes(doc, expected, 'storage decision matrix row')
    for (const expected of STORAGE_POLICIES) assertIncludes(doc, expected, 'storage policy')
    for (const expected of RETENTION_EXPECTATIONS) assertIncludes(doc, expected, 'GitHub Actions artifact retention/access policy')
    for (const expected of ROLLBACK_SCENARIOS) assertIncludes(doc, expected, 'rollback scenario')
    for (const expected of VERSION_SKEW_POLICIES) assertIncludes(doc, expected, 'version-skew policy')
    for (const expected of STOP_GATES) assertIncludes(doc, expected, 'Slice 6 STOP gate')

    for (const forbidden of FORBIDDEN_DOC) {
      assert.equal(doc.includes(forbidden), false, `doc must not imply forbidden policy: ${forbidden}`)
    }

    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
    assertNoCiReleaseOrPackageScripts(root)
  },
}
