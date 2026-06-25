const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const CHECKPOINT = 'docs/perf/v0.4.21-go-runtime-availability-checkpoint.md'
const V0420_CHECKPOINT = 'docs/perf/v0.4.20-go-cutover-checkpoint.md'
const SLICE_DOCS = [
  'docs/perf/v0.4.21-go-runtime-availability.md',
  'docs/perf/v0.4.21-go-native-artifact-contract.md',
  'docs/perf/v0.4.21-go-package-policy-guardrails.md',
  'docs/perf/v0.4.21-go-resolver-diagnostics-design.md',
  'docs/perf/v0.4.21-go-packaged-preview-resolver.md',
  'docs/perf/v0.4.21-go-artifact-prototype.md',
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
  name: 'Go kernel v0.4.21 runtime availability checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [CHECKPOINT, V0420_CHECKPOINT, PLAN, ...SLICE_DOCS]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const checkpoint = read(root, CHECKPOINT)
    const plan = read(root, PLAN)
    const combined = [checkpoint, plan].join('\n\n')

    assertIncludes(plan, CHECKPOINT, 'roadmap should reference final checkpoint doc')
    assertIncludes(checkpoint, V0420_CHECKPOINT, 'checkpoint should reference v0.4.20 final checkpoint')
    for (const rel of SLICE_DOCS) {
      assertIncludes(checkpoint, rel, `checkpoint should reference ${rel}`)
    }

    for (const expected of [
      'v0.4.21 Go Runtime Availability Checkpoint',
      'Slice 7 final runtime availability/native packaging signoff checkpoint review',
      'does not implement default/native cutover',
      'change `package.json`',
      'add package metadata',
      'add `optionalDependencies`',
      'add lifecycle hooks',
      'add package scripts',
      'add lockfiles',
      'add `go.mod`/`go.sum`',
      'add checked-in native artifacts',
      'run `npm version`',
      'run `npm publish`',
      'make Go default',
      'delete the TypeScript parser fallback',
      'GO for GitHub-only v0.4.21 runtime availability/signoff checkpoint after leader approval',
      'STOP for npm/default/native cutover',
      'STOP for TypeScript parser fallback deletion',
      'STOP for treating `go-packaged-preview` as normal-user availability proof',
      'Slice 1 availability decision matrix / Model C0',
      'Slice 2 native artifact contract',
      'Slice 3 package policy guardrails',
      'Slice 4 resolver diagnostics UX design',
      'Slice 5 explicit non-default `go-packaged-preview` resolver skeleton',
      'Slice 6 temp-fixture artifact/package/install prototype',
      'default/unset remains disabled/TypeScript',
      'disabled/typescript/go/auto behavior remains unchanged',
      'current `go-cutover` remains explicit/local-only',
      'go-packaged-preview` is explicit-only, non-default, and not normal-user availability proof',
      'packaged helper discovery does not run in default, disabled, typescript, go, auto, or current `go-cutover`',
      'tmuxSnapshotParse` is the only cutover-owned module',
      'compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
      'runtime `/team` stays quiet',
      'package.json` version remains `0.6.8`',
      'package.json#files` excludes `kernel/`',
      'no `optionalDependencies`',
      'no lifecycle hooks',
      'no helper build/install/download/package/version/publish scripts',
      'no `package-lock.json` or `npm-shrinkwrap.json`',
      'no root or helper `go.mod`',
      'no root or helper `go.sum`',
      'no checked-in `.exe`, `.dll`, `.so`, `.dylib`',
      'no `kernel/` package inclusion',
      'preview resolver tests cover',
      'artifact manifest/prototype temp fixture tests cover',
      'package/native sanity guards confirm',
      'bench metadata remains TypeScript/default',
      'go-packaged-preview` is known metadata but no-shadow and non-default',
      'real package metadata owner slice',
      'generated native artifacts/package contents',
      'checksum manifests, provenance/attestation, license metadata',
      'clean install smokes pass across supported OS/arch/libc matrix',
      'compact diagnostics UX is implemented and no-leak guarded',
      'rollback story and package release process',
      'no hidden TypeScript parser fallback exists for default/native cutover failures',
      'node tests/run.cjs',
      'npm run typecheck',
      'npm run -s check:boundaries',
      'git diff --check',
      'npm run --silent bench:team-panel-tmux',
      'PI_AGENTTEAM_KERNEL=go-packaged-preview npm run --silent bench:team-panel-tmux',
      'package/native sanity scan',
      'requestedMode:"go-packaged-preview"',
      'fallbacks:0',
      'Proceed only with a GitHub-only v0.4.21 runtime availability/signoff checkpoint after leader approval',
    ]) {
      assertIncludes(checkpoint, expected, 'v0.4.21 checkpoint doc')
    }

    for (const [label, pattern] of [
      ['decision split', /GO for GitHub-only v0\.4\.21 runtime availability\/signoff checkpoint after leader approval[\s\S]*STOP for npm\/default\/native cutover[\s\S]*STOP for TypeScript parser fallback deletion[\s\S]*STOP for treating `go-packaged-preview` as normal-user availability proof/i],
      ['slice summary', /Slice 1 availability decision matrix \/ Model C0[\s\S]*Slice 2 native artifact contract[\s\S]*Slice 3 package policy guardrails[\s\S]*Slice 4 resolver diagnostics UX design[\s\S]*Slice 5 explicit non-default `go-packaged-preview` resolver skeleton[\s\S]*Slice 6 temp-fixture artifact\/package\/install prototype/i],
      ['runtime state', /default\/unset remains disabled\/TypeScript[\s\S]*disabled\/typescript\/go\/auto behavior remains unchanged[\s\S]*current `go-cutover` remains explicit\/local-only[\s\S]*`go-packaged-preview` is explicit-only, non-default[\s\S]*packaged helper discovery does not run in default, disabled, typescript, go, auto, or current `go-cutover`[\s\S]*`tmuxSnapshotParse` is the only cutover-owned module[\s\S]*`compactReadModelFingerprint` remains TypeScript fallback[\s\S]*runtime `\/team` stays quiet/i],
      ['package sanity doc', /package\.json` version remains `0\.6\.8`[\s\S]*package\.json#files` excludes `kernel\/`[\s\S]*no `optionalDependencies`[\s\S]*no lifecycle hooks[\s\S]*no helper build\/install\/download\/package\/version\/publish scripts[\s\S]*no `package-lock\.json`[\s\S]*no root or helper `go\.mod`[\s\S]*no checked-in `\.exe`, `\.dll`, `\.so`, `\.dylib`[\s\S]*no `kernel\/` package inclusion/i],
      ['evidence', /docs\/reference guards[\s\S]*preview resolver tests cover[\s\S]*artifact manifest\/prototype temp fixture tests cover[\s\S]*package\/native sanity guards confirm[\s\S]*bench metadata remains TypeScript\/default[\s\S]*known metadata but no-shadow/i],
      ['stop gates', /STOP future default\/native cutover[\s\S]*real package metadata owner slice[\s\S]*generated native artifacts\/package contents[\s\S]*clean install smokes pass across supported OS\/arch\/libc matrix[\s\S]*compact diagnostics UX is implemented and no-leak guarded[\s\S]*rollback story and package release process[\s\S]*no hidden TypeScript parser fallback[\s\S]*Go helper authority remains parser-only\/stdin-stdout/i],
      ['validation matrix', /node tests\/run\.cjs[\s\S]*npm run typecheck[\s\S]*npm run -s check:boundaries[\s\S]*git diff --check[\s\S]*npm run --silent bench:team-panel-tmux[\s\S]*PI_AGENTTEAM_KERNEL=go-packaged-preview npm run --silent bench:team-panel-tmux[\s\S]*package\/native sanity scan/i],
    ]) {
      assertMatches(checkpoint, pattern, `v0.4.21 checkpoint doc: ${label}`)
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
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.21 checkpoint docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    const kernel = env.helpers.requireDist('core/kernel.js')
    assert.equal(kernel.isKnownAgentTeamKernelMode('go-packaged-preview'), true, 'go-packaged-preview should remain known')
    const defaultMetadata = kernel.createAgentTeamKernelAdapter({ env: {} }).metadata()
    assert.equal(defaultMetadata.kernel.requestedMode, 'default', 'unset mode should normalize to default after v0.6.48')
    assert.equal(defaultMetadata.kernel.mode, 'go', 'unset mode should use embedded Go for tmuxSnapshotParse')
    assert.equal(defaultMetadata.kernel.enabled, true, 'default embedded helper should enable parser-only Go')
    assert.equal(defaultMetadata.kernel.cutoverStatus, 'active', 'default embedded helper should be active')
    const previewMetadata = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: {} }).metadata()
    assert.equal(previewMetadata.kernel.requestedMode, 'go-packaged-preview', 'preview mode should be explicit')
    assert.equal(previewMetadata.kernel.requestedKnownKernel, true, 'preview mode should be known')
    assert.equal(previewMetadata.kernel.enabled, false, 'preview without packaged helper should not enable Go')
    assert.equal(previewMetadata.kernel.fallbacks, 0, 'preview mode should not use migration fallback count')
    assert.equal(Object.prototype.hasOwnProperty.call(previewMetadata.kernel, 'fallbackKind'), false, 'preview mode should not expose fallbackKind')

    const benchMetadata = require(path.join(root, 'tests/bench/kernelMetadata.cjs'))
    assert.equal(benchMetadata.buildKernelMetadata({ requestedMode: 'go-packaged-preview' }).kernel.requestedKnownKernel, true, 'bench metadata should know preview mode')
    const readModelBench = require(path.join(root, 'tests/bench/team-read-model-baseline.cjs'))
    assert.equal(readModelBench.shouldRunShadow('go-packaged-preview'), false, 'preview mode should not run read-model shadow')

    assertPackageNativeSanity(root)
  },
}
