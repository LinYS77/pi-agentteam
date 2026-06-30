const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES,
} = require('../fixtures/kernel/historicalCheckpointDeletionMap.cjs')

const READY_DELETED_SUITES = new Set(HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES)

const CHECKPOINT = 'docs/perf/v0.4.25-native-helper-availability-proof-checkpoint.md'
const OWNER_DOC = 'docs/perf/v0.4.25-native-helper-availability-proof.md'
const PACKAGE_VERSION = '0.6.8'
const LINKS = [
  'docs/perf/v0.4.24-explicit-readiness-command-integration-checkpoint.md',
  OWNER_DOC,
  'tests/suites/go-kernel-v0425-native-availability-contract-docs.cjs',
  'tests/suites/go-kernel-v0425-artifact-manifest-prototype.cjs',
  'tests/suites/go-kernel-v0425-clean-install-smoke.cjs',
  'tests/suites/go-kernel-v0425-unsupported-rollback-policy.cjs',
  'tests/suites/go-kernel-v0425-resolver-default-cutover-gate.cjs',
  'tests/suites/go-kernel-v0425-native-availability-checkpoint-docs.cjs',
]
const SLICE_SUMMARIES = [
  'Slice 1 owner contract / TS-pi boundary / T013 finding',
  'Slice 2 temp artifact/manifest validator prototype',
  'Slice 3 temp clean-install smoke simulation',
  'Slice 4 unsupported-platform rollback/version-skew policy',
  'Slice 5 resolver/default module cutover gate',
]
const STOP_ITEMS = [
  'npm version/publish',
  'package version change',
  'package.json metadata changes',
  'optionalDependencies',
  'lifecycle hooks/downloads',
  'helper build/install/package scripts',
  'lockfiles',
  'go.mod/go.sum',
  'checked-in native binaries',
  'tarballs',
  'generated manifests/artifacts/package artifacts',
  'real package inclusion/native artifact approval',
  'default Go',
  'current go-cutover behavior changes',
  'go-packaged-preview availability semantics changes',
  'TypeScript fallback deletion',
  'hidden TS fallback rollback after cutover',
  'compactReadModelFingerprint cutover',
  'broad Go authority',
  'native Go pi extension assumption',
  '/team readiness expansion',
  'commit/tag/push as part of implementation slice',
]
const BLOCKERS = [
  'real generated artifacts/checksums/provenance/license/executable validation outside temp fixtures',
  'clean install smokes across supported platforms/package managers',
  'unsupported-platform remediation acceptance',
  'rollback/default-disable/deprecation execution plan',
  'package release ownership and companion package metadata approval',
  'normal-user diagnostics UX if needed',
  'parser failure policy in real default path',
  'explicit user approval',
]
const FORBIDDEN_PHRASES = [
  'native/default cutover is approved',
  'fallback deletion is approved',
  'normal-user availability is proven',
  'normal-user native availability is proven',
  'native packaging is approved',
  'npm publish is approved',
  'npm version is approved',
  'Go is default',
  'Go remains default',
  'Go is a pi extension',
  'native Go pi extension is assumed',
  'broader Go authority is approved',
  'compactReadModelFingerprint is cutover',
  'hidden runtime TypeScript fallback is rollback',
]

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

