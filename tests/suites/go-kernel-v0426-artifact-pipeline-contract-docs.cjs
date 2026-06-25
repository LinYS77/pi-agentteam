const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.26-go-helper-artifact-pipeline.md'
const PLAN = 'docs/agentteam方案书.md'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_LINKS = [
  'docs/perf/v0.4.25-native-helper-availability-proof-checkpoint.md',
  'docs/perf/v0.4.25-native-helper-availability-proof.md',
  'tests/suites/go-kernel-v0425-native-availability-contract-docs.cjs',
  'tests/suites/go-kernel-v0425-artifact-manifest-prototype.cjs',
  'tests/suites/go-kernel-v0425-clean-install-smoke.cjs',
  'tests/suites/go-kernel-v0425-unsupported-rollback-policy.cjs',
  'tests/suites/go-kernel-v0425-resolver-default-cutover-gate.cjs',
  'tests/suites/go-kernel-v0425-native-availability-checkpoint-docs.cjs',
]
const IN_SCOPE = [
  'build matrix definition',
  'helper build command policy',
  'artifact output path policy',
  'local/CI artifact output prototype',
  'manifest/checksum/provenance/license/executable generation prototype',
  'attestation/signing placeholders',
  'direct artifact smoke and clean-install handoff',
  'storage/release/rollback policy',
  'final checkpoint guardrail',
]
const OUT_OF_SCOPE = [
  'npm version/publish',
  'package metadata changes',
  'optionalDependencies/lifecycle hooks/downloads/package scripts',
  'lockfiles/go.mod/go.sum unless explicitly approved later',
  'checked-in binaries/tarballs/generated manifests/artifacts',
  'GitHub release assets without release-policy approval',
  'npm package inclusion',
  'default Go',
  '`go-cutover`/`go-packaged-preview` semantic changes',
  'TypeScript fallback deletion',
  'native Go pi extension',
  '`/team readiness` expansion',
]
const MATRIX_ROWS = [
  'linux-x64-glibc',
  'linux-arm64-glibc',
  'darwin-arm64',
  'darwin-x64',
  'win32-x64',
  'linux-x64-musl',
  'linux-arm64-musl',
  'win32-arm64',
  'other os/arch/libc targets',
]
const STOP_ITEMS = [
  'npm version/publish',
  'package version change',
  'package.json metadata changes',
  'optionalDependencies',
  'lifecycle hooks/downloads',
  'helper build/install/package scripts',
  'lockfiles',
  'go.mod/go.sum',
  'generated real artifacts/manifests',
  'checked-in native binaries',
  'tarballs',
  'generated package artifacts',
  'GitHub release assets',
  'npm package inclusion',
  'default Go enablement',
  'TypeScript fallback deletion',
  '`compactReadModelFingerprint` cutover',
  'broad Go authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
  'native Go pi extension assumption',
  '`/team readiness` expansion',
]
const FORBIDDEN = [
  'artifacts are generated',
  'generated artifacts are approved',
  'normal-user availability is proven',
  'normal-user native availability is proven',
  'native/default cutover is approved',
  'fallback deletion is approved',
  'native packaging is approved',
  'npm publish is approved',
  'npm version is approved',
  'Go is default',
  'Go remains default',
  'GitHub release assets are approved',
  'package metadata is changed',
  'package metadata changes are approved',
  'checked-in artifacts are allowed',
  'native Go pi extension is assumed',
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
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|artifact-pipeline-output)\.(?:json|jsonc|yaml|yml)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated manifest/package artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include native/helper/generated artifacts')
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

module.exports = {
  name: 'Go kernel v0.4.26 artifact pipeline contract docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [DOC, PLAN, ...REQUIRED_LINKS]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }
    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const lower = doc.toLowerCase()

    for (const link of REQUIRED_LINKS) assertIncludes(doc, link, 'pipeline doc')
    assertIncludes(plan, DOC, 'roadmap')

    for (const expected of [
      'v0.4.26 Go Helper Artifact Generation Pipeline Prototype Checkpoint',
      'Slice 1 docs/tests-only pipeline owner contract / release boundary',
      'v0.4.25 proved prerequisites with temp evidence',
      'next missing evidence is real artifact generation pipeline design/prototype',
      'TS/pi control plane mandatory',
      'Go helper behind TS adapter/ports via subprocess/RPC/stdin-stdout',
      'no native Go pi extension/provider ABI assumption',
      'Go authority parser-only `tmuxSnapshotParse`',
      'Release and Package Boundary',
      'GitHub-only checkpoint',
      'no npm package metadata by default',
      'GitHub Actions artifacts may be future prototype storage after approval',
      'GitHub release assets are future explicit release-policy gate',
      'npm companion packages are future package-owner gate',
      'no postinstall/download/install-time build policy remains binding',
      'Build Matrix Placeholder',
      'future unsupported until proven',
      'no support claim yet',
      'STOP Gates',
      'Slice 1 Validation Plan',
      'Future v0.4.26 Validation Matrix',
      'Proceed only with GitHub-only v0.4.26 Go helper artifact generation pipeline prototype checkpoint review after leader/user approval',
    ]) {
      assert.ok(lower.includes(expected.toLowerCase()), `doc should include ${expected}`)
    }

    for (const expected of IN_SCOPE) assertIncludes(doc, expected, 'in-scope pipeline area')
    for (const expected of OUT_OF_SCOPE) assertIncludes(doc, expected, 'out-of-scope pipeline area')
    for (const expected of MATRIX_ROWS) assertIncludes(doc, expected, 'build matrix row')
    for (const expected of STOP_ITEMS) assertIncludes(doc, expected, 'STOP gate')

    for (const forbidden of FORBIDDEN) {
      assert.equal(doc.includes(forbidden), false, `doc must not imply forbidden policy: ${forbidden}`)
    }

    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
  },
}
