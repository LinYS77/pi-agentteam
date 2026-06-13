const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { assertNoUnapprovedWorkflowReleaseOrPackageBehavior } = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const DOC = 'docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md'
const PLAN = 'docs/agentteam方案书.md'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_LINKS = [
  'docs/perf/v0.4.26-go-helper-artifact-pipeline-checkpoint.md',
  'docs/perf/v0.4.26-go-helper-artifact-pipeline.md',
  'tests/suites/go-kernel-v0426-artifact-pipeline-checkpoint-docs.cjs',
  'tests/suites/go-kernel-v0426-artifact-smoke-handoff.cjs',
  'tests/suites/go-kernel-v0425-clean-install-smoke.cjs',
  'docs/perf/v0.4.25-native-helper-availability-proof-checkpoint.md',
  'tests/suites/go-kernel-v0427-artifact-bundle-contract.cjs',
  'tests/suites/go-kernel-v0427-install-layout-matrix-docs.cjs',
  'tests/suites/go-kernel-v0427-clean-install-consumption.cjs',
  'tests/suites/go-kernel-v0427-resolver-discovery-contract.cjs',
  'tests/suites/go-kernel-v0427-consumption-failure-rollback-no-leak.cjs',
  'tests/suites/go-kernel-v0427-package-native-guardrails.cjs',
  'docs/perf/v0.4.27-generated-artifact-clean-install-consumption-checkpoint.md',
  'tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs',
]
const CONSUMPTION_BOUNDARY_ITEMS = [
  'generated artifact input is pre-existing approved evidence, not produced by package install',
  'installed layout starts from a clean temp or package-manager equivalent root, not a source checkout',
  'manifest/helper paths are package-relative, allowlisted, and traversal-safe',
  'integrity metadata covers checksum, size, provenance, license metadata, executable policy, module, protocol, package version, helper version, capability, and platform tuple',
  'direct helper smoke runs only through explicit test/preview injection until separately approved',
  'no Go toolchain is required',
  'no source checkout path is required',
  'no manual helper environment override is required',
  'no lifecycle download is allowed',
  'no install-time build is allowed',
  'no hidden network fetch is allowed',
  'no default resolver activation is allowed',
  'failure is fail-closed and no-leak',
]
const FUTURE_AREAS = [
  'Future implementation work belongs to separately approved v0.4.28 or later planning, not this checkpoint',
]
const STOP_ITEMS = [
  'production clean-install consumption implementation',
  'production runtime resolver behavior changes',
  'package manager install behavior changes',
  'package.json change',
  'package version change',
  'npm version',
  'npm publish',
  'optionalDependencies',
  'lifecycle hooks/downloads',
  'package scripts',
  'helper build commands',
  'running `go build`',
  'CI workflow implementation',
  'active GitHub Actions artifact storage',
  'GitHub release assets',
  'npm companion packages',
  'main package inclusion',
  'lockfiles',
  'go.mod/go.sum',
  'checked-in native binaries',
  'tarballs',
  'generated manifests/artifacts/package artifacts',
  'default Go enablement',
  'current `go-cutover` behavior changes',
  '`go-packaged-preview` availability semantics changes',
  'TypeScript fallback deletion',
  'hidden TS fallback rollback after cutover',
  '`compactReadModelFingerprint` cutover',
  'broader Go authority',
  'native Go pi extension assumption',
  'readiness expansion',
  'ambient `/team` diagnostics',
  'model-callable native/readiness tool',
  'normal-user native availability claims before proof is accepted',
  'Slice 2 work without separate approval',
]
const RUNTIME_INVARIANTS = [
  'default/unset remains disabled/TypeScript',
  'disabled, typescript, go, auto, current `go-cutover`, and `go-packaged-preview` behavior remains unchanged',
  '`go-packaged-preview` remains explicit-only and non-default',
  'current `go-cutover` remains helper-path based and unchanged',
  'packaged helper discovery does not run in default/disabled/typescript/go/auto/current `go-cutover`',
  '`tmuxSnapshotParse` remains the only cutover-owned module under discussion',
  '`compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
  'production runtime resolver behavior remains unchanged',
  'production `core/kernel.ts` behavior remains unchanged',
  'TS/pi control plane remains mandatory',
  'Go helper remains parser-only stdin/stdout `tmuxSnapshotParse` behind TS adapter/ports via subprocess/RPC/stdin-stdout',
]
const PACKAGE_INVARIANTS = [
  '`package.json` version remains `0.6.8`',
  'no package/native artifacts/metadata changes',
  'no `optionalDependencies`',
  'no lifecycle hooks/downloads',
  'no package scripts for helper build/install/download/package/version/publish behavior',
  'no lockfiles',
  'no `go.mod`/`go.sum`',
  'no checked-in native binaries',
  'no tarballs',
  'no generated manifests/artifacts',
  'no generated package artifacts',
  'no real package inclusion or native artifact approval',
]
const READINESS_INVARIANTS = [
  '`/team readiness` remains transitional reviewer tooling only',
  'no `/team readiness` options or subcommands are added',
  'no ambient `/team` panel diagnostics are rendered',
  'no model-callable readiness/native tools are added',
  'readiness output is not normal-user native availability proof',
]
const FORBIDDEN_PHRASES = [
  'normal-user availability is proven',
  'normal-user native availability is proven',
  'clean-install consumption is implemented',
  'production resolver behavior is changed',
  'package manager install behavior is changed',
  'generated artifacts are approved',
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

function assertRepoArtifactSanity(root) {
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|clean-install-consumption-manifest|consumed-artifact-manifest|artifact-consumption-output)\.(?:json|jsonc|yaml|yml|jsonl)$/i
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

function assertKernelSourceInvariants(root) {
  const source = read(root, 'core/kernel.ts')
  assertIncludes(source, "if (!raw || raw === 'none' || raw === 'off' || raw === 'disabled') return 'disabled'", 'kernel source')
  assertIncludes(source, 'const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)', 'kernel source')
  assertIncludes(source, "const activeMode: AgentTeamKernelActiveMode = usesGo() ? 'go' : 'typescript'", 'kernel source')
  assertIncludes(source, "enabled: activeMode === 'go'", 'kernel source')
  assertIncludes(source, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel source')
  assertIncludes(source, "const packagedResolverFailure = packagedPreviewRequested && !explicitHelperPath", 'kernel source')
  assertIncludes(source, "const cutoverRequested = requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel source')
  assertIncludes(source, 'const startupFallback = cutoverRequested ? undefined', 'kernel source')
  assertIncludes(source, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse'", 'kernel source')
  assertIncludes(source, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'kernel source')
  assertIncludes(source, 'if (cutoverRequested) return fallback(compactInput)', 'kernel source')
}

function assertReadinessNotExpanded(root) {
  const readinessPath = path.join(root, 'commands/readiness.ts')
  const readiness = fs.existsSync(readinessPath) ? read(root, 'commands/readiness.ts') : ''
  const team = read(root, 'commands/team.ts')
  assertIncludes(readiness, "return args.trim().toLowerCase() === 'readiness'", 'readiness command')
  assert.equal(/readiness\s+--|readiness\s+(?:native|availability|resolver|default|cutover|package|artifact|checkpoint|storage|release|rollback|consume|consumption|install)/i.test(readiness), false, '/team readiness should not gain options/subcommands')
  assert.equal(/registerTool|model-callable|native availability tool/i.test(readiness), false, 'readiness must not become model-callable tool')
  assert.equal(/openTeamPanel\([^)]*readiness|render.*readiness/i.test(team), false, 'readiness must not be ambient panel rendering')
}

function assertNoWorkflowReleaseOrBuild(root) {
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
}

module.exports = {
  name: 'Go kernel v0.4.27 clean-install consumption contract docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [DOC, PLAN, ...REQUIRED_LINKS]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const combined = [doc, plan].join('\n\n')

    for (const link of REQUIRED_LINKS) assertIncludes(doc, link, 'v0.4.27 consumption doc')
    assertIncludes(plan, DOC, 'roadmap should reference v0.4.27 consumption doc')
    assertIncludes(plan, 'tests/suites/go-kernel-v0427-clean-install-consumption-contract-docs.cjs', 'roadmap should reference v0.4.27 guard')

    for (const expected of [
      'v0.4.27 Generated Artifact Clean-Install Consumption Checkpoint',
      'Slice 1 docs/tests-only owner contract',
      'how future clean-install proof may consume generated helper artifacts after v0.4.26 pipeline prototype evidence',
      'GitHub-only evidence boundary',
      'not package/native/default/fallback/readiness approval',
      'does not implement package install',
      'production resolver behavior',
      'artifact download',
      'CI workflow',
      'release assets',
      'npm package changes',
      'default Go',
      'TypeScript fallback deletion',
      '`/team readiness` changes',
      'v0.4.27 follows v0.4.26 because v0.4.26 produced GitHub-only artifact generation pipeline prototype evidence, not clean-install consumption proof',
      'T013 remains binding for v0.4.27',
      'TS/pi control plane mandatory',
      'pi extension/provider/tool surfaces remain TS/JS/Node-based',
      'Go helper behind TS adapter/ports via subprocess/RPC/stdin-stdout',
      'no native Go pi extension/provider ABI assumption',
      'Go is not a pi extension/provider surface in this plan',
      'Go helper authority remains parser-only stdin/stdout `tmuxSnapshotParse`',
      'Clean-Install Consumption Boundary',
      'Owner Responsibilities',
      'Slice 2 — Artifact Bundle Contract from v0.4.26 Outputs',
      'Slice 3 — Future Package / Install Layout Decision Matrix',
      'Slice 4 — Clean-Install Consumption Simulation',
      'Slice 5 — Resolver Discovery Contract Without Behavior Change',
      'Slice 6 — Failure Rollback No-Leak Hardening',
      'Slice 7 — Package Native Guardrails and Readiness Containment',
      'Slice 8 — Final Checkpoint',
      'Future v0.4.27 Evidence Areas',
      'Out of Scope',
      'Runtime, Package, and Readiness Invariants',
      'STOP Gates',
      'Slice 1 Validation Plan',
      'Proceed only with v0.4.27 Slice 1 docs/tests-only generated artifact clean-install consumption owner contract review after leader/user approval',
    ]) {
      assertIncludes(doc, expected, 'v0.4.27 consumption doc')
    }

    for (const expected of CONSUMPTION_BOUNDARY_ITEMS) assertIncludes(doc, expected, 'consumption boundary')
    for (const expected of FUTURE_AREAS) assertIncludes(doc, expected, 'future evidence area')
    for (const expected of STOP_ITEMS) assertIncludes(doc, expected, 'STOP gate')
    for (const expected of RUNTIME_INVARIANTS) assertIncludes(doc, expected, 'runtime invariant')
    for (const expected of PACKAGE_INVARIANTS) assertIncludes(doc, expected, 'package invariant')
    for (const expected of READINESS_INVARIANTS) assertIncludes(doc, expected, 'readiness invariant')

    for (const [label, pattern] of [
      ['scope', /Scope: Slice 1 docs\/tests-only owner contract[\s\S]*GitHub-only evidence boundary[\s\S]*not package\/native\/default\/fallback\/readiness approval[\s\S]*does not implement package install[\s\S]*production resolver behavior[\s\S]*`\/team readiness` changes/i],
      ['decision', /Slice 1 recommendation:[\s\S]*GO only for docs\/tests-only generated artifact clean-install consumption owner contract after leader review[\s\S]*STOP for production clean-install consumption implementation[\s\S]*STOP for artifact download, lifecycle install, install-time build, or hidden network fetch[\s\S]*STOP for Slice 2 work without separate approval/i],
      ['runtime boundary', /T013 remains binding for v0\.4\.27:[\s\S]*TS\/pi control plane mandatory[\s\S]*pi extension\/provider\/tool surfaces remain TS\/JS\/Node-based[\s\S]*Go helper behind TS adapter\/ports via subprocess\/RPC\/stdin-stdout[\s\S]*no native Go pi extension\/provider ABI assumption[\s\S]*Go helper authority remains parser-only stdin\/stdout `tmuxSnapshotParse`/i],
      ['consumption boundary', /Clean-Install Consumption Boundary[\s\S]*pre-existing approved evidence, not produced by package install[\s\S]*clean temp or package-manager equivalent root, not a source checkout[\s\S]*package-relative, allowlisted, and traversal-safe[\s\S]*no lifecycle download is allowed[\s\S]*no install-time build is allowed[\s\S]*no hidden network fetch is allowed[\s\S]*no default resolver activation is allowed/i],
      ['owner responsibilities', /Owner Responsibilities[\s\S]*artifact producer[\s\S]*consumption owner[\s\S]*package owner[\s\S]*release owner[\s\S]*runtime owner[\s\S]*readiness owner/i],
      ['invariants', /Runtime, Package, and Readiness Invariants[\s\S]*default\/unset remains disabled\/TypeScript[\s\S]*`go-packaged-preview` remains explicit-only and non-default[\s\S]*current `go-cutover` remains helper-path based and unchanged[\s\S]*`package\.json` version remains `0\.6\.8`[\s\S]*`\/team readiness` remains transitional reviewer tooling only/i],
      ['validation', /Slice 1 Validation Plan[\s\S]*node --check tests\/suites\/go-kernel-v0427-clean-install-consumption-contract-docs\.cjs[\s\S]*node tests\/run\.cjs go-kernel-v0427-clean-install-consumption-contract-docs[\s\S]*package\/native sanity scan[\s\S]*repo artifact\/tarball\/generated manifest\/package artifact scan[\s\S]*runtime\/default\/readiness invariant scan/i],
    ]) {
      assertMatches(doc, pattern, `v0.4.27 consumption doc: ${label}`)
    }

    assertMatches(doc, /^## Slice 2 — Artifact Bundle Contract from v0\.4\.26 Outputs$/m, 'approved Slice 2 section should be present')
    assertMatches(doc, /^## Slice 3 — Future Package \/ Install Layout Decision Matrix$/m, 'approved Slice 3 section should be present')
    assertMatches(doc, /^## Slice 4 — Clean-Install Consumption Simulation$/m, 'approved Slice 4 section should be present')
    assertMatches(doc, /^## Slice 5 — Resolver Discovery Contract Without Behavior Change$/m, 'approved Slice 5 section should be present')
    assertMatches(doc, /^## Slice 6 — Failure Rollback No-Leak Hardening$/m, 'approved Slice 6 section should be present')
    assertMatches(doc, /^## Slice 7 — Package Native Guardrails and Readiness Containment$/m, 'approved Slice 7 section should be present')
    assertMatches(doc, /^## Slice 8 — Final Checkpoint$/m, 'approved Slice 8 final checkpoint section should be present')
    assert.equal(/^## v0\.4\.28\b/im.test(doc), false, 'v0.4.27 doc must not start v0.4.28 implementation')
    assert.equal(/^### v0\.4\.28\b/im.test(plan), false, 'roadmap addition must not start v0.4.28 implementation')

    for (const forbidden of FORBIDDEN_PHRASES) {
      assert.equal(combined.includes(forbidden), false, `v0.4.27 docs must not imply forbidden policy: ${forbidden}`)
    }

    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
    assertKernelSourceInvariants(root)
    assertReadinessNotExpanded(root)
    assertNoWorkflowReleaseOrBuild(root)
  },
}
