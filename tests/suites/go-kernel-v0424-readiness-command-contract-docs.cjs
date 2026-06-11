const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.24-explicit-readiness-command-integration.md'
const V0423_CHECKPOINT = 'docs/perf/v0.4.23-compact-native-failure-diagnostics-checkpoint.md'
const DIAGNOSTICS_HELPER = 'core/kernelDiagnostics.ts'
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
  name: 'Go kernel v0.4.24 readiness command contract docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [DOC, V0423_CHECKPOINT, DIAGNOSTICS_HELPER, PLAN]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const combined = [doc, plan].join('\n\n')

    assertIncludes(doc, V0423_CHECKPOINT, 'contract doc should link v0.4.23 checkpoint')
    assertIncludes(doc, DIAGNOSTICS_HELPER, 'contract doc should link diagnostics helper')
    assertIncludes(plan, DOC, 'roadmap should reference v0.4.24 contract doc')

    for (const expected of [
      'v0.4.24 Explicit Readiness Command Integration Contract',
      'Slice 1 docs/tests-only command/readiness contract',
      'explicit opt-in reviewer command/readiness surface',
      'does not implement command integration',
      'runtime UI/panel diagnostics rendering',
      '`/team` ambient UI',
      'native artifacts/package/default approval',
      'GO only for docs/tests-only explicit readiness command/readiness contract planning after leader review',
      'STOP for command integration implementation in this slice',
      'STOP for `/team` ambient UI or runtime panel diagnostics rendering',
      'STOP for native artifact approval',
      'STOP for real package metadata or `package.json` changes',
      'STOP for npm versioning or npm publication',
      'STOP for `optionalDependencies`, lifecycle hooks, helper downloads, helper build/install scripts, lockfiles, Go modules, generated manifests, tarballs, or checked-in native artifacts',
      'STOP for default Go enablement',
      'STOP for current `go-cutover` behavior changes',
      'STOP for `go-packaged-preview` availability semantics changes',
      'STOP for TypeScript parser fallback deletion',
      'STOP for broadening Go helper authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
      'docs/perf/v0.4.23-compact-native-failure-diagnostics-checkpoint.md',
      'core/kernelDiagnostics.ts',
      'tests/suites/go-kernel-v0424-readiness-command-contract-docs.cjs',
      'explicit invocation only; no ambient `/team` panel rendering',
      'reviewer-facing readiness summary only; not normal-user native availability proof',
      'read-only and side-effect-free',
      'summarizeTmuxSnapshotParseFailureDiagnostic()',
      'formatTmuxSnapshotParseFailureReadiness()',
      'module.',
      'capability.',
      'status.',
      'resultMarker.',
      'failureKind.',
      'remediation.',
      'hint derived only from safe `platformHint` or `freshnessHint`',
      'releaseDecision pointer.',
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
      'env bodies or environment variable values',
      'full-text content',
      'no state writes',
      'no mailbox/report full-text reads',
      'no task/report governance mutation',
      'no tmux execution/capture beyond existing product paths',
      'no worker lifecycle mutation',
      'no pane reconcile',
      'no kill panes',
      'no force reconcile',
      'default/unset remains disabled/TypeScript',
      'go-packaged-preview` remains explicit-only, non-default, and not normal-user availability proof',
      'current `go-cutover` remains unchanged, explicit/local-only, and helper-path based',
      'compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
      'runtime `/team` remains quiet',
      'no `package.json` changes; package version remains `0.6.8`',
      'no `optionalDependencies`',
      'no lifecycle hooks',
      'no helper downloads, helper build/install scripts',
      'no lockfiles',
      'no root or helper `go.mod`',
      'no root or helper `go.sum`',
      'no native artifacts',
      'no `npm version`',
      'no `npm publish`',
      'no default Go enablement',
      'no TypeScript parser fallback deletion',
      'node tests/run.cjs go-kernel-v0424-readiness-command-contract-docs',
      'node --check tests/suites/go-kernel-v0424-readiness-command-contract-docs.cjs',
      'Proceed only with the GitHub-only v0.4.24 explicit readiness command integration checkpoint after leader/user approval',
      'The checkpoint records `/team readiness` as transitional reviewer tooling only',
      'It does not approve expanding `/team readiness`',
      'commit, tag, or push without explicit approval',
    ]) {
      assertIncludes(doc, expected, 'v0.4.24 readiness command contract doc')
    }

    for (const [label, pattern] of [
      ['decision split', /GO only for docs\/tests-only explicit readiness command\/readiness contract planning after leader review[\s\S]*STOP for command integration implementation in this slice[\s\S]*STOP for `\/team` ambient UI[\s\S]*STOP for native artifact approval[\s\S]*STOP for real package metadata or `package\.json` changes[\s\S]*STOP for npm versioning or npm publication[\s\S]*STOP for `optionalDependencies`[\s\S]*STOP for default Go enablement[\s\S]*STOP for current `go-cutover` behavior changes[\s\S]*STOP for `go-packaged-preview` availability semantics changes[\s\S]*STOP for TypeScript parser fallback deletion/i],
      ['allowed output', /Allowed Command\/Readiness Output[\s\S]*module[\s\S]*capability[\s\S]*status[\s\S]*resultMarker[\s\S]*failureKind[\s\S]*remediation[\s\S]*hint derived only from safe `platformHint` or `freshnessHint`[\s\S]*releaseDecision pointer/i],
      ['forbidden leaks', /Forbidden Fields and Leaks[\s\S]*helper path[\s\S]*helper stdout\/stderr[\s\S]*repository path, repo path, or cwd path[\s\S]*raw `cutoverReason`[\s\S]*raw state JSON or raw team JSON[\s\S]*sidecar\/cache\/index contents[\s\S]*raw manifests\/checksums\/provenance payloads[\s\S]*worker prompts[\s\S]*stack traces[\s\S]*mailbox\/report text[\s\S]*package internals[\s\S]*env bodies[\s\S]*full-text content/i],
      ['read only', /Read-Only Behavior Contract[\s\S]*no state writes[\s\S]*no mailbox\/report full-text reads[\s\S]*no task\/report governance mutation[\s\S]*no tmux execution\/capture beyond existing product paths[\s\S]*no worker lifecycle mutation[\s\S]*no pane reconcile[\s\S]*no kill panes[\s\S]*no force reconcile/i],
      ['runtime invariants', /default\/unset remains disabled\/TypeScript[\s\S]*disabled, typescript, go, and auto behavior remains unchanged[\s\S]*`go-packaged-preview` remains explicit-only, non-default[\s\S]*current `go-cutover` remains unchanged[\s\S]*`compactReadModelFingerprint` remains TypeScript fallback[\s\S]*runtime `\/team` remains quiet/i],
      ['package gates', /Package and Native STOP Gates[\s\S]*no `package\.json` changes[\s\S]*package version remains `0\.6\.8`[\s\S]*no `optionalDependencies`[\s\S]*no lifecycle hooks[\s\S]*no helper downloads[\s\S]*no lockfiles[\s\S]*no root or helper `go\.mod`[\s\S]*no root or helper `go\.sum`[\s\S]*no native artifacts[\s\S]*no `npm version`[\s\S]*no `npm publish`[\s\S]*no default Go enablement[\s\S]*no TypeScript parser fallback deletion/i],
    ]) {
      assertMatches(doc, pattern, `v0.4.24 contract doc: ${label}`)
    }

    for (const forbiddenPhrase of [
      'command integration is implemented',
      'readiness command is implemented',
      '/team UI is implemented',
      '/team diagnostics are implemented',
      'runtime panel diagnostics are implemented',
      'Go is default',
      'Go remains default',
      'Go runtime is required',
      'native/default cutover is approved',
      'native packaging is approved',
      'native implementation is approved',
      'normal-user native availability is proven by readiness',
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
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.24 docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    const kernel = env.helpers.requireDist('core/kernel.js')
    const defaultMetadata = kernel.createAgentTeamKernelAdapter({ env: {} }).metadata()
    assert.equal(defaultMetadata.kernel.requestedMode, 'disabled', 'unset mode should remain disabled')
    assert.equal(defaultMetadata.kernel.mode, 'typescript', 'unset mode should remain TypeScript')
    assert.equal(defaultMetadata.kernel.enabled, false, 'contract doc must not make Go default')
    const previewMetadata = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: {} }).metadata()
    assert.equal(previewMetadata.kernel.requestedMode, 'go-packaged-preview', 'preview mode should remain explicit')
    assert.equal(previewMetadata.kernel.requestedKnownKernel, true, 'preview mode should remain known')
    assert.equal(previewMetadata.kernel.enabled, false, 'preview without packaged helper should not enable Go')
    assert.equal(previewMetadata.kernel.fallbacks, 0, 'preview mode should not use migration fallback count')

    assertPackageNativeSanity(root)
  },
}
