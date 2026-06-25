const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.25-native-helper-availability-proof.md'
const PLAN = 'docs/agentteam方案书.md'
const PRIOR_ARTIFACTS = [
  'docs/perf/v0.4.21-go-runtime-availability-checkpoint.md',
  'docs/perf/v0.4.21-go-native-artifact-contract.md',
  'docs/perf/v0.4.21-go-artifact-prototype.md',
  'docs/perf/v0.4.22-native-helper-package-metadata-checkpoint.md',
  'docs/perf/v0.4.23-compact-native-failure-diagnostics-checkpoint.md',
  'docs/perf/v0.4.24-explicit-readiness-command-integration-checkpoint.md',
  'docs/decisions/0001-replaceable-go-kernel.md',
  'docs/decisions/0002-module-owned-go-kernel-cutover.md',
]
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
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package.json#files must exclude native/helper/generated artifacts')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
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

module.exports = {
  name: 'Go kernel v0.4.25 native availability contract docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [DOC, PLAN, ...PRIOR_ARTIFACTS]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const combined = [doc, plan].join('\n\n')

    for (const rel of PRIOR_ARTIFACTS) {
      assertIncludes(doc, rel, `native availability doc should link ${rel}`)
    }
    assertIncludes(plan, DOC, 'roadmap should reference v0.4.25 doc')

    for (const expected of [
      'v0.4.25 Native Helper Availability Proof Checkpoint',
      'Slice 1 docs/tests-only owner contract',
      'what native helper availability proof must show before default/native behavior or TypeScript fallback deletion can be discussed',
      'does not implement an artifact validator',
      'runtime resolver',
      'package metadata',
      'native artifacts',
      'default Go',
      'fallback deletion',
      '`/team readiness` expansion',
      'v0.4.25 follows v0.4.24 because `/team readiness` is contained as transitional reviewer tooling',
      'native helper availability for the deterministic hot-path module `tmuxSnapshotParse`, not feature expansion',
      'pi extension/provider/tool surfaces are TS/JS/Node-based',
      'no native Go pi extension/provider ABI is assumed',
      'TS/pi control plane remains mandatory',
      'Go helper must be invoked behind TS adapter/ports via subprocess/RPC/stdin-stdout',
      'Go is not a pi extension/provider surface in this plan',
      'generated artifact shape',
      'manifest/checksum/provenance/license/executable validation',
      'clean-install smoke simulation',
      'unsupported-platform behavior',
      'rollback/version skew',
      'resolver/default gate',
      'module cutover/fallback deletion gate documentation',
      'real artifacts/package metadata/default behavior',
      'npm version/publish',
      'native Go pi extension',
      'TypeScript fallback deletion',
      '`/team readiness` expansion',
      'broad Go authority',
      'Native Availability Decision Matrix',
      'generated artifacts',
      'clean install',
      'diagnostics',
      'unsupported platform',
      'rollback',
      'package release ownership',
      'parser failure policy',
      'user approval',
      'Required before default/native/fallback deletion',
      'default/unset remains disabled/TypeScript',
      'go-packaged-preview` remains explicit-only and non-default',
      'current `go-cutover` remains unchanged and helper-path based',
      'compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
      'package.json` version remains `0.6.8`',
      'no package/native artifacts/metadata changes',
      'STOP Gates',
      'package.json change',
      'package version change',
      'npm version',
      'npm publish',
      'default Go enablement',
      'TypeScript fallback deletion',
      'readiness expansion',
      'broader Go authority',
      'native Go pi extension assumption',
      'normal-user native availability claims before proof is accepted',
      'node tests/run.cjs go-kernel-v0425-native-availability-contract-docs',
      'node --check tests/suites/go-kernel-v0425-native-availability-contract-docs.cjs',
      'Proceed only with v0.4.25 Slice 1-6 GitHub-only checkpoint review after leader/user approval',
    ]) {
      assertIncludes(doc, expected, 'v0.4.25 native availability doc')
    }

    for (const [label, pattern] of [
      ['runtime finding', /T013 pi Runtime Boundary Finding[\s\S]*pi extension\/provider\/tool surfaces are TS\/JS\/Node-based[\s\S]*no native Go pi extension\/provider ABI is assumed[\s\S]*TS\/pi control plane remains mandatory[\s\S]*Go helper must be invoked behind TS adapter\/ports via subprocess\/RPC\/stdin-stdout/i],
      ['in scope', /In-Scope v0\.4\.25 Proof Areas[\s\S]*generated artifact shape[\s\S]*manifest\/checksum\/provenance\/license\/executable validation[\s\S]*clean-install smoke simulation[\s\S]*unsupported-platform behavior[\s\S]*rollback\/version skew[\s\S]*resolver\/default gate[\s\S]*module cutover\/fallback deletion gate documentation/i],
      ['out of scope', /Out of Scope[\s\S]*real artifacts\/package metadata\/default behavior[\s\S]*npm version\/publish[\s\S]*native Go pi extension[\s\S]*default Go[\s\S]*TypeScript fallback deletion[\s\S]*`\/team readiness` expansion[\s\S]*broad Go authority/i],
      ['decision matrix', /Native Availability Decision Matrix[\s\S]*Required before default\/native\/fallback deletion[\s\S]*generated artifacts[\s\S]*clean install[\s\S]*diagnostics[\s\S]*unsupported platform[\s\S]*rollback[\s\S]*package release ownership[\s\S]*parser failure policy[\s\S]*user approval/i],
      ['invariants', /default\/unset remains disabled\/TypeScript[\s\S]*`go-packaged-preview` remains explicit-only and non-default[\s\S]*current `go-cutover` remains unchanged and helper-path based[\s\S]*`compactReadModelFingerprint` remains TypeScript fallback[\s\S]*`package\.json` version remains `0\.6\.8`[\s\S]*no package\/native artifacts\/metadata changes/i],
      ['stop gates', /STOP Gates[\s\S]*package\.json change[\s\S]*package version change[\s\S]*npm version[\s\S]*npm publish[\s\S]*default Go enablement[\s\S]*TypeScript fallback deletion[\s\S]*readiness expansion[\s\S]*broader Go authority[\s\S]*native Go pi extension assumption[\s\S]*current `go-cutover` behavior changes[\s\S]*`go-packaged-preview` availability semantics changes/i],
      ['future validation', /Future v0\.4\.25 checkpoint validation must include[\s\S]*generated artifact fixture validation[\s\S]*manifest\/checksum\/provenance\/license\/executable validation[\s\S]*clean-install smoke simulation[\s\S]*unsupported-platform behavior tests[\s\S]*rollback\/version skew tests[\s\S]*resolver\/default gate tests[\s\S]*module cutover\/fallback deletion gate documentation guard/i],
    ]) {
      assertMatches(doc, pattern, `v0.4.25 native availability doc: ${label}`)
    }

    for (const forbiddenPhrase of [
      'normal-user availability is proven',
      'normal-user native availability is proven',
      'native/default cutover is approved',
      'native packaging is approved',
      'native implementation is approved',
      'fallback deletion is approved',
      'delete the TypeScript fallback now',
      'npm publish is approved',
      'npm version is approved',
      'Go is default',
      'Go remains default',
      'Go is a pi extension',
      'Go pi extension is available',
      'package metadata changed',
      'package metadata is changed',
      'checked-in binary is allowed',
      'postinstall download is allowed',
      'preinstall download is allowed',
      'prepare download is allowed',
      'install-time Go build is allowed',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'Go owns state writes',
      'Go reads mailbox full text',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.25 docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assertPackageNativeSanity(root)
  },
}
