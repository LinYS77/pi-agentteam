const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  APPROVED_REVIEW_WORKFLOW,
  REQUIRED_MATRIX_TARGET,
  VERIFIER_COMMAND_BASE,
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const DOC = 'docs/perf/v0.6.34-package-release-install-layout-decision.md'
const ROADMAP_DOC = 'docs/agentteam方案书.md'
const V0633_CHECKPOINT = 'docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md'
const PACKAGE_VERSION = '0.6.8'

const REQUIRED_BACKGROUND = [
  '`docs/agentteam方案书.md` records the long-term direction: default Go plus TypeScript fallback deletion only after package, install, default, rollback, and security gates are complete.',
  '`docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md` records the completed v0.6.33 temp clean-install baseline, verified installed-layout explicit preview consumption, fail-closed/no-leak negatives, package/runtime guardrails, and final checkpoint.',
  'v0.6.33 moved prerequisite evidence to approximately 45–50% while keeping normal-user native helper availability at 0%.',
]

const REQUIRED_DISTANCE = [
  '## Distance-to-Goal After v0.6.33',
  'Native/default prerequisite evidence is approximately 45–50% complete.',
  'The normal-user native helper availability claim remains 0%.',
  'Evidence now covers temp npm clean-install TypeScript/pi facade baseline, verified review artifact copied into temp installed-package layout, explicit `go-packaged-preview` helper consumption, fail-closed/no-leak negatives, and package/runtime guardrails.',
  'Evidence still does not cover real package-manager native delivery, package/release ownership, install source ownership, default resolver approval, release assets, signing/security ownership, rollback/default-disable policy, TypeScript fallback deletion approval, or platform support beyond `linux-x64-glibc`.',
  'Native/default prerequisite evidence can move to approximately 55–60%.',
  'Normal-user native helper availability remains 0%.',
  'Default Go and TypeScript fallback deletion remain blocked; v0.6.34 is prerequisite shaping only, not runtime cutover approval.',
]

const REQUIRED_ROUTES = [
  '## Route Evaluation A–F',
  'Route A — package/release ownership plus install-layout decision docs/tests/fixtures: main route.',
  'Route B — real package metadata/native inclusion prototype: forbidden/deferred.',
  'v0.6.34 may only describe non-applied fixture/proposal shapes',
  'Route C — second platform matrix: deferred.',
  'No macOS, Windows, arm64, musl, or additional platform support is claimed in v0.6.34.',
  'Route D — default resolver dry-run/default-disable plan: constrained docs/tests only.',
  'it must not implement production default resolver, package discovery, default Go, or `go-packaged-preview` default behavior',
  'Route E — signing/security ownership plan: placeholder policy only.',
  'it must not claim real signing, cosign, SLSA, security attestation, release asset, or install source approval',
  'Route F — hosted tag backlog: tag policy only.',
  'It must not locally query, trigger, fetch, or record hosted workflow state; no `gh`, token, network, raw hosted records, raw API payloads, or downloaded artifacts are allowed.',
]

const REQUIRED_SELECTED = [
  '## Selected Route',
  'The selected v0.6.34 route is Route A: package/release ownership plus install-layout decision docs/tests/fixtures.',
  'Route B as non-applied package metadata/layout fixture/proposal text.',
  'Route D as docs/tests-only default-disable and future resolver responsibility planning.',
  'Route E as placeholder security/signing ownership policy with no real signing proof.',
  'Route F as tag/backlog policy text with no hosted workflow query, trigger, fetch, or raw record.',
  'v0.6.34 should not jump directly to default resolver/default Go because the package/release owner, install source owner, rollback/default-disable owner, and security owner are not accepted.',
  'It should not jump directly to a second platform matrix because the first normal-user install path is still not owned or released.',
  'It should not jump directly to signing/security because there is no release asset/install source to sign, and no cosign/SLSA ownership has been approved.',
]

