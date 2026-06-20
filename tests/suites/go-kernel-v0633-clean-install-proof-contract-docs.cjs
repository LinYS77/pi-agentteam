const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  APPROVED_REVIEW_WORKFLOW,
  APPROVED_REVIEW_WORKFLOW_PATH,
  REQUIRED_MATRIX_TARGET,
  STRICT_VERIFIER_EXPECTED_CONTEXT_LINES,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const DOC = 'docs/perf/v0.6.33-clean-install-native-helper-consumption.md'
const PACKAGE_VERSION = '0.6.8'
const V0630_TAGGED_COMMIT = '1fedf78'
const V0631_PUSHED_COMMIT = '9aa2d93f02d30dd856f5e67f528c2441bbbd76a5'
const V0632_PUSHED_COMMIT = 'aab584a8af6d53e0d886b66d1d636c7c1f65a5a9'

const REQUIRED_DISTANCE = [
  '## Distance-to-Goal',
  'approximately Phase 2/6',
  'approximately 35% complete',
  'normal-user native helper availability claim remains 0%',
  'approximately 45–50%',
  'still not real native package delivery',
  'still not normal-user native helper availability',
  'still not default Go, default resolver, release evidence, signing/security proof, fallback deletion, or second-platform support',
]

const REQUIRED_PRIOR_FACTS = [
  `v0.6.30 is tagged/pushed at commit \`${V0630_TAGGED_COMMIT}\`.`,
  `v0.6.31 is pushed at commit \`${V0631_PUSHED_COMMIT}\`; its tag remains gated by hosted observation evidence or explicit leader rule change.`,
  `v0.6.32 is pushed at commit \`${V0632_PUSHED_COMMIT}\`; its tag remains gated by v0.6.31 tag state, hosted evidence, or explicit leader waiver.`,
  '`docs/agentteam方案书.md` records the long-term goal as default Go plus TypeScript fallback deletion only after package, install, default, rollback, and security gates are complete.',
]

const REQUIRED_ROUTES = [
  'Route A — hosted observation/tag facts: optional support only.',
  'only if exact externally supplied facts are provided by the leader',
  'must not use `gh`, tokens, network, local hosted queries, downloaded artifacts, raw API payloads, or checked-in hosted records',
  'Route B — package-manager clean-install proof prototype: main route.',
  'temporary package-manager clean-install baseline',
  'explicit consumption from an installed-package-shaped layout',
  'Route C — second platform matrix row: deferred.',
  'No macOS, Windows, arm64, musl, or additional platform support is claimed in v0.6.33.',
  'Route D — next deterministic Go hot path: deferred.',
  'Route E — resolver/package layout design: constrained guardrails inside Route B only.',
  'must not approve or implement a production default resolver',
]

const REQUIRED_SELECTED_ROUTE = [
  'The selected v0.6.33 route is Route B with constrained Route E guardrails.',
  'Main path: package-manager clean-install proof prototype and explicit installed-layout native helper consumption evidence.',
  'Route E contribution: package-relative installed-layout guardrails, explicit resolver constraints, fail-closed/no-leak expectations, and default-resolver STOP gates.',
  'Optional Route A contribution: bounded hosted observation/tag facts only if the leader supplies exact external facts.',
  'Local work must not trigger, query, or fetch hosted workflow state; do not use `gh`, tokens, or network.',
]

