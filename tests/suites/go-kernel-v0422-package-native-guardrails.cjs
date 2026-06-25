const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.22-native-helper-package-metadata.md'
const PLAN = 'docs/agentteam方案书.md'
const EXPECTED_VERSION = '0.6.8'
const ALLOWED_FIXTURE_SOURCES = [
  'docs/perf/v0.4.22-native-helper-package-metadata.md',
  'docs/agentteam方案书.md',
  'tests/suites/go-kernel-v0422-native-package-metadata-docs.cjs',
  'tests/suites/go-kernel-v0422-native-package-metadata-fixtures.cjs',
  'tests/suites/go-kernel-v0422-native-package-dry-run.cjs',
  'tests/suites/go-kernel-v0422-manifest-compatibility-guard.cjs',
  'tests/suites/go-kernel-v0422-packaged-preview-invariants.cjs',
  'tests/suites/go-kernel-v0422-package-native-guardrails.cjs',
]
const FORBIDDEN_REPO_ARTIFACT_EXTENSIONS = /\.(?:exe|dll|so|dylib|tgz)$/i
const FORBIDDEN_GENERATED_ARTIFACT_NAMES = /(?:agentteam.*(?:helper|kernel)|go-helper|native-helper|generated.*manifest|agentteam-go-helper-manifest\.json)$/i

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

function isAllowedFixtureSource(root, file) {
  const rel = path.relative(root, file).replace(/\\/g, '/')
  return ALLOWED_FIXTURE_SOURCES.includes(rel)
}

function assertMainPackageUnchanged(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, EXPECTED_VERSION, 'main package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'main package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'dependencies'), false, 'main package must not add native/helper dependencies')
  assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'package.json#files must exclude kernel/')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package.json#files must exclude native helper/generated artifact paths')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'main package must not add native helper metadata')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'os'), false, 'main package must not add native os metadata')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'cpu'), false, 'main package must not add native cpu metadata')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `main package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    assert.equal(/go\s+(?:build|install)\b/.test(command), false, `${name} must not build/install helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild/i.test(command), false, `${name} must not download/build native helper`)
    assert.equal(/kernel\//i.test(command) && /pack|publish|files|npm/i.test(command), false, `${name} must not package kernel/`)
  }
}

function assertNoRepoArtifacts(root) {
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
  const forbiddenFiles = walkFiles(root)
    .filter(file => !file.includes(`${path.sep}node_modules${path.sep}`) && !file.includes(`${path.sep}.git${path.sep}`))
    .filter(file => {
      const rel = path.relative(root, file).replace(/\\/g, '/')
      if (isAllowedFixtureSource(root, file)) return false
      if (FORBIDDEN_REPO_ARTIFACT_EXTENSIONS.test(file)) return true
      if (/^(?:manifest|bin)\//.test(rel)) return true
      if (FORBIDDEN_GENERATED_ARTIFACT_NAMES.test(path.basename(file)) && !rel.startsWith('tests/suites/')) return true
      return false
    })
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .sort()
  assert.deepEqual(forbiddenFiles, [], 'repo must not contain checked-in native/package/generated artifacts outside allowed docs/tests fixtures')
}

function assertAllowedFixtureBoundaries(root) {
  for (const rel of ALLOWED_FIXTURE_SOURCES) {
    assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist as allowed fixture source`)
  }
  for (const rel of ALLOWED_FIXTURE_SOURCES.filter(item => item.startsWith('tests/suites/') && item !== 'tests/suites/go-kernel-v0422-package-native-guardrails.cjs')) {
    const source = read(root, rel)
    if (source.includes('fs.mkdtempSync(')) {
      assert.match(source, /os\.tmpdir\(\)/, `${rel} temp fixtures should use os.tmpdir()`)
      assert.match(source, /rmSync\([^\n]+recursive: true, force: true/, `${rel} temp fixtures should cleanup with rmSync`)
    }
  }
  const doc = read(root, DOC)
  assert.ok(doc.includes('Allowed fixture text is limited to docs and JS test suites'), 'doc should distinguish allowed fixture text')
  assert.ok(doc.includes('v0.4.22 metadata fixtures are not real package inclusion'), 'doc should state fixtures are not real package inclusion')
  const plan = read(root, PLAN)
  assert.ok(plan.includes('tests/suites/go-kernel-v0422-package-native-guardrails.cjs'), 'roadmap should reference Slice 6 guard suite')
}

module.exports = {
  name: 'Go kernel v0.4.22 package/native guardrails',
  async run(env) {
    const root = env.helpers.extRoot
    assertMainPackageUnchanged(root)
    assertNoRepoArtifacts(root)
    assertAllowedFixtureBoundaries(root)
  },
}
