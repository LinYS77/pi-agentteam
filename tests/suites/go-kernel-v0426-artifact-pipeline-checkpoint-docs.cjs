const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const CHECKPOINT = 'docs/perf/v0.4.26-go-helper-artifact-pipeline-checkpoint.md'
const OWNER_DOC = 'docs/perf/v0.4.26-go-helper-artifact-pipeline.md'
const PACKAGE_VERSION = '0.6.8'
const LINKS = [
  'docs/perf/v0.4.25-native-helper-availability-proof-checkpoint.md',
  OWNER_DOC,
  'tests/suites/go-kernel-v0426-artifact-pipeline-contract-docs.cjs',
  'tests/suites/go-kernel-v0426-build-matrix-policy-docs.cjs',
  'tests/suites/go-kernel-v0426-artifact-output-policy.cjs',
  'tests/suites/go-kernel-v0426-manifest-provenance-generator.cjs',
  'tests/suites/go-kernel-v0426-artifact-smoke-handoff.cjs',
  'tests/suites/go-kernel-v0426-storage-release-policy-docs.cjs',
  'tests/suites/go-kernel-v0426-artifact-pipeline-checkpoint-docs.cjs',
]
const SLICE_SUMMARIES = [
  'Slice 1 pipeline owner contract/release boundary',
  'Slice 2 build matrix/build command policy',
  'Slice 3 local/CI artifact output policy/prototype',
  'Slice 4 manifest/checksum/provenance/license/executable generator prototype',
  'Slice 5 artifact smoke/clean-install handoff',
  'Slice 6 storage/release/rollback policy',
]
const GO_ITEMS = [
  'GO only for GitHub-only v0.4.26 Go helper artifact generation pipeline prototype checkpoint after leader/user approval',
  'GO for evidence only',
  'build matrix definition',
  'build command policy',
  'artifact output policy',
  'local/temp output prototype',
  'manifest/checksum/provenance/license/executable generation prototype',
  'placeholder attestation/signing policy',
  'direct artifact smoke',
  'clean-install handoff',
  'storage/release/rollback policy',
]
const STOP_ITEMS = [
  'helper build command implementation',
  'running `go build`',
  'CI workflow',
  'active GitHub Actions artifact storage',
  'GitHub release assets',
  'npm companion packages',
  'main package inclusion',
  'npm version/publish',
  'package version change',
  'package.json metadata changes',
  'optionalDependencies',
  'lifecycle hooks/downloads',
  'package scripts',
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
  'actual CI/local helper build implementation',
  'generated artifacts across approved matrix',
  'real checksums/provenance/license/executable validation outside temp fixtures',
  'CI artifact upload policy approval',
  'clean install proof consuming real generated artifacts across supported platforms/package managers',
  'package release ownership and companion package metadata approval',
  'normal-user diagnostics UX if needed',
  'parser failure policy in real default path',
  'rollback/default-disable/deprecation execution plan',
  'explicit user approval',
]
const VALIDATION_ITEMS = [
  'tests/suites/go-kernel-v0426-artifact-pipeline-contract-docs.cjs',
  'tests/suites/go-kernel-v0426-build-matrix-policy-docs.cjs',
  'tests/suites/go-kernel-v0426-artifact-output-policy.cjs',
  'tests/suites/go-kernel-v0426-manifest-provenance-generator.cjs',
  'tests/suites/go-kernel-v0426-artifact-smoke-handoff.cjs',
  'tests/suites/go-kernel-v0426-storage-release-policy-docs.cjs',
  'tests/suites/go-kernel-v0426-artifact-pipeline-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0425-native-availability-contract-docs.cjs',
  'tests/suites/go-kernel-v0425-artifact-manifest-prototype.cjs',
  'tests/suites/go-kernel-v0425-clean-install-smoke.cjs',
  'tests/suites/go-kernel-v0425-unsupported-rollback-policy.cjs',
  'tests/suites/go-kernel-v0425-resolver-default-cutover-gate.cjs',
  'tests/suites/go-kernel-v0425-native-availability-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0422-package-native-guardrails.cjs',
  'tests/suites/go-kernel-v0422-packaged-preview-invariants.cjs',
  'tests/suites/go-kernel-v0423-compact-diagnostics-docs.cjs',
  'tests/suites/go-kernel-v0423-compact-diagnostics-model.cjs',
  'tests/suites/go-kernel-v0423-parser-failure-policy.cjs',
  'tests/suites/go-kernel-v0423-compact-diagnostics-readiness.cjs',
  'tests/suites/go-kernel-v0423-compact-diagnostics-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-contract-docs.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-seam-docs.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-integration.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-sunset-docs.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-checkpoint-docs.cjs',
  'node tests/run.cjs',
  'npm run typecheck',
  'npm run -s check:boundaries',
  'git diff --check',
  'npm run --silent bench:team-panel-tmux',
  'PI_AGENTTEAM_KERNEL=go-packaged-preview npm run --silent bench:team-panel-tmux',
  'package/native sanity scan',
]
const RUNTIME_INVARIANTS = [
  'unset/default kernel remains disabled/TypeScript',
  '`go-packaged-preview` remains explicit-only/non-default',
  'current `go-cutover` remains helper-path based',
  'packaged helper discovery does not run in default/disabled/typescript/go/auto/current `go-cutover`',
  '`compactReadModelFingerprint` remains non-cutover / TypeScript fallback',
  'no default Go',
  'TS/pi control plane remains mandatory',
  'Go is helper/kernel behind TS adapter/ports via subprocess/RPC/stdin-stdout',
  'production runtime resolver behavior remains unchanged',
  'production `core/kernel.ts` behavior remains unchanged',
]
const NON_APPROVALS = [
  'v0.4.26 still does not prove normal-user native availability',
  'v0.4.26 does not generate release artifacts',
  'v0.4.26 does not approve package metadata',
  'v0.4.26 does not pass packaged/default/fallback deletion gate',
]
const FORBIDDEN_PHRASES = [
  'normal-user availability is proven',
  'normal-user native availability is proven',
  'release artifacts are generated',
  'package metadata is approved',
  'packaged/default/fallback deletion gate is passed',
  'native/default cutover is approved',
  'fallback deletion is approved',
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
  'GitHub release assets are approved',
  'active artifact storage is approved',
  'main package inclusion is approved',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
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
  assertIncludes(source, "if (!raw || raw === 'none' || raw === 'off' || raw === 'disabled') return 'disabled'", 'kernel source')
  assertIncludes(source, 'const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)', 'kernel source')
  assertIncludes(source, "const activeMode: AgentTeamKernelActiveMode = usesGo() ? 'go' : 'typescript'", 'kernel source')
  assertIncludes(source, "enabled: activeMode === 'go'", 'kernel source')
  assertIncludes(source, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel source')
  assertIncludes(source, "const packagedResolverFailure = packagedPreviewRequested && !explicitHelperPath", 'kernel source')
  assertIncludes(source, "const packagedHelperPath = packagedPreviewRequested && !explicitHelperPath && !packagedResolverFailure", 'kernel source')
  assertIncludes(source, "const cutoverRequested = requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel source')
  assertIncludes(source, 'const startupFallback = cutoverRequested ? undefined', 'kernel source')
  assertIncludes(source, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse'", 'kernel source')
  assertIncludes(source, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'kernel source')
  assertIncludes(source, 'if (cutoverRequested) return fallback(compactInput)', 'kernel source')
}

function assertRepoArtifactSanity(root) {
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|smoke-handoff-manifest|storage-release-manifest|artifact-pipeline-output|artifact-pipeline-checkpoint)\.(?:json|jsonc|yaml|yml|jsonl)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated manifest/package artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|generated|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false, 'package files must not include native/helper/generated outputs')
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

function assertNoCiReleaseOrPackageScripts(root) {
  const workflows = path.join(root, '.github', 'workflows')
  if (!fs.existsSync(workflows)) return
  for (const name of fs.readdirSync(workflows).filter(value => /\.(?:ya?ml)$/i.test(value))) {
    const source = fs.readFileSync(path.join(workflows, name), 'utf8')
    assert.equal(/actions\/upload-artifact|gh\s+release|npm\s+publish|go\s+build/i.test(source), false, `${name} must not add artifact/release/build workflow behavior in Slice 7`)
  }
}

function assertReadinessNotExpanded(root) {
  const readinessPath = path.join(root, 'commands/readiness.ts')
  const readiness = fs.existsSync(readinessPath) ? read(root, 'commands/readiness.ts') : ''
  const team = read(root, 'commands/team.ts')
  assertIncludes(readiness, "return args.trim().toLowerCase() === 'readiness'", 'readiness command')
  assert.equal(/readiness\s+--|readiness\s+(?:native|availability|resolver|default|cutover|package|artifact|checkpoint|storage|release|rollback)/i.test(readiness), false, '/team readiness should not gain options/subcommands')
  assert.equal(/registerTool|model-callable|native availability tool/i.test(readiness), false, 'readiness must not become model-callable tool')
  assert.equal(/openTeamPanel\([^)]*readiness|render.*readiness/i.test(team), false, 'readiness must not be ambient panel rendering')
}

module.exports = {
  name: 'Go kernel v0.4.26 artifact pipeline checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [CHECKPOINT, OWNER_DOC, ...LINKS]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }
    const doc = read(root, CHECKPOINT)
    const ownerDoc = read(root, OWNER_DOC)
    const lower = doc.toLowerCase()

    for (const link of LINKS) assertIncludes(doc, link, 'checkpoint doc')
    assertIncludes(ownerDoc, CHECKPOINT, 'owner doc should link final checkpoint')
    assertIncludes(ownerDoc, 'Proceed only with GitHub-only v0.4.26 Go helper artifact generation pipeline prototype checkpoint review after leader/user approval', 'owner doc final recommendation')

    for (const expected of SLICE_SUMMARIES) assertIncludes(doc, expected, 'checkpoint slice summary')
    for (const expected of GO_ITEMS) assertIncludes(doc, expected, 'checkpoint GO decision')
    for (const expected of STOP_ITEMS) assertIncludes(doc, expected, 'checkpoint STOP decision')
    for (const expected of BLOCKERS) assertIncludes(doc, expected, 'checkpoint blockers')
    for (const expected of VALIDATION_ITEMS) assertIncludes(doc, expected, 'checkpoint validation matrix')
    for (const expected of RUNTIME_INVARIANTS) assertIncludes(doc, expected, 'checkpoint runtime/source invariant')
    for (const expected of NON_APPROVALS) assertIncludes(doc, expected, 'checkpoint non-approval statement')

    assert.ok(lower.includes('evidence only'), 'checkpoint should be evidence-only')
    assert.ok(lower.includes('final github-only v0.4.26 checkpoint'), 'checkpoint should be GitHub-only checkpoint')

    for (const forbidden of FORBIDDEN_PHRASES) {
      assert.equal(doc.includes(forbidden), false, `checkpoint must not imply forbidden approval: ${forbidden}`)
    }

    assertKernelSourceInvariants(root)
    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
    assertNoCiReleaseOrPackageScripts(root)
    assertReadinessNotExpanded(root)
  },
}