const REQUIRED_SCOPE_STOP = [
  'v0.6.33 is a temporary package-manager clean-install baseline plus explicit installed-layout consumption prototype.',
  'Slice 1 only documents and guards that contract.',
  'Not normal-user native helper availability.',
  'Not real package-manager native delivery.',
  'Not release evidence.',
  'Not default resolver approval.',
  'Not default Go approval.',
  'Not fallback deletion approval.',
  'Not signing/security proof.',
  'No `npm version` and no `npm publish`.',
  '`package.json` remains `0.6.8`.',
  'No package metadata, `package.json#files` native entries, `optionalDependencies`, native dependencies, lifecycle hooks, package scripts, `postinstall`, download, or install-time build.',
  'No `package-lock.json`, `npm-shrinkwrap.json`, `go.mod`, or `go.sum`.',
  'No checked-in native artifacts, generated artifacts, hosted artifacts, tarballs, downloaded bundles, raw records, raw API payloads, generated manifests, checksums, provenance, attestations, or verifier output.',
  'No default Go, default resolver, current `go-cutover`, or runtime semantic change.',
  '`go-packaged-preview` remains explicit-only and non-default.',
  '`compactReadModelFingerprint` remains TypeScript fallback / non-cutover.',
  '`/team readiness` is not expanded.',
  'No release assets, npm companion package, main package native inclusion, install source approval, platform availability claim, signing, cosign, SLSA, or security attestation claim.',
]

const REQUIRED_NO_AVAILABILITY = [
  '## No-Availability Wording',
  'Allowed wording for v0.6.33 is limited to contract, baseline, prototype, explicit preview, review-only, temp clean-install, and prerequisite evidence.',
  'Do not describe v0.6.33 as user availability, package availability, release availability, install-source availability, platform availability, default availability, signed availability, or fallback deletion readiness.',
  'The availability claim remains 0% until package delivery, default resolver, release/signing/security, rollback, platform, and user-facing approval gates are complete.',
]

const REQUIRED_SLICES = [
  'Slice 1 — contract docs/guard.',
  'Slice 2 — temp npm clean-install baseline.',
  'Slice 3 — verified artifact → installed package layout → explicit `go-packaged-preview` consumption.',
  'Slice 4 — fail-closed/no-leak negative cases.',
  'Slice 5 — package/runtime guardrails.',
  'Slice 6 — final checkpoint/tag policy.',
  'Each slice must preserve package/runtime/default/readiness boundaries unless a later leader assignment explicitly changes the boundary.',
]

const REQUIRED_TAG_POLICY = [
  'v0.6.31 and v0.6.32 tags are still pending under their existing gates.',
  'v0.6.33 can land as a `main` commit after review.',
  'A v0.6.33 tag should wait for prior tag gates or an explicit leader waiver.',
  'No worker should create, push, or move tags in v0.6.33 Slice 1.',
]

const REQUIRED_GUARD_CONTRACT = [
  'tests/suites/go-kernel-v0633-clean-install-proof-contract-docs.cjs',
  'distance assessment, route evaluation A–E, selected Route B plus constrained Route E, optional externally supplied Route A support, planned slices, tag policy, STOP gates, non-goals, and no-availability wording',
  'does not overstate normal-user availability, package-manager native delivery, release assets, install source, package artifacts, default Go, default resolver, fallback deletion, second platform support, signing, cosign, or SLSA',
  '`package.json` stays at `0.6.8`',
  'installed-layout consumption is not read by default',
  '`go-packaged-preview` is explicit-only',
  'current `go-cutover` semantics are unchanged',
  '`compactReadModelFingerprint` stays TypeScript fallback',
  'one `linux-x64-glibc` review row',
  'no checked-in generated, hosted, native, tarball, package, or raw observation artifacts',
]

const FORBIDDEN_DOC_CLAIMS = [
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'native helper availability is proven',
  'native availability proof is complete',
  'real package-manager native delivery is complete',
  'package-manager native delivery is approved',
  'package-manager clean-install proof is complete',
  'release assets are implemented',
  'release asset is approved',
  'release evidence is complete',
  'install source is approved',
  'install source is complete',
  'package artifact is approved',
  'package artifact is complete',
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'second platform is supported',
  'second platform support is approved',
  'macOS is supported availability',
  'Windows is supported availability',
  'arm64 is supported availability',
  'musl is supported availability',
  'signing is approved',
  'signing proof is complete',
  'cosign is approved',
  'cosign proof is complete',
  'SLSA is approved',
  'SLSA proof is complete',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel))
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

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DISTANCE) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_PRIOR_FACTS) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROUTES) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_SELECTED_ROUTE) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_SCOPE_STOP) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_NO_AVAILABILITY) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_SLICES) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_TAG_POLICY) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_GUARD_CONTRACT) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_DOC_CLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
}

