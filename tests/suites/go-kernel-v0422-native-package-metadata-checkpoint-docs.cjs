const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const CHECKPOINT = 'docs/perf/v0.4.22-native-helper-package-metadata-checkpoint.md'
const PRIOR_CHECKPOINT = 'docs/perf/v0.4.21-go-runtime-availability-checkpoint.md'
const METADATA_DOC = 'docs/perf/v0.4.22-native-helper-package-metadata.md'
const PLAN = 'docs/agentteam方案书.md'
const V0422_ARTIFACTS = [
  'docs/perf/v0.4.22-native-helper-package-metadata.md',
  'tests/suites/go-kernel-v0422-native-package-metadata-docs.cjs',
  'tests/suites/go-kernel-v0422-native-package-metadata-fixtures.cjs',
  'tests/suites/go-kernel-v0422-native-package-dry-run.cjs',
  'tests/suites/go-kernel-v0422-manifest-compatibility-guard.cjs',
  'tests/suites/go-kernel-v0422-packaged-preview-invariants.cjs',
  'tests/suites/go-kernel-v0422-package-native-guardrails.cjs',
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
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false, 'package.json#files must exclude native/helper/generated artifacts')
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

module.exports = {
  name: 'Go kernel v0.4.22 native package metadata checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [CHECKPOINT, PRIOR_CHECKPOINT, METADATA_DOC, PLAN, ...V0422_ARTIFACTS]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const checkpoint = read(root, CHECKPOINT)
    const metadataDoc = read(root, METADATA_DOC)
    const plan = read(root, PLAN)
    const combined = [checkpoint, metadataDoc, plan].join('\n\n')

    assertIncludes(plan, CHECKPOINT, 'roadmap should reference final checkpoint doc')
    assertIncludes(metadataDoc, CHECKPOINT, 'metadata doc should link final checkpoint doc')
    assertIncludes(checkpoint, PRIOR_CHECKPOINT, 'checkpoint should reference v0.4.21 checkpoint')
    for (const rel of V0422_ARTIFACTS) {
      assertIncludes(checkpoint, rel, `checkpoint should reference ${rel}`)
    }

    for (const expected of [
      'v0.4.22 Native Helper Package Metadata Checkpoint',
      'Slice 7 final GitHub-only native helper package metadata checkpoint review',
      'does not implement npm/default/native cutover',
      'change `package.json`',
      'add real package metadata',
      'add `optionalDependencies`',
      'add lifecycle hooks',
      'add helper build/download/install scripts',
      'add lockfiles',
      'add `go.mod`/`go.sum`',
      'add checked-in native binaries',
      'add tarballs',
      'add generated manifests/artifacts',
      'run `npm version`',
      'run `npm publish`',
      'make Go default',
      'change current `go-cutover`',
      'delete the TypeScript parser fallback',
      'GO only for GitHub-only v0.4.22 metadata-owner dry-run checkpoint after leader approval',
      'STOP for npm/default/native cutover',
      'STOP for real package inclusion or native package publication',
      'STOP for `package.json` metadata or version changes',
      'STOP for `optionalDependencies` or native companion dependency declarations',
      'STOP for lifecycle hooks, helper downloads, helper build/install scripts, or install-time `go build`',
      'STOP for lockfiles, Go modules, checked-in native artifacts, tarballs, generated manifests, or generated package artifacts',
      'STOP for treating `go-packaged-preview`, metadata fixtures, dry-run fixtures, or manifest guards as normal-user availability proof',
      'STOP for default Go enablement',
      'STOP for current `go-cutover` behavior changes',
      'STOP for TypeScript parser fallback deletion',
      'Slice 1 metadata owner decision',
      'Slice 2 companion package metadata fixtures',
      'Slice 3 package dry-run owner simulation',
      'Slice 4 manifest compatibility guard',
      'Slice 5 packaged preview/runtime invariants',
      'Slice 6 package/native guardrails',
      'default/unset remains disabled/TypeScript',
      'disabled, typescript, go, and auto behavior remains unchanged',
      'current `go-cutover` remains explicit/local-only and helper-path based',
      'go-packaged-preview` remains explicit-only, non-default, and not normal-user availability proof',
      'packaged helper discovery does not run in default, disabled, typescript, go, auto, or current `go-cutover`',
      'tmuxSnapshotParse` is the only cutover-owned module',
      'compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
      'runtime `/team` stays quiet',
      'package.json` version remains `0.6.8`',
      'package.json#files` excludes `kernel/` and native/helper/generated artifact paths',
      'no `optionalDependencies`',
      'no native companion package metadata in the main package',
      'no lifecycle hooks',
      'no helper build/install/download/package/version/publish scripts',
      'no `package-lock.json` or `npm-shrinkwrap.json`',
      'no root or helper `go.mod`',
      'no root or helper `go.sum`',
      'no checked-in `.exe`, `.dll`, `.so`, `.dylib`',
      'no native package fixture outside allowed docs/tests fixture sources',
      'no `kernel/` package inclusion',
      'companion package metadata fixture tests validate',
      'package dry-run simulation tests validate',
      'manifest compatibility guard validates',
      'packaged preview invariant tests prove',
      'package/native guardrails scan the real repo',
      'package/native sanity confirms',
      'Remaining Blockers Before Real Native Package Metadata or Default Cutover',
      'real package metadata owner slice approves exact main-package and/or companion-package metadata changes',
      'package release owner accepts package naming, versioning, provenance, attestation, checksum, license, and supported platform matrix responsibilities',
      'clean install smokes pass across supported platforms without a Go toolchain, source checkout, manual helper env, lifecycle download, install-time build, or hidden network fetch',
      'compact diagnostics UX is implemented and no-leak guarded',
      'resolver defaulting and packaged helper discovery are separately approved',
      'rollback story covers bad package metadata',
      'parser failure policy proves no pane loss',
      'TypeScript parser fallback deletion remains blocked',
      'compactReadModelFingerprint` remains non-cutover unless a later approved slice solves its own availability and fallback policy',
      'Go helper authority remains parser-only/stdin-stdout `tmuxSnapshotParse`',
      'node tests/run.cjs',
      'npm run typecheck',
      'npm run -s check:boundaries',
      'git diff --check',
      'npm run --silent bench:team-panel-tmux',
      'PI_AGENTTEAM_KERNEL=go-packaged-preview npm run --silent bench:team-panel-tmux',
      'package/native sanity scan',
      'requestedMode:"go-packaged-preview"',
      'fallbacks:0',
      'Proceed only with a GitHub-only v0.4.22 metadata-owner dry-run checkpoint after leader approval',
      'Do not commit, tag, or push as part of this checkpoint',
    ]) {
      assertIncludes(checkpoint, expected, 'v0.4.22 checkpoint doc')
    }

    for (const [label, pattern] of [
      ['decision split', /GO only for GitHub-only v0\.4\.22 metadata-owner dry-run checkpoint after leader approval[\s\S]*STOP for npm\/default\/native cutover[\s\S]*STOP for real package inclusion[\s\S]*STOP for `package\.json` metadata or version changes[\s\S]*STOP for `optionalDependencies`[\s\S]*STOP for lifecycle hooks[\s\S]*STOP for lockfiles, Go modules[\s\S]*STOP for treating `go-packaged-preview`[\s\S]*STOP for default Go enablement[\s\S]*STOP for current `go-cutover` behavior changes[\s\S]*STOP for TypeScript parser fallback deletion/i],
      ['artifact links', /docs\/perf\/v0\.4\.22-native-helper-package-metadata\.md[\s\S]*go-kernel-v0422-native-package-metadata-docs\.cjs[\s\S]*go-kernel-v0422-native-package-metadata-fixtures\.cjs[\s\S]*go-kernel-v0422-native-package-dry-run\.cjs[\s\S]*go-kernel-v0422-manifest-compatibility-guard\.cjs[\s\S]*go-kernel-v0422-packaged-preview-invariants\.cjs[\s\S]*go-kernel-v0422-package-native-guardrails\.cjs/i],
      ['slice summary', /Slice 1 metadata owner decision[\s\S]*Slice 2 companion package metadata fixtures[\s\S]*Slice 3 package dry-run owner simulation[\s\S]*Slice 4 manifest compatibility guard[\s\S]*Slice 5 packaged preview\/runtime invariants[\s\S]*Slice 6 package\/native guardrails/i],
      ['runtime state', /default\/unset remains disabled\/TypeScript[\s\S]*disabled, typescript, go, and auto behavior remains unchanged[\s\S]*current `go-cutover` remains explicit\/local-only and helper-path based[\s\S]*`go-packaged-preview` remains explicit-only, non-default[\s\S]*packaged helper discovery does not run in default, disabled, typescript, go, auto, or current `go-cutover`[\s\S]*`tmuxSnapshotParse` is the only cutover-owned module[\s\S]*`compactReadModelFingerprint` remains TypeScript fallback \/ non-cutover[\s\S]*runtime `\/team` stays quiet/i],
      ['package state', /package\.json` version remains `0\.6\.8`[\s\S]*package\.json#files` excludes `kernel\/` and native\/helper\/generated artifact paths[\s\S]*no `optionalDependencies`[\s\S]*no native companion package metadata[\s\S]*no lifecycle hooks[\s\S]*no helper build\/install\/download\/package\/version\/publish scripts[\s\S]*no `package-lock\.json`[\s\S]*no root or helper `go\.mod`[\s\S]*no checked-in `\.exe`, `\.dll`, `\.so`, `\.dylib`[\s\S]*no native package fixture outside allowed docs\/tests fixture sources[\s\S]*no `kernel\/` package inclusion/i],
      ['evidence', /docs\/reference guard verifies[\s\S]*companion package metadata fixture tests validate[\s\S]*package dry-run simulation tests validate[\s\S]*manifest compatibility guard validates[\s\S]*packaged preview invariant tests prove[\s\S]*package\/native guardrails scan the real repo[\s\S]*package\/native sanity confirms/i],
      ['blockers', /STOP future real native package metadata[\s\S]*real package metadata owner slice[\s\S]*package release owner accepts[\s\S]*generated native helper artifacts exist[\s\S]*clean install smokes pass[\s\S]*unsupported-platform behavior[\s\S]*compact diagnostics UX[\s\S]*resolver defaulting and packaged helper discovery[\s\S]*rollback story[\s\S]*parser failure policy[\s\S]*TypeScript parser fallback deletion remains blocked[\s\S]*Go helper authority remains parser-only/i],
      ['validation matrix', /node tests\/run\.cjs[\s\S]*npm run typecheck[\s\S]*npm run -s check:boundaries[\s\S]*git diff --check[\s\S]*npm run --silent bench:team-panel-tmux[\s\S]*PI_AGENTTEAM_KERNEL=go-packaged-preview npm run --silent bench:team-panel-tmux[\s\S]*package\/native sanity scan/i],
    ]) {
      assertMatches(checkpoint, pattern, `v0.4.22 checkpoint doc: ${label}`)
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
      'compactReadModelFingerprint becomes cutover-owned',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'Go owns state writes',
      'Go owns task/report governance',
      'Go reads mailbox full text',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.22 checkpoint docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    const kernel = env.helpers.requireDist('core/kernel.js')
    const defaultMetadata = kernel.createAgentTeamKernelAdapter({ env: {} }).metadata()
    assert.equal(defaultMetadata.kernel.requestedMode, 'disabled', 'unset mode should remain disabled')
    assert.equal(defaultMetadata.kernel.mode, 'typescript', 'unset mode should remain TypeScript')
    assert.equal(defaultMetadata.kernel.enabled, false, 'metadata checkpoint must not make Go default')
    const previewMetadata = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: {} }).metadata()
    assert.equal(previewMetadata.kernel.requestedMode, 'go-packaged-preview', 'preview mode should be explicit')
    assert.equal(previewMetadata.kernel.requestedKnownKernel, true, 'preview mode should remain known')
    assert.equal(previewMetadata.kernel.enabled, false, 'preview without packaged helper should not enable Go')
    assert.equal(previewMetadata.kernel.fallbacks, 0, 'preview mode should not use migration fallback count')

    const benchMetadata = require(path.join(root, 'tests/bench/kernelMetadata.cjs'))
    assert.equal(benchMetadata.buildKernelMetadata({ requestedMode: 'go-packaged-preview' }).kernel.requestedKnownKernel, true, 'bench metadata should know preview mode')
    const readModelBench = require(path.join(root, 'tests/bench/team-read-model-baseline.cjs'))
    assert.equal(readModelBench.shouldRunShadow('go-packaged-preview'), false, 'preview mode should not run read-model shadow')

    assertPackageNativeSanity(root)
  },
}
