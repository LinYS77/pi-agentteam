const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.23-compact-native-failure-diagnostics.md'
const V0422_CHECKPOINT = 'docs/perf/v0.4.22-native-helper-package-metadata-checkpoint.md'
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
  name: 'Go kernel v0.4.23 compact diagnostics docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [DOC, V0422_CHECKPOINT, PLAN]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const combined = [doc, plan].join('\n\n')

    assertIncludes(doc, V0422_CHECKPOINT, 'diagnostics doc should link v0.4.22 checkpoint')
    assertIncludes(plan, DOC, 'roadmap should reference diagnostics doc')

    for (const expected of [
      'v0.4.23 Compact Native Failure Diagnostics',
      'Slice 1 diagnostics surface audit and contract only',
      'does not approve native artifacts',
      'real package metadata',
      'npm publication',
      'default Go enablement',
      'current `go-cutover` behavior changes',
      'go-packaged-preview` availability semantics changes',
      'TypeScript parser fallback deletion',
      'GO only for a docs/tests-first compact diagnostics contract and readiness gate foundation after leader review',
      'STOP for native artifact approval',
      'STOP for real package metadata or `package.json` changes',
      'STOP for npm versioning or npm publication',
      'STOP for `optionalDependencies`, lifecycle hooks, helper downloads, helper build/install scripts, lockfiles, Go modules, generated manifests, tarballs, or checked-in native artifacts',
      'STOP for default Go enablement',
      'STOP for current `go-cutover` behavior changes',
      'STOP for `go-packaged-preview` normal-user availability semantics changes',
      'STOP for TypeScript parser fallback deletion',
      'STOP for broadening Go helper authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
      'docs/perf/v0.4.22-native-helper-package-metadata-checkpoint.md',
      'docs/perf/v0.4.21-go-resolver-diagnostics-design.md',
      'docs/perf/v0.4.21-go-runtime-availability-checkpoint.md',
      'docs/perf/v0.4.20-go-cutover-checkpoint.md',
      'tests/suites/go-kernel-v0423-compact-diagnostics-docs.cjs',
      'default/unset remains disabled/TypeScript',
      'disabled, typescript, go, and auto behavior remains unchanged',
      'current `go-cutover` remains explicit/local-only and helper-path based',
      'go-cutover` fail closed for `tmuxSnapshotParse`',
      'go-packaged-preview` remains explicit-only, non-default, and not normal-user availability proof',
      'go-packaged-preview` fail closed for `tmuxSnapshotParse`',
      'packaged helper discovery does not run in default, disabled, typescript, go, auto, or current `go-cutover`',
      'tmuxSnapshotParse` is the only cutover-owned module',
      'compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
      'runtime `/team` currently quiet',
      'module: the affected module, currently only `tmuxSnapshotParse`',
      'capability: the requested parser capability',
      'status/resultMarker: compact status/result marker',
      'failure kind: stable failure kind',
      'short remediation: one short user-safe remediation sentence',
      'supported-platform/freshness hint',
      'release decision pointer',
      'helper path',
      'helper stdout/stderr',
      'repository path, repo path, or cwd path',
      'raw `cutoverReason`',
      'raw state JSON or raw team JSON',
      'sidecar/cache/index contents',
      'raw manifests/checksums/provenance payloads',
      'worker prompts',
      'stack traces',
      'mailbox/report text',
      'package internals',
      'no pane loss',
      'no false successful empty snapshot',
      'no force reconcile',
      'no kill panes',
      'no worker lifecycle mutation',
      'no hidden TypeScript parser fallback in cutover/preview failure paths',
      'STOP future real native package metadata',
      'compact diagnostics UX is implemented and no-leak guarded',
      'generated native helper artifacts exist',
      'generated manifests, checksums, provenance, license metadata, and executable-bit validation',
      'clean install smokes pass across supported platforms without a Go toolchain',
      'unsupported-platform behavior and remediation text',
      'rollback story covers bad package metadata',
      'package release owner accepts package naming, versioning, provenance, attestation, checksum, license, supported-platform matrix, and rollback responsibilities',
      'TypeScript parser fallback deletion remains blocked',
      'Go helper authority remains parser-only/stdin-stdout `tmuxSnapshotParse`',
      'package.json` version remains `0.6.8`',
      'no `optionalDependencies`',
      'no lifecycle hooks',
      'no helper build/install/download/package/version/publish scripts',
      'no `package-lock.json` or `npm-shrinkwrap.json`',
      'no root or helper `go.mod`',
      'no root or helper `go.sum`',
      'no checked-in `.exe`, `.dll`, `.so`, `.dylib`',
      'no `kernel/` package inclusion or native artifact package files',
      'node tests/run.cjs go-kernel-v0423-compact-diagnostics-docs',
      'node --check tests/suites/go-kernel-v0423-compact-diagnostics-docs.cjs',
      'git diff --check',
    ]) {
      assertIncludes(doc, expected, 'v0.4.23 diagnostics doc')
    }

    for (const [label, pattern] of [
      ['decision split', /GO only for a docs\/tests-first compact diagnostics contract[\s\S]*STOP for native artifact approval[\s\S]*STOP for real package metadata or `package\.json` changes[\s\S]*STOP for npm versioning or npm publication[\s\S]*STOP for `optionalDependencies`[\s\S]*STOP for default Go enablement[\s\S]*STOP for current `go-cutover` behavior changes[\s\S]*STOP for `go-packaged-preview` normal-user availability semantics changes[\s\S]*STOP for TypeScript parser fallback deletion[\s\S]*STOP for broadening Go helper authority/i],
      ['current state', /default\/unset remains disabled\/TypeScript[\s\S]*current `go-cutover` remains explicit\/local-only[\s\S]*`go-cutover` fail closed for `tmuxSnapshotParse`[\s\S]*`go-packaged-preview` remains explicit-only, non-default[\s\S]*`go-packaged-preview` fail closed for `tmuxSnapshotParse`[\s\S]*packaged helper discovery does not run[\s\S]*`compactReadModelFingerprint` remains TypeScript fallback[\s\S]*runtime `\/team` currently quiet/i],
      ['safe fields', /Safe Compact Diagnostic Contract[\s\S]*module: the affected module[\s\S]*capability: the requested parser capability[\s\S]*status\/resultMarker: compact status\/result marker[\s\S]*failure kind: stable failure kind[\s\S]*short remediation[\s\S]*supported-platform\/freshness hint[\s\S]*release decision pointer/i],
      ['forbidden fields', /Forbidden Fields and Leaks[\s\S]*helper path[\s\S]*helper stdout\/stderr[\s\S]*repository path, repo path, or cwd path[\s\S]*raw `cutoverReason`[\s\S]*raw state JSON or raw team JSON[\s\S]*sidecar\/cache\/index contents[\s\S]*raw manifests\/checksums\/provenance payloads[\s\S]*worker prompts[\s\S]*stack traces[\s\S]*mailbox\/report text[\s\S]*package internals/i],
      ['failure policy', /Failure Policy Expectations[\s\S]*no pane loss[\s\S]*no false successful empty snapshot[\s\S]*no stale success[\s\S]*no force reconcile[\s\S]*no kill panes[\s\S]*no worker lifecycle mutation[\s\S]*no task\/report governance mutation[\s\S]*no hidden TypeScript parser fallback in cutover\/preview failure paths/i],
      ['release gate', /Release Decision Gate[\s\S]*STOP future real native package metadata[\s\S]*compact diagnostics UX is implemented and no-leak guarded[\s\S]*generated native helper artifacts exist[\s\S]*clean install smokes pass[\s\S]*unsupported-platform behavior[\s\S]*rollback story[\s\S]*package release owner accepts[\s\S]*TypeScript parser fallback deletion remains blocked[\s\S]*Go helper authority remains parser-only/i],
      ['package freeze', /Package and Native Sanity Freeze[\s\S]*`package\.json` version remains `0\.6\.8`[\s\S]*no `optionalDependencies`[\s\S]*no lifecycle hooks[\s\S]*no helper build\/install\/download\/package\/version\/publish scripts[\s\S]*no `package-lock\.json`[\s\S]*no root or helper `go\.mod`[\s\S]*no root or helper `go\.sum`[\s\S]*no checked-in `\.exe`, `\.dll`, `\.so`, `\.dylib`[\s\S]*no `kernel\/` package inclusion/i],
    ]) {
      assertMatches(doc, pattern, `v0.4.23 diagnostics doc: ${label}`)
    }

    for (const forbiddenPhrase of [
      'Go is default',
      'Go remains default',
      'Go runtime is required',
      'native/default cutover is approved',
      'native packaging is approved',
      'native implementation is approved',
      'native artifact approval is granted',
      'real package metadata is approved',
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
      'go-packaged-preview proves normal-user availability',
      'compactReadModelFingerprint becomes cutover-owned',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'Go owns state writes',
      'Go owns task/report governance',
      'Go reads mailbox full text',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.23 diagnostics docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assertPackageNativeSanity(root)
  },
}