function assertGitignore(root) {
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
}

function assertPackageInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define ${key}`)
  }
  assert.equal((packageJson.files || []).some(item => /(?:github|workflow|helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|hosted-observation|record|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false, 'package files must not include workflow/native/helper/generated/record artifacts')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+(?:publish|version)\b/.test(command), false, `${name} must not publish/version package`)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild|postinstall/i.test(command), false, `${name} must not build/download native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }
}

function assertRuntimeResolverInvariants(root) {
  const kernel = read(root, 'core/kernel.ts')
  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  const runtimeSources = `${kernel}\n${resolver}`

  assert.ok(kernel.includes("const packagedPreviewRequested = requestedMode === 'go-packaged-preview'"), 'packaged preview must remain explicit-only')
  assert.ok(kernel.includes("const packagedResolverFailure = packagedPreviewRequested && !explicitHelperPath"), 'packaged resolver failure must be preview-gated')
  assert.ok(kernel.includes("const packagedHelperPath = packagedPreviewRequested && !explicitHelperPath && !packagedResolverFailure"), 'direct packaged helper path must be preview-gated')
  assert.ok(kernel.includes('const packagedManifestPath = packagedPreviewRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure'), 'manifest path must be preview-gated')
  assert.ok(kernel.includes('const packagedManifestInstallRoot = packagedPreviewRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure'), 'manifest root must be preview-gated')
  assert.ok(kernel.includes('const packagedManifestRequested = packagedPreviewRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure'), 'manifest resolver must be preview-gated')
  assert.ok(kernel.includes('const helperPath = explicitHelperPath || packagedHelperPath || packagedManifestHelperPath'), 'helper precedence remains explicit > direct packaged > manifest')
  assert.ok(kernel.includes("const cutoverRequested = requestedMode === 'go-cutover' || packagedPreviewRequested"), 'go-cutover semantics remain explicit')
  assert.ok(kernel.includes('if (cutoverRequested) return fallback(compactInput)'), 'compactReadModelFingerprint remains TS fallback for cutover modes')

  assert.equal(/package\.json|node_modules|import\.meta\.url|__dirname|process\.cwd\(\)/i.test(kernel), false, 'kernel must not discover installed package layout by default')
  assert.equal(/download-artifact|artifact-index|artifactIndex|artifact URL|artifactUrl|go-helper-review-artifact|hosted-observation|workflow-run|github\.run_id|github\.run_attempt|github\.sha|workflow_dispatch|actions\/download-artifact/i.test(runtimeSources), false, 'runtime/resolver must not consume hosted workflow/artifact metadata')
  assert.equal(/npm\s+(?:publish|version|pack)|gh\s+release|actions\/upload-artifact|cosign|slsa|postinstall|preinstall|install-time build|curl\b|wget\b/i.test(runtimeSources), false, 'runtime/resolver must not contain release/npm/download/install behavior')
  assert.equal(/signed:\s*true|cosign|slsa|signing proof|signing approved/i.test(runtimeSources), false, 'runtime/resolver must not contain real signing approval behavior')
  assert.equal(/default Go is enabled|default resolver is enabled|normal-user native availability|package-manager native delivery|release asset is approved|fallback deletion is approved/i.test(runtimeSources), false, 'runtime/resolver must not claim package/default/release availability')
}

