const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES,
} = require('../fixtures/kernel/historicalCheckpointDeletionMap.cjs')

const READY_DELETED_SUITES = new Set(HISTORICAL_CHECKPOINT_READY_TO_DELETE_SUITES)
const { assertNoUnapprovedWorkflowReleaseOrPackageBehavior } = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const CHECKPOINT = 'docs/perf/v0.4.27-generated-artifact-clean-install-consumption-checkpoint.md'
const OWNER_DOC = 'docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md'
const PLAN = 'docs/agentteam方案书.md'
const PACKAGE_VERSION = '0.6.8'
const LINKS = [
  'docs/perf/v0.4.26-go-helper-artifact-pipeline-checkpoint.md',
  OWNER_DOC,
  'tests/suites/go-kernel-v0427-clean-install-consumption-contract-docs.cjs',
  'tests/suites/go-kernel-v0427-artifact-bundle-contract.cjs',
  'tests/suites/go-kernel-v0427-install-layout-matrix-docs.cjs',
  'tests/suites/go-kernel-v0427-clean-install-consumption.cjs',
  'tests/suites/go-kernel-v0427-resolver-discovery-contract.cjs',
  'tests/suites/go-kernel-v0427-consumption-failure-rollback-no-leak.cjs',
  'tests/suites/go-kernel-v0427-package-native-guardrails.cjs',
  'tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs',
]
const SLICE_SUMMARIES = [
  'Slice 1 generated artifact clean-install consumption owner contract',
  'Slice 2 artifact bundle contract from v0.4.26 outputs',
  'Slice 3 future package/install layout matrix',
  'Slice 4 temp clean-install consumption simulation',
  'Slice 5 resolver discovery contract only, without production behavior change',
  'Slice 6 failure/rollback/unsupported-platform/no-leak hardening',
  'Slice 7 package/native/readiness/runtime guardrail consolidation',
]
const GO_ITEMS = [
  'GO only for GitHub-only v0.4.27 Generated Artifact Clean-Install Consumption checkpoint review after leader/user approval',
  'GO for evidence only',
  'GitHub-only v0.4.27 evidence after leader/user approval',
  'artifact bundle contract from v0.4.26 outputs',
  'future package/install layout matrix',
  'temp clean-install consumption simulation',
  'resolver discovery contract only, without production behavior change',
  'failure/rollback/unsupported-platform/no-leak hardening',
  'package/native/readiness/runtime guardrail consolidation',
]
const STOP_ITEMS = [
  'npm version/publish/pack approval',
  'package version change',
  'package metadata/files/optionalDependencies/scripts changes',
  'lifecycle hooks',
  'postinstall/download/install-time build',
  'lockfiles',
  'go.mod/go.sum',
  'native binaries',
  'tarballs',
  'generated artifacts/manifests/checksum/provenance/attestation/package artifacts',
  'helper build commands',
  'running `go build`',
  'CI workflow',
  'artifact upload/storage',
  'GitHub release assets',
  'npm companion packages',
  'main package inclusion',
  'default Go',
  'default resolver activation',
  '`go-cutover` semantic changes',
  '`go-packaged-preview` semantic changes',
  'TypeScript fallback deletion',
  'hidden TS fallback rollback',
  '`compactReadModelFingerprint` cutover',
  'broad Go authority',
  'native Go pi extension assumption',
  '`/team readiness` expansion',
  'normal-user UI/tool/runtime diagnostics',
  'commit/tag/push before leader/user approval',
]
const BLOCKERS = [
  'actual helper build implementation',
  'approved CI artifact storage',
  'real generated artifacts across final matrix',
  'real clean install across supported platforms/package managers',
  'package release ownership',
  'companion package metadata approval',
  'normal-user diagnostics UX if needed',
  'production resolver/default parser failure proof',
  'rollback/default-disable execution plan',
  'explicit user approval for package/default/fallback deletion',
]
const VALIDATION_ITEMS = [
  'tests/suites/go-kernel-v0427-clean-install-consumption-contract-docs.cjs',
  'tests/suites/go-kernel-v0427-artifact-bundle-contract.cjs',
  'tests/suites/go-kernel-v0427-install-layout-matrix-docs.cjs',
  'tests/suites/go-kernel-v0427-clean-install-consumption.cjs',
  'tests/suites/go-kernel-v0427-resolver-discovery-contract.cjs',
  'tests/suites/go-kernel-v0427-consumption-failure-rollback-no-leak.cjs',
  'tests/suites/go-kernel-v0427-package-native-guardrails.cjs',
  'tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs',
  'docs/perf/v0.4.25-native-helper-availability-proof.md',
  'docs/perf/v0.4.25-native-helper-availability-proof-checkpoint.md',
  'tests/suites/go-kernel-v0425-native-availability-contract-docs.cjs',
  'tests/suites/go-kernel-v0425-artifact-manifest-prototype.cjs',
  'tests/suites/go-kernel-v0425-clean-install-smoke.cjs',
  'tests/suites/go-kernel-v0425-unsupported-rollback-policy.cjs',
  'tests/suites/go-kernel-v0425-resolver-default-cutover-gate.cjs',
  'docs/perf/v0.4.26-go-helper-artifact-pipeline.md',
  'docs/perf/v0.4.26-go-helper-artifact-pipeline-checkpoint.md',
  'tests/suites/go-kernel-v0426-artifact-pipeline-contract-docs.cjs',
  'tests/suites/go-kernel-v0426-build-matrix-policy-docs.cjs',
  'tests/suites/go-kernel-v0426-artifact-output-policy.cjs',
  'tests/suites/go-kernel-v0426-manifest-provenance-generator.cjs',
  'tests/suites/go-kernel-v0426-artifact-smoke-handoff.cjs',
  'tests/suites/go-kernel-v0426-storage-release-policy-docs.cjs',
  'tests/suites/go-kernel-v0426-artifact-pipeline-checkpoint-docs.cjs',
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
  'package/native sanity scans',
  'no checked-in generated output scans',
]
const INVARIANTS = [
  'TS/pi control plane remains mandatory',
  'Go remains helper/kernel behind TS adapter/ports via subprocess/RPC/stdin-stdout',
  'unset/default kernel remains disabled/TypeScript',
  'disabled, typescript, go, auto, current `go-cutover`, and `go-packaged-preview` behavior remains unchanged',
  '`go-packaged-preview` remains explicit-only/non-default',
  'current `go-cutover` remains helper-path based',
  'packaged helper discovery does not run in default/disabled/typescript/go/auto/current `go-cutover`',
  '`tmuxSnapshotParse` remains the only cutover-owned candidate under discussion',
  '`compactReadModelFingerprint` remains non-cutover / TypeScript fallback',
  'no default Go',
  'no default resolver activation',
  'no production resolver/default discovery behavior changes',
  'no TypeScript fallback deletion',
  'no hidden TS fallback rollback after cutover',
  'Go authority remains parser-only stdin/stdout `tmuxSnapshotParse`',
  'no native Go pi extension assumption',
  '`/team readiness` remains transitional reviewer tooling and is not expanded',
  'package.json version remains `0.6.8`',
  'production `core/kernel.ts` behavior remains unchanged',
]
const NON_APPROVALS = [
  'v0.4.27 still does not prove normal-user native availability',
  'v0.4.27 does not generate release artifacts',
  'v0.4.27 does not approve package metadata',
  'v0.4.27 does not approve npm companion packages or main package native inclusion',
  'v0.4.27 does not approve default Go or default resolver activation',
  'v0.4.27 does not pass package/native/default/fallback deletion gate',
]
const FORBIDDEN_PHRASES = [
  'normal-user availability is proven',
  'normal-user native availability is proven',
  'release artifacts are generated',
  'package metadata is approved',
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
  assertIncludes(source, 'const packagedHelperPath = packagedPreviewRequested && !explicitHelperPath && !packagedResolverFailure', 'kernel source')
  assertIncludes(source, 'const helperPath = explicitHelperPath || packagedHelperPath', 'kernel source')
  assertIncludes(source, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel source')
  assertIncludes(source, 'const startupFallback = cutoverRequested ? undefined', 'kernel source')
  assertIncludes(source, 'if (cutoverRequested || !fallback) return cutoverUnavailableSnapshot(capturedAt)', 'kernel source')
  assertIncludes(source, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse'", 'kernel source')
  assertIncludes(source, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'kernel source')
  assertIncludes(source, 'if (cutoverRequested) return fallback(compactInput)', 'kernel source')
}

function assertRepoArtifactSanity(root) {
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|clean-install-consumption-manifest|consumed-artifact-manifest|artifact-bundle-manifest|install-layout-manifest|consumption-failure-manifest|rollback-manifest|no-leak-manifest|generated-package-manifest|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts\//.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated/checksum/provenance/attestation/package artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include native/helper/generated outputs')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not run npm pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b/.test(command), false, `${name} must not build/install/module-manage helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild|postinstall/i.test(command), false, `${name} must not download/build native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
}

function assertNoCiReleaseOrPackageScripts(root) {
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
}

function assertReadinessNotExpanded(root) {
  const readinessPath = path.join(root, 'commands/readiness.ts')
  const readiness = fs.existsSync(readinessPath) ? read(root, 'commands/readiness.ts') : ''
  const team = read(root, 'commands/team.ts')
  assertIncludes(readiness, "return args.trim().toLowerCase() === 'readiness'", 'readiness command')
  assert.equal(/readiness\s+--|readiness\s+(?:native|availability|resolver|default|cutover|package|artifact|checkpoint|storage|release|rollback|consume|consumption|install|diagnostics|no-leak|failure|guardrail|package-native)/i.test(readiness), false, '/team readiness should not gain options/subcommands')
  assert.equal(/registerTool|model-callable|native availability tool|runtime control plane/i.test(readiness), false, 'readiness must not become model-callable/runtime control tool')
  assert.equal(/openTeamPanel\([^)]*readiness|render.*readiness|ambient.*diagnostics/i.test(team), false, 'readiness must not be ambient panel diagnostics')
}

module.exports = {
  name: 'Go kernel v0.4.27 consumption checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [CHECKPOINT, OWNER_DOC, PLAN, ...LINKS]) {
      assertReadyDeletedOrExists(root, rel)
    }
    const doc = read(root, CHECKPOINT)
    const ownerDoc = read(root, OWNER_DOC)
    const plan = read(root, PLAN)
    const combined = [doc, ownerDoc, plan].join('\n\n')

    for (const link of LINKS) assertIncludes(doc, link, 'checkpoint doc')
    assertIncludes(ownerDoc, CHECKPOINT, 'owner doc should link final checkpoint')
    assertIncludes(ownerDoc, 'Proceed only with GitHub-only v0.4.27 Generated Artifact Clean-Install Consumption Gate checkpoint review after leader/user approval', 'owner doc final recommendation')
    assertIncludes(plan, CHECKPOINT, 'roadmap should reference checkpoint doc')
    assertIncludes(plan, 'tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs', 'roadmap should reference checkpoint guard')

    for (const expected of SLICE_SUMMARIES) assertIncludes(doc, expected, 'checkpoint slice summary')
    for (const expected of GO_ITEMS) assertIncludes(doc, expected, 'checkpoint GO decision')
    for (const expected of STOP_ITEMS) assertIncludes(doc, expected, 'checkpoint STOP decision')
    for (const expected of BLOCKERS) assertIncludes(doc, expected, 'checkpoint blockers')
    for (const expected of VALIDATION_ITEMS) assertIncludes(doc, expected, 'checkpoint validation matrix')
    for (const expected of INVARIANTS) assertIncludes(doc, expected, 'checkpoint invariant')
    for (const expected of NON_APPROVALS) assertIncludes(doc, expected, 'checkpoint non-approval statement')

    assert.ok(doc.toLowerCase().includes('evidence only'), 'checkpoint should be evidence-only')
    assert.ok(doc.toLowerCase().includes('final github-only v0.4.27 checkpoint'), 'checkpoint should be GitHub-only final checkpoint')
    assert.equal(/^## v0\.4\.28\b/im.test(doc), false, 'checkpoint must not start v0.4.28 implementation section')
    assert.equal(/^## .*Implementation\b/im.test(doc), false, 'checkpoint must not add implementation section')

    for (const forbidden of FORBIDDEN_PHRASES) {
      assert.equal(combined.includes(forbidden), false, `checkpoint must not imply forbidden approval: ${forbidden}`)
    }

    assertKernelSourceInvariants(root)
    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
    assertNoCiReleaseOrPackageScripts(root)
    assertReadinessNotExpanded(root)
  },
}