const REQUIRED_STOP = [
  '## Scope and STOP Gates',
  'v0.6.34 Slice 1 is a GitHub-only checkpoint contract for package/release ownership and install-layout decision shaping.',
  '`package.json` remains `0.6.8`.',
  'No `npm version` and no `npm publish`.',
  'No package metadata, package files native entries, `optionalDependencies`, native dependencies, lifecycle hooks, `postinstall`, download, or install-time build.',
  'No `package-lock.json`, `npm-shrinkwrap.json`, `go.mod`, or `go.sum`.',
  'No native binaries, generated artifacts, tarballs, release assets, raw hosted records, raw API payloads, downloaded bundles, generated manifests, checksums, provenance, attestations, or verifier output.',
  'No default Go, default resolver, production package discovery, or package-manager native delivery.',
  'No current `go-cutover` semantic changes.',
  'No `go-packaged-preview` default behavior.',
  'No TypeScript fallback deletion and no hidden fallback rollback policy change.',
  '`compactReadModelFingerprint` remains TypeScript fallback / non-cutover.',
  '`/team readiness` is not expanded.',
  'No broad Go authority over tmux execution/capture, worker lifecycle, task/report governance, PlanRun, package/release, UI rendering, command control plane, full-text boundaries, state, mailbox, or report access.',
  'No tag, push, hosted workflow query, hosted workflow trigger, `gh`, token, or network action by a worker.',
]

const REQUIRED_NO_AVAILABILITY = [
  '## No-Availability Wording',
  'Allowed wording for v0.6.34 is limited to ownership decision contract, install-layout decision shaping, non-applied fixture/proposal, placeholder policy, review-only, GitHub-only, and prerequisite evidence.',
  'Do not describe v0.6.34 as normal-user availability, package-manager native delivery, package/release approval, install source approval, release asset approval, default resolver approval, default Go approval, fallback deletion approval, signing approval, cosign proof, SLSA proof, or second-platform support.',
  'The normal-user native helper availability claim remains 0% until real package-manager native delivery, install source ownership, package/release ownership, default resolver/default-disable ownership, rollback policy, signing/security ownership, platform policy, and user-facing availability approval are complete.',
]

const REQUIRED_SLICES = [
  'Slice 1 — contract doc/guard.',
  'Slice 2 — distribution option matrix plus owner responsibilities.',
  'Slice 3 — non-applied package metadata/layout fixtures.',
  'Slice 4 — future install layout resolver contract.',
  'Slice 5 — rollback/default-disable ownership and fallback-deletion preconditions.',
  'Slice 6 — security/signing ownership placeholder policy.',
  'Slice 7 — final checkpoint/tag policy.',
  'Blocked future slices must not be implemented early.',
]

const REQUIRED_TAG_POLICY = [
  '## Tag Policy',
  'v0.6.31, v0.6.32, and v0.6.33 tags remain gated unless exact hosted evidence or an explicit leader/user waiver is supplied.',
  'v0.6.34 may become a `main` commit after validation and review.',
  'A v0.6.34 tag should wait for prior gates or an explicit leader/user waiver.',
  'No worker should create, push, or move tags for v0.6.34.',
  'No worker should run `npm version`, `npm publish`, `git tag`, `git push`, `gh`, token-based commands, hosted workflow trigger/query, or network validation for v0.6.34 Slice 1.',
]

const REQUIRED_GUARD = [
  'tests/suites/go-kernel-v0634-ownership-install-layout-contract-docs.cjs',
  'distance-to-goal after v0.6.33',
  'references to `docs/agentteam方案书.md` and `docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md`',
  'Route A–F evaluation',
  'selected Route A',
  'constrained support routes',
  'STOP gates',
  'no-availability wording',
  'planned slices',
  'tag policy',
  'package/runtime/workflow invariants remain unchanged at a basic level',
  '`go-packaged-preview` remains explicit-only',
  'review workflow remains one `linux-x64-glibc` row',
]

const FORBIDDEN_DOC_CLAIMS = [
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'normal-user availability is proven',
  'native availability proof is complete',
  'package-manager native delivery is complete',
  'real package-manager native delivery is complete',
  'package/release approval is granted',
  'package release is approved',
  'release asset is approved',
  'release evidence is complete',
  'install source is approved',
  'install source approval is granted',
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'signing is approved',
  'signing proof is complete',
  'cosign is approved',
  'cosign proof is complete',
  'SLSA is approved',
  'SLSA proof is complete',
  'second platform is supported',
  'second platform support is approved',
  'macOS is supported availability',
  'Windows is supported availability',
  'arm64 is supported availability',
  'musl is supported availability',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel))
}

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'data') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_BACKGROUND) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_DISTANCE) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROUTES) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_SELECTED) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_STOP) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_NO_AVAILABILITY) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_SLICES) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_TAG_POLICY) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_GUARD) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_DOC_CLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(doc), false, `${DOC} must not embed raw hosted/artifact/verifier JSON bodies`)
}