function assertKernelRuntimeBehavior(env) {
  const kernel = env.helpers.requireDist('core/kernel.js')
  const packagedEnv = {
    PATH: process.env.PATH || '',
    PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_ROOT: '/tmp/v0633-should-not-read-root',
    PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_MANIFEST: 'native/tmuxSnapshotParse/manifest.json',
    PI_AGENTTEAM_KERNEL_PACKAGED_HELPER: '/tmp/v0633-should-not-run-helper',
  }
  for (const mode of [undefined, 'disabled', 'typescript', 'go', 'auto']) {
    const adapter = kernel.createAgentTeamKernelAdapter({ mode, env: packagedEnv })
    const metadata = adapter.metadata()
    assert.equal(metadata.kernel.enabled, false, `${mode || 'default'} must not enable Go from packaged env`)
    assert.equal(metadata.kernel.mode, 'typescript', `${mode || 'default'} must remain TypeScript without explicit helper`)
    assert.equal(metadata.kernel.calls, 0, `${mode || 'default'} must not call packaged helper`)
  }

  const preview = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: {} }).metadata()
  assert.equal(preview.kernel.requestedMode, 'go-packaged-preview')
  assert.equal(preview.kernel.requestedKnownKernel, true)
  assert.equal(preview.kernel.enabled, false)
  assert.equal(preview.kernel.cutoverStatus, 'unavailable')
  assert.equal(preview.kernel.cutoverFailureKind, 'missing-helper')
}

function assertWorkflowInvariants(root) {
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only one review workflow file may exist')
  assertWorkflowContract(root)
  const workflow = readWorkflow(root)
  assertIncludes(workflow, `permissions:\n  contents: read`, 'workflow permissions')
  for (const expected of STRICT_VERIFIER_EXPECTED_CONTEXT_LINES) assertIncludes(workflow, expected, 'workflow strict expected-context flags')
  assert.equal((workflow.match(/actions\/upload-artifact@v4/g) || []).length, 1, 'workflow uploads exactly once')
  assert.equal((workflow.match(/actions\/download-artifact@v4/g) || []).length, 1, 'workflow downloads exactly once')
  assert.equal((workflow.match(/^\s+- runner:/gm) || []).length, 2, 'workflow keeps one build row and one verify row')
  assert.equal((workflow.match(new RegExp(`target: ${REQUIRED_MATRIX_TARGET}`, 'g')) || []).length, 2, 'workflow keeps linux-x64-glibc build and verify rows only')
  assert.equal((workflow.match(/runner: ubuntu-latest/g) || []).length, 2, 'workflow keeps ubuntu-latest build and verify rows')
  assert.equal((workflow.match(/retention-days: 7/g) || []).length, 1, 'workflow retention stays 7 days')
  assert.equal(/macos-latest|windows-latest|linux-arm64|arm64|musl|cross-?compile|continue-on-error|experimental:\s*true/i.test(workflow), false, 'workflow must not add unsupported rows')
  assert.equal(/gh\s+release|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|cosign|slsa|signing|gh\s+attestation/i.test(workflow), false, 'workflow must not add release/npm/git/signing behavior')
  assert.equal(/curl\b|wget\b|node-gyp\b|prebuild|postinstall|preinstall|install-time build|package-manager install proof/i.test(workflow), false, 'workflow must not add download/install/package behavior')
}

function assertNoGeneratedHostedNativeArtifacts(root) {
  const generatedNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|review-artifact-index|artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|manifest|license|workflow-summary|verifier-output|hosted-observation-record|workflow-run|raw-payload|api-payload)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|md)$/i
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => !rel.startsWith('scripts/lib/go-helper-hosted-observation-record.cjs'))
    .filter(rel => !rel.startsWith('scripts/verify-go-helper-hosted-observation-record.cjs'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated/hosted/native artifacts or raw records')
}

module.exports = {
  name: 'Go kernel v0.6.33 clean-install proof contract docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertGitignore(root)
    assertPackageInvariants(root)
    assertRuntimeResolverInvariants(root)
    assertKernelRuntimeBehavior(env)
    assertWorkflowInvariants(root)
    assertNoGeneratedHostedNativeArtifacts(root)
  },
}
