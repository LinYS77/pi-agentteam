const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES,
} = require('../fixtures/kernel/historicalCheckpointDeletionMap.cjs')

const READY_DELETED_SUITES = new Set(HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES)

const CHECKPOINT = 'docs/perf/v0.4.23-compact-native-failure-diagnostics-checkpoint.md'
const PRIOR_CHECKPOINT = 'docs/perf/v0.4.22-native-helper-package-metadata-checkpoint.md'
const DIAGNOSTICS_DOC = 'docs/perf/v0.4.23-compact-native-failure-diagnostics.md'
const PLAN = 'docs/agentteam方案书.md'
const V0423_ARTIFACTS = [
  'docs/perf/v0.4.23-compact-native-failure-diagnostics.md',
  'core/kernelDiagnostics.ts',
  'tests/suites/go-kernel-v0423-compact-diagnostics-docs.cjs',
  'tests/suites/go-kernel-v0423-compact-diagnostics-model.cjs',
  'tests/suites/go-kernel-v0423-parser-failure-policy.cjs',
  'tests/suites/go-kernel-v0423-compact-diagnostics-readiness.cjs',
]
const EXPECTED_VERSION = '0.6.8'

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertReadyDeletedOrExists(root, rel, label = rel) {
  const exists = fs.existsSync(path.join(root, rel))
  if (READY_DELETED_SUITES.has(rel)) {
    assert.equal(exists, false, `${label} should be absent after the T024 ready-suite deletion slice`)
    return
  }
  assert.equal(exists, true, `${label} should exist`)
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
  name: 'Go kernel v0.4.23 compact diagnostics checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [CHECKPOINT, PRIOR_CHECKPOINT, DIAGNOSTICS_DOC, PLAN, ...V0423_ARTIFACTS]) {
      assertReadyDeletedOrExists(root, rel)
    }

    const checkpoint = read(root, CHECKPOINT)
    const diagnosticsDoc = read(root, DIAGNOSTICS_DOC)
    const plan = read(root, PLAN)
    const combined = [checkpoint, diagnosticsDoc, plan].join('\n\n')

    assertIncludes(plan, CHECKPOINT, 'roadmap should reference final checkpoint doc')
    assertIncludes(diagnosticsDoc, CHECKPOINT, 'diagnostics doc should link final checkpoint doc')
    assertIncludes(checkpoint, PRIOR_CHECKPOINT, 'checkpoint should reference v0.4.22 checkpoint')
    for (const rel of V0423_ARTIFACTS) {
      assertIncludes(checkpoint, rel, `checkpoint should reference ${rel}`)
    }

    for (const expected of [
      'v0.4.23 Compact Native Failure Diagnostics Checkpoint',
      'Slice 5 final GitHub-only compact native failure diagnostics and release decision gate checkpoint review',
      'does not implement runtime UI/panel diagnostics rendering',
      'command integration',
      'npm/default/native cutover',
      'real package inclusion',
      'package.json` metadata or version changes',
      'optionalDependencies',
      'lifecycle hooks/downloads',
      'lockfiles, Go modules, native artifacts, tarballs, generated manifests/artifacts',
      'npm versioning',
      'npm publication',
      'default Go enablement',
      'current `go-cutover` behavior changes',
      'go-packaged-preview` availability semantics changes',
      'TypeScript parser fallback deletion',
      'GO only for GitHub-only v0.4.23 compact diagnostics/release decision gate checkpoint after leader approval',
      'STOP for runtime UI diagnostics rendering',
      'STOP for command integration',
      'STOP for npm/default/native cutover',
      'STOP for real package inclusion or native package publication',
      'STOP for `package.json` metadata or version changes',
      'STOP for `optionalDependencies` or native companion dependency declarations',
      'STOP for lifecycle hooks, helper downloads, helper build/install scripts, or install-time `go build`',
      'STOP for lockfiles, Go modules, checked-in native artifacts, tarballs, generated manifests, or generated package artifacts',
      'STOP for treating diagnostics/readiness surfaces as normal-user native availability proof',
      'STOP for default Go enablement',
      'STOP for current `go-cutover` behavior changes',
      'STOP for `go-packaged-preview` availability semantics changes',
      'STOP for TypeScript parser fallback deletion',
      'STOP for broadening Go helper authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
      'Slice 1 diagnostics audit/contract',
      'Slice 2 model/mapping',
      'Slice 3 failure-policy regression',
      'Slice 4 readiness formatter',
      'default/unset remains disabled/TypeScript',
      'disabled, typescript, go, and auto behavior remains unchanged',
      'current `go-cutover` remains explicit/local-only and helper-path based',
      'go-cutover` remains unchanged',
      'go-packaged-preview` remains explicit-only, non-default, and not normal-user availability proof',
      'go-packaged-preview` availability semantics remain unchanged',
      'diagnostics/readiness is not normal-user native availability proof',
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
      'no native artifact package files',
      'no `kernel/` package inclusion',
      'Remaining Blockers Before Real Native Package Metadata, Artifacts, Default Resolver, or Fallback Deletion',
      'explicit user approval is granted',
      'generated native helper artifacts exist',
      'generated manifests, checksums, provenance, license metadata, and executable-bit validation',
      'clean install smokes pass across supported platforms without a Go toolchain',
      'unsupported-platform remediation',
      'rollback story covers bad package metadata',
      'command/UI diagnostics design is separately approved',
      'package release ownership accepts package naming, versioning, provenance, attestation, checksum, license, supported-platform matrix, publication, deprecation, and rollback responsibilities',
      'parser failure policy is proven in any future normal-user default path',
      'normal-user native availability is proven independently',
      'TypeScript parser fallback deletion remains blocked',
      'Go helper authority remains parser-only/stdin-stdout `tmuxSnapshotParse`',
      'node tests/run.cjs go-kernel-v0423-compact-diagnostics-docs',
      'node tests/run.cjs go-kernel-v0423-compact-diagnostics-model',
      'node tests/run.cjs go-kernel-v0423-parser-failure-policy',
      'node tests/run.cjs go-kernel-v0423-compact-diagnostics-readiness',
      'node tests/run.cjs go-kernel-v0423-compact-diagnostics-checkpoint-docs',
      'node --check tests/suites/go-kernel-v0423-compact-diagnostics-checkpoint-docs.cjs',
      'node tests/run.cjs',
      'npm run typecheck',
      'npm run -s check:boundaries',
      'git diff --check',
      'npm run --silent bench:team-panel-tmux',
      'PI_AGENTTEAM_KERNEL=go-packaged-preview npm run --silent bench:team-panel-tmux',
      'package/native sanity scan',
      'requestedMode:"go-packaged-preview"',
      'fallbacks:0',
      'Proceed only with a GitHub-only v0.4.23 compact diagnostics/release decision gate checkpoint after leader approval',
      'Do not proceed with runtime UI diagnostics rendering',
      'commit, tag, or push',
    ]) {
      assertIncludes(checkpoint, expected, 'v0.4.23 checkpoint doc')
    }

    for (const [label, pattern] of [
      ['decision split', /GO only for GitHub-only v0\.4\.23 compact diagnostics\/release decision gate checkpoint after leader approval[\s\S]*STOP for runtime UI diagnostics rendering[\s\S]*STOP for command integration[\s\S]*STOP for npm\/default\/native cutover[\s\S]*STOP for real package inclusion[\s\S]*STOP for `package\.json` metadata or version changes[\s\S]*STOP for `optionalDependencies`[\s\S]*STOP for lifecycle hooks[\s\S]*STOP for lockfiles, Go modules[\s\S]*STOP for treating diagnostics\/readiness surfaces as normal-user native availability proof[\s\S]*STOP for default Go enablement[\s\S]*STOP for current `go-cutover` behavior changes[\s\S]*STOP for `go-packaged-preview` availability semantics changes[\s\S]*STOP for TypeScript parser fallback deletion/i],
      ['artifact links', /docs\/perf\/v0\.4\.23-compact-native-failure-diagnostics\.md[\s\S]*core\/kernelDiagnostics\.ts[\s\S]*go-kernel-v0423-compact-diagnostics-docs\.cjs[\s\S]*go-kernel-v0423-compact-diagnostics-model\.cjs[\s\S]*go-kernel-v0423-parser-failure-policy\.cjs[\s\S]*go-kernel-v0423-compact-diagnostics-readiness\.cjs/i],
      ['slice summary', /Slice 1 diagnostics audit\/contract[\s\S]*Slice 2 model\/mapping[\s\S]*Slice 3 failure-policy regression[\s\S]*Slice 4 readiness formatter/i],
      ['runtime state', /default\/unset remains disabled\/TypeScript[\s\S]*disabled, typescript, go, and auto behavior remains unchanged[\s\S]*current `go-cutover` remains explicit\/local-only[\s\S]*`go-cutover` remains unchanged[\s\S]*`go-packaged-preview` remains explicit-only, non-default[\s\S]*`go-packaged-preview` availability semantics remain unchanged[\s\S]*diagnostics\/readiness is not normal-user native availability proof[\s\S]*`compactReadModelFingerprint` remains TypeScript fallback[\s\S]*runtime `\/team` stays quiet/i],
      ['package state', /`package\.json` version remains `0\.6\.8`[\s\S]*`package\.json#files` excludes `kernel\/`[\s\S]*no `optionalDependencies`[\s\S]*no native companion package metadata[\s\S]*no lifecycle hooks[\s\S]*no helper build\/install\/download\/package\/version\/publish scripts[\s\S]*no `package-lock\.json`[\s\S]*no root or helper `go\.mod`[\s\S]*no checked-in `\.exe`, `\.dll`, `\.so`, `\.dylib`[\s\S]*no native artifact package files[\s\S]*no `kernel\/` package inclusion/i],
      ['blockers', /STOP future real native package metadata[\s\S]*explicit user approval[\s\S]*generated native helper artifacts exist[\s\S]*generated manifests, checksums, provenance[\s\S]*clean install smokes pass[\s\S]*unsupported-platform remediation[\s\S]*rollback story[\s\S]*command\/UI diagnostics design[\s\S]*package release ownership[\s\S]*parser failure policy is proven in any future normal-user default path[\s\S]*normal-user native availability is proven independently[\s\S]*TypeScript parser fallback deletion remains blocked[\s\S]*Go helper authority remains parser-only/i],
      ['validation matrix', /node tests\/run\.cjs go-kernel-v0423-compact-diagnostics-docs[\s\S]*node tests\/run\.cjs go-kernel-v0423-compact-diagnostics-model[\s\S]*node tests\/run\.cjs go-kernel-v0423-parser-failure-policy[\s\S]*node tests\/run\.cjs go-kernel-v0423-compact-diagnostics-readiness[\s\S]*node tests\/run\.cjs go-kernel-v0423-compact-diagnostics-checkpoint-docs[\s\S]*node tests\/run\.cjs[\s\S]*npm run typecheck[\s\S]*npm run -s check:boundaries[\s\S]*git diff --check[\s\S]*npm run --silent bench:team-panel-tmux[\s\S]*PI_AGENTTEAM_KERNEL=go-packaged-preview npm run --silent bench:team-panel-tmux[\s\S]*package\/native sanity scan/i],
    ]) {
      assertMatches(checkpoint, pattern, `v0.4.23 checkpoint doc: ${label}`)
    }

    for (const forbiddenPhrase of [
      'Go is default',
      'Go remains default',
      'Go runtime is required',
      'native/default cutover is approved',
      'native packaging is approved',
      'native implementation is approved',
      'normal-user native availability is proven by diagnostics',
      'diagnostics prove normal-user native availability',
      'readiness proves normal-user native availability',
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
      'runtime UI diagnostics are implemented',
      'command integration is implemented',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.23 checkpoint docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    const kernel = env.helpers.requireDist('core/kernel.js')
    const defaultMetadata = kernel.createAgentTeamKernelAdapter({ env: {} }).metadata()
    assert.equal(defaultMetadata.kernel.requestedMode, 'default', 'unset mode should normalize to default after v0.6.48')
    assert.equal(defaultMetadata.kernel.mode, 'go', 'unset mode should use embedded Go for tmuxSnapshotParse')
    assert.equal(defaultMetadata.kernel.enabled, true, 'default embedded helper should enable parser-only Go')
    assert.equal(defaultMetadata.kernel.cutoverStatus, 'active', 'default embedded helper should be active')
    const previewMetadata = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: {} }).metadata()
    assert.equal(previewMetadata.kernel.requestedMode, 'go-packaged-preview', 'preview mode should remain explicit')
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