function assertReferencedDocs(root) {
  assert.equal(exists(root, ROADMAP_DOC), true, `${ROADMAP_DOC} should exist`)
  assert.equal(exists(root, V0633_CHECKPOINT), true, `${V0633_CHECKPOINT} should exist`)
  const roadmap = read(root, ROADMAP_DOC)
  const checkpoint = read(root, V0633_CHECKPOINT)
  assertIncludes(roadmap, '`package.json` 当前声明版本为 `0.6.8`', ROADMAP_DOC)
  assertIncludes(roadmap, 'Go kernel 一旦通过某个模块的 cutover gate', ROADMAP_DOC)
  assertIncludes(roadmap, 'STOP gates：no TS fallback deletion until normal-user availability signoff', ROADMAP_DOC)
  assertIncludes(checkpoint, 'The prerequisite evidence chain moved from approximately 35% to approximately 45–50%.', V0633_CHECKPOINT)
  assertIncludes(checkpoint, 'The normal-user native helper availability claim remains 0%.', V0633_CHECKPOINT)
}

function assertGitignore(root) {
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
}

function assertPackageInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'], 'package remains TS/pi facade')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|hosted-observation|record|\.exe|\.dll|\.so|\.dylib|\.tgz|kernel\/go)/i.test(item)), false, 'package files must not include native/helper/generated artifacts')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define lifecycle script ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not publish/version package`)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild|postinstall|preinstall|install-time build/i.test(command), false, `${name} must not build/download/install native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }
}

function assertRuntimeInvariants(root) {
  const kernel = read(root, 'core/kernel.ts')
  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  const runtimeSources = `${kernel}\n${resolver}`
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel explicit preview gate')
  assertIncludes(kernel, "const packagedResolverFailure = packagedPreviewRequested && !explicitHelperPath", 'kernel preview resolver gate')
  assertIncludes(kernel, 'const packagedManifestRequested = packagedPreviewRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure', 'kernel manifest resolver gate')
  assertIncludes(kernel, "const cutoverRequested = requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel cutover modes')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'kernel fingerprint TS fallback')
  assert.equal(/package\.json|node_modules|import\.meta\.url|__dirname|process\.cwd\(\)/i.test(kernel), false, 'kernel must not discover installed package layout by default')
  assert.equal(/download-artifact|hosted-observation|workflow-run|github\.run_id|github\.run_attempt|github\.sha|workflow_dispatch|actions\/download-artifact/i.test(runtimeSources), false, 'runtime/resolver must not consume hosted workflow/artifact metadata')
  assert.equal(/npm\s+(?:publish|version|pack)|gh\s+release|cosign|slsa|postinstall|preinstall|install-time build|curl\b|wget\b|node-gyp|prebuild/i.test(runtimeSources), false, 'runtime/resolver must not contain release/npm/download/install behavior')
  assert.equal(/default Go is enabled|default resolver is enabled|normal-user native availability|package-manager native delivery|release asset is approved|fallback deletion is approved/i.test(runtimeSources), false, 'runtime/resolver must not claim package/default/release availability')
}

function assertWorkflowInvariants(root) {
  assertWorkflowContract(root)
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only review artifact workflow should exist')
  const source = readWorkflow(root)
  assertIncludes(source, `target: ${REQUIRED_MATRIX_TARGET}`, APPROVED_REVIEW_WORKFLOW)
  assertIncludes(source, VERIFIER_COMMAND_BASE, APPROVED_REVIEW_WORKFLOW)
  assert.equal(/target:\s*(?!linux-x64-glibc\b)[a-z0-9-]+/i.test(source), false, 'workflow must not add second platform target')
  assert.equal(/gh\s+release|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|cosign|slsa|id-token|packages:\s*write|contents:\s*write|curl\b|wget\b|postinstall|preinstall|node-gyp|prebuild/i.test(source), false, 'workflow must not add release/signing/npm/install behavior')
}

function assertNoCheckedInArtifacts(root) {
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain temp npm tarballs')
  const generatedNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|review-artifact-index|artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|workflow-summary|verifier-output|hosted-observation-record|workflow-run|raw-payload|api-payload)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|md)$/i
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
  name: 'Go kernel v0.6.34 ownership/install-layout contract docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertReferencedDocs(root)
    assertGitignore(root)
    assertPackageInvariants(root)
    assertRuntimeInvariants(root)
    assertWorkflowInvariants(root)
    assertNoCheckedInArtifacts(root)
  },
}
