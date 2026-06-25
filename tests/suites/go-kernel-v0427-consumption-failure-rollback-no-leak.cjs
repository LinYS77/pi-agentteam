const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md'
const PLAN = 'docs/agentteam方案书.md'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const FAILURE_KINDS = [
  'artifact_missing',
  'metadata_invalid',
  'integrity_mismatch',
  'artifact_not_executable',
  'unsupported_platform',
  'version_skew',
  'protocol_skew',
  'capability_skew',
  'license_missing',
  'provenance_missing',
  'install_layout_invalid',
  'package_unavailable',
  'smoke_corrupt_output',
]
const FAILURE_KIND_SET = new Set(FAILURE_KINDS)
const REQUIRED_DOC_ITEMS = [
  'Slice 6 — Failure Rollback No-Leak Hardening',
  'Slice 6 is docs/tests-only failure, rollback, unsupported-platform, and no-leak hardening',
  'Focused suite: `tests/suites/go-kernel-v0427-consumption-failure-rollback-no-leak.cjs`',
  'Compact failure vocabulary for install consumption',
  'Compact diagnostic shape',
  'No-leak expectations',
  'Unsupported-platform policy',
  'Rollback policy',
  'Slice 6 Validation Plan',
  'Proceed only with v0.4.27 Slice 6 docs/tests-only failure rollback no-leak hardening review after leader/user approval',
]
const REQUIRED_POLICY_ITEMS = [
  'unsupported os/arch/libc rows fail closed',
  'unsupported rows continue blocking normal-user availability',
  'unsupported rows continue blocking default resolver activation, native/default cutover, package/native approval, and fallback deletion',
  'support policy is narrowed and explicitly approved',
  'rollback remains corrected release/tag/package/deprecation/default-disable policy',
  'rollback is not hidden runtime TypeScript fallback after cutover',
  'explicit future consumption smoke/cutover failure must not silently use hidden TS parser fallback',
  'TypeScript fallback remains present for existing non-cutover paths; it is not deleted by this slice',
  '`compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
  '`tmuxSnapshotParse` remains the only cutover-owned candidate under discussion',
]
const NO_LEAK_ITEMS = [
  'helper absolute path',
  'temp root or installed root',
  'repo/cwd',
  'stdout/stderr',
  'raw manifest/checksum/provenance/license body',
  'raw package internals',
  'stack traces',
  'mailbox/report text',
]
const STOP_ITEMS = [
  'STOP for normal-user UI',
  'STOP for model-callable tools',
  'STOP for ambient `/team` diagnostics',
  'STOP for `/team readiness` expansion',
  'STOP for production diagnostics changes',
  'STOP for production resolver implementation',
  'STOP for runtime discovery implementation',
  'STOP for default discovery',
  'STOP for packaged discovery activation',
  'STOP for default Go',
  'STOP for TypeScript fallback deletion',
  'STOP for hidden TS fallback rollback after cutover',
  'STOP for hidden TS parser fallback for explicit future consumption smoke/cutover failure',
  'STOP for `go-cutover` behavior changes',
  'STOP for `go-packaged-preview` semantic changes',
  'STOP for package metadata changes',
  'STOP for package files changes',
  'STOP for optionalDependencies',
  'STOP for package scripts',
  'STOP for lifecycle hooks',
  'STOP for helper build commands',
  'STOP for running `go build`',
  'STOP for CI workflow',
  'STOP for artifact upload',
  'STOP for release assets',
  'STOP for npm pack/version/publish',
  'STOP for native binaries',
  'STOP for tarballs',
  'STOP for generated artifacts checked into the repo',
  'STOP for generated manifests checked into the repo',
  'STOP for generated package artifacts',
  'STOP for go.mod/go.sum',
  'STOP for lockfiles',
  'STOP for broadening Go authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
  'Slice 7 — Package Native Guardrails and Readiness Containment',
  'Focused suite: `tests/suites/go-kernel-v0427-package-native-guardrails.cjs`',
  'Slice 8 — Final Checkpoint',
  'Final checkpoint doc: `docs/perf/v0.4.27-generated-artifact-clean-install-consumption-checkpoint.md`',
  'Focused suite: `tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs`',
]
const FORBIDDEN_DOC = [
  'normal-user UI is added',
  'model-callable tool is added',
  'ambient /team diagnostics are added',
  '/team readiness is expanded',
  'production diagnostics are changed',
  'production resolver behavior is changed',
  'default discovery is implemented',
  'packaged discovery is activated',
  'normal-user availability is proven',
  'normal-user native availability is proven',
  'native/default cutover is approved',
  'fallback deletion is approved',
  'hidden runtime TypeScript fallback is rollback',
  'Go is default',
  'package metadata is approved',
  'broader Go authority is approved',
]
const REMEDIATIONS = {
  artifact_missing: 'regenerate or republish the missing consumed artifact',
  metadata_invalid: 'regenerate package-relative manifest/checksum/provenance/license metadata',
  integrity_mismatch: 'reject artifact and regenerate checksum/provenance/license integrity evidence',
  artifact_not_executable: 'restore executable policy in a corrected artifact release',
  unsupported_platform: 'keep unsupported row unavailable unless support policy is narrowed and approved',
  version_skew: 'align helperVersion/packageVersion with the installed layout contract',
  protocol_skew: 'align protocolVersion with the TS adapter protocol',
  capability_skew: 'reject helper unless tmuxSnapshotParse capability/module match',
  license_missing: 'regenerate license metadata/copy/checksum',
  provenance_missing: 'regenerate provenance placeholder/evidence metadata',
  install_layout_invalid: 'regenerate package-relative installed layout and reject unsafe paths',
  package_unavailable: 'publish corrected package/tag/deprecation/default-disable policy before retry',
  smoke_corrupt_output: 'reject corrupt explicit smoke output and publish corrected artifact evidence',
}
const BLOCKERS = {
  artifact_missing: 'block-normal-user-default-native-fallback-deletion',
  metadata_invalid: 'block-package-default-native-fallback-approval',
  integrity_mismatch: 'block-package-default-native-fallback-approval',
  artifact_not_executable: 'block-default-native-approval',
  unsupported_platform: 'block-normal-user-default-native-fallback-deletion',
  version_skew: 'block-hidden-ts-fallback-rollback-and-fallback-deletion',
  protocol_skew: 'block-hidden-ts-fallback-rollback-and-fallback-deletion',
  capability_skew: 'block-hidden-ts-fallback-rollback-and-broad-go-authority',
  license_missing: 'block-package-native-default-approval',
  provenance_missing: 'block-package-native-default-approval',
  install_layout_invalid: 'block-clean-install-consumption-approval',
  package_unavailable: 'block-normal-user-default-native-approval',
  smoke_corrupt_output: 'block-hidden-ts-fallback-rollback-and-fallback-deletion',
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function compactDiagnostic(failureKind) {
  assert.ok(FAILURE_KIND_SET.has(failureKind), `unexpected failureKind ${failureKind}`)
  return {
    module: MODULE,
    capability: MODULE,
    status: 'unavailable',
    resultMarker: 'fail-closed',
    failureKind,
    remediation: REMEDIATIONS[failureKind],
    releaseDecision: 'block-clean-install-consumption-normal-user-package-native-default-fallback-deletion',
    blockerStatus: BLOCKERS[failureKind],
    rollbackPolicy: 'corrected-release-tag-package-deprecation-or-default-disable-policy',
  }
}

function simulateConsumptionFailure(input) {
  if (!input.packageAvailable) return compactDiagnostic('package_unavailable')
  if (input.unsupportedPlatform) return compactDiagnostic('unsupported_platform')
  if (input.missingArtifact) return compactDiagnostic('artifact_missing')
  if (input.invalidMetadata) return compactDiagnostic('metadata_invalid')
  if (input.invalidLayout) return compactDiagnostic('install_layout_invalid')
  if (input.integrityMismatch) return compactDiagnostic('integrity_mismatch')
  if (input.nonExecutable) return compactDiagnostic('artifact_not_executable')
  if (input.versionSkew) return compactDiagnostic('version_skew')
  if (input.protocolSkew) return compactDiagnostic('protocol_skew')
  if (input.capabilitySkew) return compactDiagnostic('capability_skew')
  if (input.missingLicense) return compactDiagnostic('license_missing')
  if (input.missingProvenance) return compactDiagnostic('provenance_missing')
  if (input.corruptSmokeOutput) return compactDiagnostic('smoke_corrupt_output')
  return { status: 'available', resultMarker: 'not-used-in-slice-6' }
}

function assertCompactDiagnostic(result) {
  assert.deepEqual(Object.keys(result).sort(), [
    'blockerStatus',
    'capability',
    'failureKind',
    'module',
    'releaseDecision',
    'remediation',
    'resultMarker',
    'rollbackPolicy',
    'status',
  ].sort(), 'diagnostic should expose only compact fields')
  assert.equal(result.module, MODULE, 'diagnostic module should be compact')
  assert.equal(result.capability, MODULE, 'diagnostic capability should be compact')
  assert.equal(result.status, 'unavailable', 'diagnostic should fail unavailable')
  assert.equal(result.resultMarker, 'fail-closed', 'diagnostic should fail closed')
  assert.ok(FAILURE_KIND_SET.has(result.failureKind), 'failureKind should use approved vocabulary')
  assert.equal(typeof result.remediation, 'string', 'remediation should be compact text')
  assert.ok(result.remediation.length > 0, 'remediation should not be empty')
  assert.equal(result.releaseDecision, 'block-clean-install-consumption-normal-user-package-native-default-fallback-deletion')
  assert.ok(result.blockerStatus.startsWith('block-'), 'blocker outcome should block approval')
  assert.equal(result.rollbackPolicy, 'corrected-release-tag-package-deprecation-or-default-disable-policy')
}

function assertNoLeaks(result) {
  const text = JSON.stringify(result)
  assert.equal(/\/tmp\/|\\Temp\\|agentteam-v0427|installed-layout|artifact-bundle|node_modules\/pi-agentteam|native\/tmuxSnapshotParse/i.test(text), false, 'diagnostic must not leak helper/temp/package paths')
  assert.equal(text.includes(process.cwd()), false, 'diagnostic must not leak repo/cwd')
  assert.equal(/stdout|stderr/i.test(text), false, 'diagnostic must not leak stdout/stderr')
  assert.equal(/SHA256SUMS|manifest\.json|provenance\.json|license body|source-revision-placeholder|workflow-run-placeholder|toolchain-identity-placeholder|fixture license copy/i.test(text), false, 'diagnostic must not leak raw metadata body')
  assert.equal(text.includes('LICENSE'), false, 'diagnostic must not leak raw license filename')
  assert.equal(/Error:|AssertionError|stack|at simulateConsumptionFailure/i.test(text), false, 'diagnostic must not leak stack trace')
  assert.equal(/mailbox|TaskReport|report text|full-text/i.test(text), false, 'diagnostic must not leak mailbox/report text')
}

function assertUnsupportedPlatformPolicy(result) {
  assert.equal(result.failureKind, 'unsupported_platform', 'unsupported platforms should use compact failure kind')
  assert.equal(result.status, 'unavailable', 'unsupported platforms should be unavailable')
  assert.equal(result.resultMarker, 'fail-closed', 'unsupported platforms should fail closed')
  assert.equal(result.blockerStatus, 'block-normal-user-default-native-fallback-deletion', 'unsupported platforms should block normal-user/default/native/fallback deletion')
  assert.equal(result.rollbackPolicy, 'corrected-release-tag-package-deprecation-or-default-disable-policy', 'rollback should be corrected release policy')
}

function assertRollbackPolicy(result) {
  assert.equal(result.rollbackPolicy, 'corrected-release-tag-package-deprecation-or-default-disable-policy', 'rollback must be release/tag/package/deprecation/default-disable policy')
  assert.equal(JSON.stringify(result).includes('typescript'), false, 'rollback diagnostic must not use TS fallback as rollback')
  assert.equal(JSON.stringify(result).includes('fallback-after-cutover'), false, 'rollback diagnostic must not imply hidden fallback after cutover')
}

function assertKernelSourceInvariants(root) {
  const source = read(root, 'core/kernel.ts')
  assertIncludes(source, 'if (cutoverRequested || !fallback) return cutoverUnavailableSnapshot(capturedAt)', 'kernel source')
  assertIncludes(source, 'if (cutoverRequested) {\n      recordCutoverUnavailable(toCutoverFailureKind(kind), detail)\n      return\n    }', 'kernel source')
  assertIncludes(source, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'kernel source')
  assertIncludes(source, 'if (cutoverRequested) return fallback(compactInput)', 'kernel source')
  assertIncludes(source, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse'", 'kernel source')
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

function assertRepoArtifactSanity(root) {
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|clean-install-consumption-manifest|artifact-bundle-manifest|install-layout-manifest|consumption-failure-manifest|rollback-manifest|no-leak-manifest|generated-package-manifest)\.(?:json|jsonc|yaml|yml|jsonl)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated failure/rollback artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|rollback|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include native/helper/generated outputs')
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
  const readinessPath = path.join(root, 'commands/readiness.ts')
  const readiness = fs.existsSync(readinessPath) ? read(root, 'commands/readiness.ts') : ''
  const team = read(root, 'commands/team.ts')
  assertIncludes(readiness, "return args.trim().toLowerCase() === 'readiness'", 'readiness command')
  assert.equal(/readiness\s+--|readiness\s+(?:native|availability|resolver|default|cutover|package|artifact|checkpoint|storage|release|rollback|consume|consumption|install|diagnostics|no-leak|failure)/i.test(readiness), false, '/team readiness should not gain Slice 6 options/subcommands')
  assert.equal(/registerTool|model-callable|native availability tool/i.test(readiness), false, 'readiness must not become model-callable tool')
  assert.equal(/openTeamPanel\([^)]*readiness|render.*readiness/i.test(team), false, 'readiness must not be ambient panel rendering')
}

module.exports = {
  name: 'Go kernel v0.4.27 consumption failure rollback no-leak',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const combined = [doc, plan].join('\n\n')

    for (const expected of REQUIRED_DOC_ITEMS) assertIncludes(doc, expected, 'Slice 6 doc')
    for (const expected of REQUIRED_POLICY_ITEMS) assertIncludes(doc, expected, 'Slice 6 policy')
    for (const expected of NO_LEAK_ITEMS) assertIncludes(doc, expected, 'Slice 6 no-leak policy')
    for (const expected of STOP_ITEMS) assertIncludes(doc, expected, 'Slice 6 STOP gate')
    for (const failureKind of FAILURE_KINDS) assertIncludes(doc, `\`${failureKind}\``, 'Slice 6 failure vocabulary')
    for (const forbidden of FORBIDDEN_DOC) assert.equal(combined.includes(forbidden), false, `docs must not imply forbidden policy: ${forbidden}`)
    assert.match(doc, /^## Slice 6 — Failure Rollback No-Leak Hardening$/m, 'approved Slice 6 section should be present')
    assert.match(doc, /^## Slice 7 — Package Native Guardrails and Readiness Containment$/m, 'approved Slice 7 section should be present')
    assert.match(doc, /^## Slice 8 — Final Checkpoint$/m, 'approved Slice 8 final checkpoint section should be present')
    assert.equal(/^## v0\.4\.28\b/im.test(doc), false, 'Slice 6 guard must not allow v0.4.28 implementation')
    assert.equal(/^### v0\.4\.28\b/im.test(plan), false, 'roadmap must not start v0.4.28 implementation')

    const scenarios = [
      ['artifact_missing', { packageAvailable: true, missingArtifact: true }],
      ['metadata_invalid', { packageAvailable: true, invalidMetadata: true }],
      ['integrity_mismatch', { packageAvailable: true, integrityMismatch: true }],
      ['artifact_not_executable', { packageAvailable: true, nonExecutable: true }],
      ['unsupported_platform', { packageAvailable: true, unsupportedPlatform: true }],
      ['version_skew', { packageAvailable: true, versionSkew: true }],
      ['protocol_skew', { packageAvailable: true, protocolSkew: true }],
      ['capability_skew', { packageAvailable: true, capabilitySkew: true }],
      ['license_missing', { packageAvailable: true, missingLicense: true }],
      ['provenance_missing', { packageAvailable: true, missingProvenance: true }],
      ['install_layout_invalid', { packageAvailable: true, invalidLayout: true }],
      ['package_unavailable', { packageAvailable: false }],
      ['smoke_corrupt_output', { packageAvailable: true, corruptSmokeOutput: true }],
    ]
    for (const [failureKind, input] of scenarios) {
      const result = simulateConsumptionFailure(input)
      assert.equal(result.failureKind, failureKind, `${failureKind} should map to compact failure kind`)
      assertCompactDiagnostic(result)
      assertNoLeaks(result)
      assertRollbackPolicy(result)
      if (failureKind === 'unsupported_platform') assertUnsupportedPlatformPolicy(result)
    }

    assertKernelSourceInvariants(root)
    assertReadinessNotExpanded(root)
    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
  },
}
