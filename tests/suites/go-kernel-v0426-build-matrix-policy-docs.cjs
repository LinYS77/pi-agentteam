const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.26-go-helper-artifact-pipeline.md'
const PACKAGE_VERSION = '0.6.8'
const CANDIDATES = [
  { target: 'linux-x64-glibc', os: 'linux', arch: 'x64', libc: 'glibc', exe: '`agentteam-tmuxSnapshotParse`' },
  { target: 'linux-arm64-glibc', os: 'linux', arch: 'arm64', libc: 'glibc', exe: '`agentteam-tmuxSnapshotParse`' },
  { target: 'darwin-arm64', os: 'darwin', arch: 'arm64', libc: 'n/a', exe: '`agentteam-tmuxSnapshotParse`' },
  { target: 'darwin-x64', os: 'darwin', arch: 'x64', libc: 'n/a', exe: '`agentteam-tmuxSnapshotParse`' },
  { target: 'win32-x64', os: 'win32', arch: 'x64', libc: 'n/a', exe: '`agentteam-tmuxSnapshotParse.exe`' },
]
const UNSUPPORTED = [
  'linux-x64-musl',
  'linux-arm64-musl',
  'win32-arm64',
  'other os/arch/libc targets',
]
const POLICY_PHRASES = [
  '`go build` may be used only in explicit artifact-generation CI/local prototype after approval',
  '`go build` is never allowed in npm lifecycle',
  '`go build` is never allowed in package install',
  '`go build` is never allowed in runtime resolver',
  '`go build` is never allowed in default user path',
  'no hidden network fetch',
  'no lifecycle download',
  'no install-time build',
  'no package scripts in this slice',
  'no helper build/install/package scripts in this slice',
  'adding go.mod/go.sum remains STOP unless separately approved',
  'if future build requires modules, it needs a separate owner decision',
]
const FORBIDDEN = [
  'actual build implementation is added',
  'CI workflow implementation is approved',
  'artifacts are generated',
  'support is proven',
  'normal-user support is proven',
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
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|build-matrix-output)\.(?:json|jsonc|yaml|yml)$/i
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
  name: 'Go kernel v0.4.26 build matrix policy docs',
  async run(env) {
    const root = env.helpers.extRoot
    assert.equal(fs.existsSync(path.join(root, DOC)), true, `${DOC} should exist`)
    const doc = read(root, DOC)
    const lower = doc.toLowerCase()

    for (const expected of [
      'Slice 2 — Build Matrix and Build Command Policy',
      'Slice 2 is docs/tests-only build matrix and command policy',
      'Candidate/prototype build matrix',
      'Future unsupported rows until proven',
      'Helper build command policy',
      'Go module policy',
      'Unsupported platform policy',
      'Slice 2 preserves the Slice 1 release/package boundary',
      'Proceed only with GitHub-only v0.4.26 Go helper artifact generation pipeline prototype checkpoint review after leader/user approval',
    ]) {
      assert.ok(lower.includes(expected.toLowerCase()), `doc should include ${expected}`)
    }

    for (const row of CANDIDATES) {
      const line = doc.split('\n').find(value => value.startsWith(`| ${row.target} |`)) || ''
      assertIncludes(line, `| ${row.os} | ${row.arch} | ${row.libc} |`, `candidate row ${row.target}`)
      assertIncludes(line, row.exe, `candidate row ${row.target}`)
      assert.match(line, /executable|extension/i, `candidate row ${row.target} should include permission behavior`)
      assertIncludes(line, 'native runner preferred; cross-compile allowed only with explicit proof', `candidate row ${row.target}`)
      assert.match(line, /validation|smoke|clean-install/i, `candidate row ${row.target} should include validation expectation`)
    }

    for (const row of UNSUPPORTED) {
      assertIncludes(doc, row, 'unsupported row')
      const pattern = new RegExp(`\\| ${row.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\| future unsupported until proven \\| fail-closed; no normal-user support claim \\|`, 'i')
      assert.match(doc, pattern, `unsupported row should be fail-closed for ${row}`)
    }

    for (const phrase of POLICY_PHRASES) assertIncludes(doc, phrase, 'build command policy')

    for (const phrase of [
      'unsupported rows are fail-closed and do not imply normal-user support',
      'support claims require CI/toolchain proof and approval',
      'unsupported rows do not permit default Go, native/default cutover, fallback deletion, or package/native approval',
    ]) {
      assertIncludes(doc, phrase, 'unsupported platform policy')
    }

    for (const forbidden of FORBIDDEN) {
      assert.equal(doc.includes(forbidden), false, `doc must not imply forbidden policy: ${forbidden}`)
    }

    assertPackageNativeSanity(root)
    assertRepoArtifactSanity(root)
  },
}
