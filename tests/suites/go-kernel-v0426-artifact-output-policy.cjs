const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { assertNoUnapprovedWorkflowReleaseOrPackageBehavior } = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const DOC = 'docs/perf/v0.4.26-go-helper-artifact-pipeline.md'
const PACKAGE_VERSION = '0.6.8'
const IGNORED_LOCAL_DIR = '.agentteam-artifacts/'
const TARGETS = ['linux-x64-glibc', 'linux-arm64-glibc', 'darwin-arm64', 'darwin-x64', 'win32-x64']
const FILES = [
  'agentteam-tmuxSnapshotParse',
  'agentteam-tmuxSnapshotParse.exe',
  'manifest.json',
  'SHA256SUMS',
  'provenance.json',
  'LICENSE',
  'license.json',
  'attestation.intoto.jsonl',
]
const FORBIDDEN = [
  'artifacts are generated',
  'release assets are approved',
  'normal-user availability is proven',
  'native/default cutover is approved',
  'fallback deletion is approved',
  'native packaging is approved',
  'npm publish is approved',
  'npm version is approved',
  'Go is default',
  'native Go pi extension is assumed',
  'broader Go authority is approved',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function mkTempRoot() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0426-output-policy-'))
  assert.equal(path.dirname(tempRoot), os.tmpdir(), 'prototype output root must be under OS tmpdir')
  return tempRoot
}

function safeJoinOutput(root, target, filename) {
  assert.ok(TARGETS.includes(target), `known target ${target}`)
  assert.ok(FILES.includes(filename), `known file ${filename}`)
  assert.equal(path.isAbsolute(filename), false, 'filename must be package-relative')
  assert.equal(filename.includes('..'), false, 'filename must not traverse')
  assert.equal(/[\\/]/.test(filename), false, 'filename must be a file name, not nested path')
  const output = path.join(root, 'artifact-output', target, filename)
  assert.ok(output.startsWith(`${root}${path.sep}`), 'output must stay under temp root')
  return output
}

function createTempOutputTree(root) {
  for (const target of TARGETS) {
    const fileNames = target === 'win32-x64'
      ? ['agentteam-tmuxSnapshotParse.exe', 'manifest.json', 'SHA256SUMS', 'provenance.json', 'LICENSE', 'license.json', 'attestation.intoto.jsonl']
      : ['agentteam-tmuxSnapshotParse', 'manifest.json', 'SHA256SUMS', 'provenance.json', 'LICENSE', 'license.json', 'attestation.intoto.jsonl']
    for (const filename of fileNames) {
      const output = safeJoinOutput(root, target, filename)
      fs.mkdirSync(path.dirname(output), { recursive: true })
      fs.writeFileSync(output, 'test-local placeholder only')
    }
  }
}

function assertTempOutputPolicy(root, repoRoot) {
  assert.equal(root.startsWith(os.tmpdir()), true, 'fixture root should be under OS temp')
  createTempOutputTree(root)
  const generated = []
  for (const target of TARGETS) {
    const dir = path.join(root, 'artifact-output', target)
    for (const entry of fs.readdirSync(dir)) generated.push(path.join(dir, entry))
  }
  assert.ok(generated.length > 0, 'test-local output fixture should create temp files')
  for (const file of generated) {
    assert.ok(file.startsWith(`${root}${path.sep}`), 'generated temp file should stay under temp root')
    assert.equal(file.startsWith(repoRoot), false, 'generated temp file should not be under repo root')
  }
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
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|artifact-output-manifest|provenance|attestation\.intoto)\.(?:json|jsonc|yaml|yml|jsonl)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated manifest/package artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  const packageFiles = packageJson.files || []
  assert.equal(packageFiles.some(item => item === IGNORED_LOCAL_DIR || item.startsWith(IGNORED_LOCAL_DIR) || item.includes('.agentteam-artifacts')), false, 'package files must not include ignored artifact dir')
  assert.equal(packageFiles.some(item => /(?:helper|native|manifest|artifact|generated|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false, 'package files must not include native/helper/generated outputs')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
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
  name: 'Go kernel v0.4.26 artifact output policy',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = read(root, DOC)
    const lower = doc.toLowerCase()

    for (const expected of [
      'Slice 3 — Local/CI Artifact Output Policy and Prototype',
      'Slice 3 is docs/tests and temp/ignored-output policy/prototype only',
      'OS temp root is preferred for tests',
      'Optional ignored local directory may be named `.agentteam-artifacts/`',
      '.agentteam-artifacts/` must be ignored and excluded from package files',
      'Generated outputs must never be committed',
      'CI workspace outputs and GitHub Actions artifact upload may be future prototype storage after explicit approval',
      'No GitHub release assets in Slice 3',
      'No npm package inclusion',
      'No install/runtime download path',
      'No CI workflow is added in Slice 3',
      'helper executable',
      'manifest JSON',
      'checksum file',
      'provenance metadata',
      'license metadata/copy',
      'optional attestation placeholder',
      'Cleanup and no-source-inclusion behavior',
      'Repository/package no-artifact scan policy',
      'Slice 3 preserves the Slice 1 release/package boundary and Slice 2 build command policy',
      'Proceed only with GitHub-only v0.4.26 Go helper artifact generation pipeline prototype checkpoint review after leader/user approval',
      'Slice 3 focused guard: `node tests/run.cjs go-kernel-v0426-artifact-output-policy`',
      'Slice 3 syntax check: `node --check tests/suites/go-kernel-v0426-artifact-output-policy.cjs`',
    ]) {
      assert.ok(lower.includes(expected.toLowerCase()), `doc should include ${expected}`)
    }

    for (const filename of FILES) assertIncludes(doc, filename, 'artifact file list')
    for (const target of TARGETS) assertIncludes(doc, target, 'build matrix target context')

    for (const forbidden of FORBIDDEN) {
      assert.equal(doc.includes(forbidden), false, `doc must not imply forbidden policy: ${forbidden}`)
    }

    let tempRoot
    try {
      tempRoot = mkTempRoot()
      assertTempOutputPolicy(tempRoot, root)
    } finally {
      if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
    }

    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
    assertNoCiReleaseOrPackageScripts(root)
  },
}
