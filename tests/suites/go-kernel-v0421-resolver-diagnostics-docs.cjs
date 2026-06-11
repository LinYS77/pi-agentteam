const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.21-go-resolver-diagnostics-design.md'
const AVAILABILITY = 'docs/perf/v0.4.21-go-runtime-availability.md'
const ARTIFACT = 'docs/perf/v0.4.21-go-native-artifact-contract.md'
const POLICY = 'docs/perf/v0.4.21-go-package-policy-guardrails.md'
const V0420_CHECKPOINT = 'docs/perf/v0.4.20-go-cutover-checkpoint.md'
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
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optional native companion dependencies yet')
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
  name: 'Go kernel v0.4.21 resolver diagnostics design docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [DOC, AVAILABILITY, ARTIFACT, POLICY, V0420_CHECKPOINT, PLAN]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const combined = [doc, plan].join('\n\n')

    for (const rel of [AVAILABILITY, ARTIFACT, POLICY, V0420_CHECKPOINT]) {
      assertIncludes(doc, rel, `resolver diagnostics doc should link ${rel}`)
    }
    assertIncludes(plan, DOC, 'plan should reference resolver diagnostics design doc')

    for (const expected of [
      'v0.4.21 Go Resolver and Diagnostics UX Design',
      'Slice 4 docs/tests design only',
      'does not implement a resolver',
      'change runtime behavior',
      'add package metadata',
      'add native artifacts',
      'run `npm version`',
      'run `npm publish`',
      'commit, tag, push',
      'approve native packaging',
      'make Go default',
      'delete the TypeScript parser fallback',
      'docs/perf/v0.4.21-go-runtime-availability.md',
      'docs/perf/v0.4.21-go-native-artifact-contract.md',
      'docs/perf/v0.4.21-go-package-policy-guardrails.md',
      'docs/perf/v0.4.20-go-cutover-checkpoint.md',
      'docs/perf/v0.4.21-go-packaged-preview-resolver.md',
      'Slice 5 remains non-default, package/native-neutral, and scoped to `tmuxSnapshotParse` only',
      'PI_AGENTTEAM_KERNEL=go-cutover` is explicit/local-only',
      'helper-path-based',
      'default/disabled/typescript/go/auto behavior remains unchanged',
      'npm/default/native cutover remains STOP',
      'tmuxSnapshotParse` remains the only cutover-owned module',
      'compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
      'runtime `/team` stays quiet',
      'Future Resolver Precedence Design',
      'Explicit helper path stays Model B reviewer/local path',
      'PI_AGENTTEAM_KERNEL_HELPER` or `AGENTTEAM_GO_KERNEL_HELPER`',
      'Future packaged helper resolver is active only in separately approved preview/default-native modes',
      'packaged helper discovery must not run in default, disabled, typescript, go, auto, or current `go-cutover`',
      'Default/disabled/typescript/go/auto behavior remains unchanged',
      'Runtime authority paths must not read helper environment directly except the adapter/resolver seam',
      'go-packaged-preview',
      'placeholder and is not implemented by this Slice',
      'the later Slice 5 implementation uses `go-packaged-preview` as the explicit preview mode',
      'No silent TS parser fallback is allowed in a future packaged/default cutover path',
      'Diagnostics UX Policy',
      'Current v0.4.20/v0.4.21 runtime `/team` stays quiet',
      'Future default/native cutover may need a compact `/team` signal',
      'Safe future user-facing fields',
      'module `tmuxSnapshotParse`',
      'status/result marker `unknown`/`stale`',
      'stable failure kind',
      'short remediation text',
      'supported-platform hint',
      'reinstall/rollback pointer',
      'Forbidden future user-facing fields',
      'helper path',
      'helper stdout/stderr bodies',
      'repository path or cwd path',
      'mailbox/report text',
      'raw `cutoverReason`',
      'raw state files or raw team JSON',
      'sidecar/cache/index contents',
      'hidden runtime state',
      'worker prompts',
      'stack traces',
      'package internals',
      'Failure Vocabulary',
      'missing-helper',
      'disabled-helper',
      'helper-unsupported-protocol',
      'helper-unsupported-version',
      'helper-unsupported-capability',
      'helper-timeout',
      'helper-spawn-error',
      'helper-crash',
      'helper-nonzero-exit',
      'helper-empty-response',
      'helper-malformed-json',
      'helper-jsonrpc-error',
      'helper-incompatible-response',
      'helper-unsafe-response-shape',
      'previous-helper-failure',
      'unsupported-platform',
      'helper-integrity-failed',
      'helper-permission-denied',
      'Any new failure kind must be docs/tests-gated before runtime use',
      'parser-only/stdin-stdout',
      'tmux execution or tmux capture',
      'state or repository reads/writes',
      'network clients, servers, listeners',
      'worker lifecycle authority',
      'PlanRun, task/report governance',
      'mailbox/report full-text access',
      'package/release authority',
      'Package/native sanity remains unchanged in Slice 4',
      'explicit helper env precedence',
      'packaged helper discovery only in approved preview/default-native mode',
      'unsupported platform',
      'package/helper version skew',
      'helper integrity failure',
      'helper permission denied or non-executable artifact',
      'no-leak `/team` diagnostics',
      'no hidden TypeScript parser fallback',
      'STOP future resolver/default-native work',
    ]) {
      assertIncludes(doc, expected, 'resolver diagnostics doc')
    }

    for (const [label, pattern] of [
      ['scope', /Slice 4 docs\/tests design only[\s\S]*does not implement a resolver[\s\S]*change runtime behavior[\s\S]*add package metadata[\s\S]*add native artifacts[\s\S]*run `npm version`[\s\S]*run `npm publish`[\s\S]*commit, tag, push/i],
      ['links', /Slice 1 runtime availability decision:[\s\S]*docs\/perf\/v0\.4\.21-go-runtime-availability\.md[\s\S]*Slice 2 native artifact contract:[\s\S]*docs\/perf\/v0\.4\.21-go-native-artifact-contract\.md[\s\S]*Slice 3 package policy guardrails:[\s\S]*docs\/perf\/v0\.4\.21-go-package-policy-guardrails\.md[\s\S]*v0\.4\.20 final checkpoint:[\s\S]*docs\/perf\/v0\.4\.20-go-cutover-checkpoint\.md/i],
      ['current behavior', /PI_AGENTTEAM_KERNEL=go-cutover` is explicit\/local-only[\s\S]*helper-path-based[\s\S]*default\/disabled\/typescript\/go\/auto behavior remains unchanged[\s\S]*npm\/default\/native cutover remains STOP[\s\S]*`tmuxSnapshotParse` remains the only cutover-owned module[\s\S]*`compactReadModelFingerprint` remains TypeScript fallback/i],
      ['resolver precedence', /Explicit helper path stays Model B reviewer\/local path[\s\S]*PI_AGENTTEAM_KERNEL_HELPER` or `AGENTTEAM_GO_KERNEL_HELPER`[\s\S]*Future packaged helper resolver is active only in separately approved preview\/default-native modes[\s\S]*packaged helper discovery must not run in default, disabled, typescript, go, auto, or current `go-cutover`[\s\S]*Runtime authority paths must not read helper environment directly except the adapter\/resolver seam/i],
      ['future mode', /go-packaged-preview[\s\S]*placeholder and is not implemented by this Slice[\s\S]*later Slice 5 implementation uses `go-packaged-preview`[\s\S]*explicit opt-in only[\s\S]*does not make Go default[\s\S]*does not delete TypeScript parser fallback[\s\S]*No silent TS parser fallback is allowed/i],
      ['diagnostics safe and forbidden', /Safe future user-facing fields[\s\S]*module `tmuxSnapshotParse`[\s\S]*status\/result marker `unknown`\/`stale`[\s\S]*stable failure kind[\s\S]*short remediation text[\s\S]*supported-platform hint[\s\S]*reinstall\/rollback pointer[\s\S]*Forbidden future user-facing fields[\s\S]*helper path[\s\S]*helper stdout\/stderr bodies[\s\S]*repository path or cwd path[\s\S]*mailbox\/report text[\s\S]*raw `cutoverReason`[\s\S]*raw state files or raw team JSON[\s\S]*sidecar\/cache\/index contents[\s\S]*worker prompts[\s\S]*stack traces/i],
      ['failure vocabulary', /Existing cutover failure kinds remain compact[\s\S]*`missing-helper`[\s\S]*`previous-helper-failure`[\s\S]*Native-specific future candidate failure kinds[\s\S]*`unsupported-platform`[\s\S]*`helper-integrity-failed`[\s\S]*`helper-permission-denied`[\s\S]*Any new failure kind must be docs\/tests-gated before runtime use/i],
      ['boundaries', /The Go helper remains parser-only\/stdin-stdout[\s\S]*tmux execution or tmux capture[\s\S]*state or repository reads\/writes[\s\S]*network clients, servers, listeners[\s\S]*worker lifecycle authority[\s\S]*PlanRun, task\/report governance[\s\S]*mailbox\/report full-text access[\s\S]*package\/release authority/i],
      ['validation design', /Future resolver implementation must include tests for[\s\S]*explicit helper env precedence[\s\S]*packaged helper discovery only in approved preview\/default-native mode[\s\S]*unsupported platform[\s\S]*package\/helper version skew[\s\S]*helper integrity failure[\s\S]*helper permission denied[\s\S]*no-leak `\/team` diagnostics[\s\S]*no hidden TypeScript parser fallback/i],
      ['stop gates', /STOP future resolver\/default-native work[\s\S]*resolver is implemented before Slice 1\/2\/3 signoff[\s\S]*package metadata changes appear without an owner package slice[\s\S]*native artifacts, lockfiles, go modules, package scripts, lifecycle hooks[\s\S]*go-packaged-preview[\s\S]*later explicit Slice 5 implementation[\s\S]*default\/disabled\/typescript\/go\/auto behavior changes[\s\S]*packaged helper resolver activates outside an approved preview\/default-native mode[\s\S]*future packaged\/default cutover can silently fall back to TypeScript parser[\s\S]*diagnostics leak forbidden fields/i],
    ]) {
      assertMatches(doc, pattern, `resolver diagnostics doc: ${label}`)
    }

    for (const forbiddenPhrase of [
      'Go is default',
      'Go remains default',
      'Go runtime is required',
      'native packaging is approved',
      'native implementation is approved',
      'resolver is implemented by this Slice',
      'checked-in binary is allowed',
      'postinstall download is allowed',
      'preinstall download is allowed',
      'prepare download is allowed',
      'install-time Go build is allowed',
      'run `npm version` to release',
      'run `npm publish` to release',
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
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.21 resolver diagnostics docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assertPackageNativeSanity(root)
  },
}