function assertKernelSourceInvariants(root) {
  const source = read(root, 'core/kernel.ts')
  assertIncludes(source, "if (!raw || raw === 'default') return 'default'", 'kernel source')
  assertIncludes(source, "if (raw === 'none' || raw === 'off' || raw === 'disabled') return 'disabled'", 'kernel source')
  assertIncludes(source, 'const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)', 'kernel source')
  assertIncludes(source, "const activeMode: AgentTeamKernelActiveMode = usesGo() ? 'go' : 'typescript'", 'kernel source')
  assertIncludes(source, "enabled: activeMode === 'go'", 'kernel source')
  assertIncludes(source, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel source')
  assertIncludes(source, "const packagedResolverFailure = packagedResolverRequested && !explicitHelperPath", 'kernel source')
  assertIncludes(source, "const packagedHelperPath = packagedPreviewRequested && !explicitHelperPath && !packagedResolverFailure", 'kernel source')
  assertIncludes(source, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel source')
  assertIncludes(source, 'const startupFallback = cutoverRequested ? undefined', 'kernel source')
  assertIncludes(source, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse'", 'kernel source')
  assertIncludes(source, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'kernel source')
  assertIncludes(source, 'if (cutoverRequested) return fallback(compactInput)', 'kernel source')
}

function assertRepoArtifactSanity(root) {
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|clean-install-manifest|rollback-manifest|cutover-gate-manifest|availability-checkpoint-manifest)\.(?:json|jsonc|yaml|yml)$/i
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

function assertReadinessNotExpanded(root) {
  const readiness = fs.existsSync(path.join(root, 'commands/readiness.ts')) ? read(root, 'commands/readiness.ts') : ''
  const team = read(root, 'commands/team.ts')
  assertIncludes(readiness, "return args.trim().toLowerCase() === 'readiness'", 'readiness command')
  assert.equal(/readiness\s+--|readiness\s+(?:native|availability|resolver|default|cutover|package|artifact|checkpoint)/i.test(readiness), false, '/team readiness should not gain options/subcommands')
  assert.equal(/registerTool|model-callable|native availability tool/i.test(readiness), false, 'readiness must not become model-callable tool')
  assert.equal(/openTeamPanel\([^)]*readiness|render.*readiness/i.test(team), false, 'readiness must not be ambient panel rendering')
}

module.exports = {
  name: 'Go kernel v0.4.25 native availability checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [CHECKPOINT, OWNER_DOC, ...LINKS]) {
      assertReadyDeletedOrExists(root, rel)
    }
    const doc = read(root, CHECKPOINT)
    const ownerDoc = read(root, OWNER_DOC)
    const lower = doc.toLowerCase()

    for (const link of LINKS) assertIncludes(doc, link, 'checkpoint doc')
    assertIncludes(ownerDoc, CHECKPOINT, 'owner doc should link final checkpoint')

    for (const expected of SLICE_SUMMARIES) assertIncludes(doc, expected, 'checkpoint slice summary')
    for (const expected of STOP_ITEMS) assertIncludes(doc, expected, 'checkpoint STOP decision')
    for (const expected of BLOCKERS) assertIncludes(doc, expected, 'checkpoint blockers')

    for (const expected of [
      'GO only for GitHub-only v0.4.25 native helper availability proof checkpoint after leader/user approval',
      'GO for evidence only',
      'generated artifact shape validation under temp roots',
      'manifest/checksum/provenance/license/executable validation prototype',
      'clean-install simulation',
      'unsupported-platform/rollback/version-skew policy',
      'future resolver/default/fallback deletion gate definition',
      'v0.4.25 still does not prove normal-user native availability',
      'does not pass the packaged/default/fallback deletion gate',
      'TS/pi control plane remains mandatory',
      'Go is helper/kernel behind TS adapter/ports via subprocess/RPC/stdin-stdout',
      'default/unset remains disabled/TypeScript',
      '`go-packaged-preview` remains explicit-only/non-default and its availability semantics remain unchanged',
      'current `go-cutover` remains helper-path based and unchanged',
      'packaged helper discovery does not run in default/disabled/typescript/go/auto/current `go-cutover`',
      '`compactReadModelFingerprint` remains TypeScript fallback/non-cutover',
      '/team readiness` remains transitional reviewer tooling and is not expanded',
      'package.json` version remains `0.6.8`',
      'node tests/run.cjs',
      'npm run typecheck',
      'npm run -s check:boundaries',
      'git diff --check',
      'npm run --silent bench:team-panel-tmux',
      'PI_AGENTTEAM_KERNEL=go-packaged-preview npm run --silent bench:team-panel-tmux',
      'package/native sanity scan',
    ]) {
      assert.ok(lower.includes(expected.toLowerCase()), `checkpoint doc should include ${expected}`)
    }

    for (const forbidden of FORBIDDEN_PHRASES) {
      assert.equal(doc.includes(forbidden), false, `checkpoint must not imply forbidden approval: ${forbidden}`)
    }

    assertKernelSourceInvariants(root)
    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
    assertReadinessNotExpanded(root)
  },
}
