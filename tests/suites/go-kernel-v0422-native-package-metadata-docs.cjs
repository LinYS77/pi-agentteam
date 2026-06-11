const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.22-native-helper-package-metadata.md'
const PREREQUISITES = [
  'docs/perf/v0.4.21-go-runtime-availability-checkpoint.md',
  'docs/perf/v0.4.21-go-native-artifact-contract.md',
  'docs/perf/v0.4.21-go-package-policy-guardrails.md',
  'docs/perf/v0.4.21-go-artifact-prototype.md',
  'docs/perf/v0.4.21-go-packaged-preview-resolver.md',
]
const PLAN = 'docs/agentteam方案书.md'
const EXPECTED_VERSION = '0.6.8'

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} should match ${pattern}`)
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
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
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
    .filter(file => /\.(?:exe|dll|so|dylib)$/i.test(file))
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
  assert.deepEqual(nativeArtifacts, [], 'native artifacts must not be checked in')
}

module.exports = {
  name: 'Go kernel v0.4.22 native package metadata docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [DOC, PLAN, ...PREREQUISITES]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const combined = [doc, plan].join('\n\n')

    assertIncludes(plan, DOC, 'roadmap should reference metadata owner doc')
    for (const rel of PREREQUISITES) {
      assertIncludes(doc, rel, `metadata owner doc should link ${rel}`)
    }

    for (const expected of [
      'v0.4.22 Native Helper Package Metadata Owner Decision',
      'Slice 1 metadata owner decision doc and docs guard only',
      'does not implement runtime resolver behavior',
      'change `package.json`',
      'change package version',
      'add package metadata',
      'add `optionalDependencies`',
      'add lifecycle hooks',
      'add package scripts',
      'add helper downloads',
      'add lockfiles',
      'add `go.mod`/`go.sum`',
      'add checked-in native binaries/tarballs/artifacts',
      'run `npm version`',
      'run `npm publish`',
      'make Go default',
      'approve default/native cutover',
      'delete the TypeScript parser fallback',
      'GO for docs/tests-only metadata owner decision and dry-run fixture planning after leader approval',
      'STOP for npm version or npm publish',
      'STOP for `package.json`, package version, `package.json#files`, package metadata, or native companion dependency changes',
      'STOP for `optionalDependencies` or optional native deps',
      'STOP for lifecycle hooks, helper install/download/build scripts',
      'STOP for lockfiles, `go.mod`, or `go.sum`',
      'STOP for checked-in native binaries, tarballs, helper executables, generated packages, manifests, or release artifacts',
      'STOP for `kernel/` package inclusion',
      'STOP for default/native cutover',
      'STOP for TypeScript parser fallback deletion',
      'metadata schema and test-only dry-run fixtures can be specified',
      'package publication and resolver defaulting remain out of scope',
      'Metadata Ownership Boundaries',
      'package metadata schema for future generated native helper artifacts or companion packages',
      'dry-run fixtures for package contents and metadata validation',
      'real `package.json` metadata changes',
      'real package publication, `npm version`, or `npm publish`',
      'runtime resolver defaulting or default/native Go enablement',
      'default/unset remains disabled/TypeScript',
      'go` and `auto` migration behavior remains unchanged',
      'current `go-cutover` remains explicit/local-only',
      'go-packaged-preview` remains explicit-only, non-default, and not normal-user availability proof',
      'tmuxSnapshotParse` is the only cutover-owned module',
      'compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
      'runtime `/team` remains quiet',
      'package.json` version remains `0.6.8`',
      'package.json#files` excludes `kernel/`',
      'no native companion package metadata',
      'no lifecycle hooks',
      'no helper build/install/download/package/version/publish scripts',
      'no `package-lock.json` or `npm-shrinkwrap.json`',
      'no root or helper `go.mod`',
      'no root or helper `go.sum`',
      'no checked-in `.exe`, `.dll`, `.so`, `.dylib`',
      'Candidate Metadata Schema Topics',
      'package identity',
      'helper identity',
      'module `tmuxSnapshotParse`',
      'provenance and integrity',
      'package contents',
      'STOP Gates Preserved',
      'default/native Go cutover is approved or implemented',
      'TypeScript parser fallback deletion appears',
      'focused docs/reference guard suite',
      'package/native sanity scan',
    ]) {
      assertIncludes(doc, expected, 'v0.4.22 metadata owner doc')
    }

    for (const [label, pattern] of [
      ['scope', /Slice 1 metadata owner decision doc and docs guard only[\s\S]*does not implement runtime resolver behavior[\s\S]*change `package\.json`[\s\S]*add package metadata[\s\S]*add `optionalDependencies`[\s\S]*add lifecycle hooks[\s\S]*add checked-in native binaries\/tarballs\/artifacts[\s\S]*run `npm version`[\s\S]*run `npm publish`[\s\S]*make Go default[\s\S]*delete the TypeScript parser fallback/i],
      ['links', /Final runtime availability checkpoint:[\s\S]*docs\/perf\/v0\.4\.21-go-runtime-availability-checkpoint\.md[\s\S]*Native artifact contract:[\s\S]*docs\/perf\/v0\.4\.21-go-native-artifact-contract\.md[\s\S]*Package policy guardrails:[\s\S]*docs\/perf\/v0\.4\.21-go-package-policy-guardrails\.md[\s\S]*CI\/package artifact prototype:[\s\S]*docs\/perf\/v0\.4\.21-go-artifact-prototype\.md[\s\S]*Packaged preview resolver:[\s\S]*docs\/perf\/v0\.4\.21-go-packaged-preview-resolver\.md/i],
      ['decision', /GO for docs\/tests-only metadata owner decision and dry-run fixture planning[\s\S]*STOP for npm version or npm publish[\s\S]*STOP for `package\.json`, package version, `package\.json#files`, package metadata[\s\S]*STOP for `optionalDependencies`[\s\S]*STOP for lifecycle hooks[\s\S]*STOP for checked-in native binaries[\s\S]*STOP for `kernel\/` package inclusion[\s\S]*STOP for default\/native cutover[\s\S]*STOP for TypeScript parser fallback deletion/i],
      ['ownership boundaries', /In scope[\s\S]*package metadata schema[\s\S]*dry-run fixtures[\s\S]*manifest fields[\s\S]*schema validation[\s\S]*test-only package-layout fixtures[\s\S]*Out of scope[\s\S]*real `package\.json` metadata changes[\s\S]*`optionalDependencies`[\s\S]*real package publication[\s\S]*runtime resolver defaulting[\s\S]*TypeScript parser fallback deletion/i],
      ['runtime facts', /default\/unset remains disabled\/TypeScript[\s\S]*disabled\/typescript behavior remains TypeScript-owned[\s\S]*`go` and `auto` migration behavior remains unchanged[\s\S]*current `go-cutover` remains explicit\/local-only[\s\S]*`go-packaged-preview` remains explicit-only, non-default[\s\S]*`tmuxSnapshotParse` is the only cutover-owned module[\s\S]*`compactReadModelFingerprint` remains TypeScript fallback[\s\S]*runtime `\/team` remains quiet/i],
      ['package facts', /package\.json` version remains `0\.6\.8`[\s\S]*package\.json#files` excludes `kernel\/`[\s\S]*no `optionalDependencies`[\s\S]*no native companion package metadata[\s\S]*no lifecycle hooks[\s\S]*no helper build\/install\/download\/package\/version\/publish scripts[\s\S]*no `package-lock\.json`[\s\S]*no root or helper `go\.mod`[\s\S]*no checked-in `\.exe`, `\.dll`, `\.so`, `\.dylib`[\s\S]*no `kernel\/` package inclusion/i],
      ['stop gates', /STOP v0\.4\.22 package\/native metadata work[\s\S]*`package\.json` changes[\s\S]*`package\.json#files` includes `kernel\/`[\s\S]*`optionalDependencies`[\s\S]*lifecycle hooks[\s\S]*postinstall\/preinstall\/prepare downloads[\s\S]*install-time `go build`[\s\S]*package-lock\.json[\s\S]*go\.mod[\s\S]*checked-in `\.exe`, `\.dll`, `\.so`, `\.dylib`[\s\S]*npm version, npm publish[\s\S]*default\/native Go cutover[\s\S]*TypeScript parser fallback deletion/i],
    ]) {
      assertMatches(doc, pattern, `v0.4.22 metadata owner doc: ${label}`)
    }

    for (const forbiddenPhrase of [
      'Go is default',
      'Go remains default',
      'Go runtime is required',
      'native/default cutover is approved',
      'native packaging is approved',
      'native implementation is approved',
      'npm publish is approved',
      'npm version is approved',
      'package artifact approval is granted',
      'package metadata changed',
      'package metadata is changed',
      'checked-in binary is allowed',
      'postinstall download is allowed',
      'preinstall download is allowed',
      'prepare download is allowed',
      'install-time Go build is allowed',
      'fallback deletion is approved',
      'delete the TypeScript fallback now',
      'commit/tag/push as part of this checkpoint',
      'compactReadModelFingerprint becomes cutover-owned',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'Go owns state writes',
      'Go owns task/report governance',
      'Go reads mailbox full text',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.22 metadata owner docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assertPackageNativeSanity(root)
  },
}
