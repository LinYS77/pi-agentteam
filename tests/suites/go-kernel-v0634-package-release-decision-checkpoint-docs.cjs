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
const CHECKPOINT = 'docs/perf/v0.6.34-package-release-install-layout-decision-checkpoint.md'
const PACKAGE_VERSION = '0.6.8'
const EXPECTED_TOOLS = [
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
]

const REQUIRED_SUMMARY = [
  '# v0.6.34 Package/Release Ownership & Install Layout Decision Checkpoint',
  'v0.6.34 theme: Package/Release Ownership & Install Layout Decision Checkpoint.',
  'Main Route A completed with constrained support:',
  'Route A completed package/release ownership plus install-layout decision docs/tests/fixtures.',
  'Constrained Route B support completed as non-applied package metadata/layout proposal fixtures only.',
  'Route C second platform matrix remains deferred.',
  'Constrained Route D support completed as future install-layout resolver contract and rollback/default-disable policy docs/tests only.',
  'Constrained Route E support completed as security/signing placeholder policy docs/tests only.',
  'Constrained Route F support completed as tag/backlog policy text only, with no hosted workflow query, trigger, fetch, raw hosted record, `gh`, token, or network action.',
  'Slice 1 — contract:',
  'Slice 2 — distribution matrix:',
  'Slice 3 — non-applied fixtures:',
  'Slice 4 — future install layout contract:',
  'Slice 5 — rollback/default-disable policy:',
  'Slice 6 — security/signing placeholder policy:',
  'Slice 7 adds this checkpoint and `tests/suites/go-kernel-v0634-package-release-decision-checkpoint-docs.cjs` only.',
  'It does not change production runtime, package metadata, default resolver, default Go, `go-cutover`, `go-packaged-preview`, readiness, workflow, package release, release asset, signing, tags, or publishing behavior.',
]

const REQUIRED_DISTANCE = [
  '## Distance After v0.6.34',
  'If accepted, the prerequisite evidence chain moves from approximately 45–50% after v0.6.33 to approximately 55–60% after v0.6.34.',
  'The normal-user native helper availability claim remains 0%.',
  'Default Go remains blocked.',
  'TypeScript fallback deletion remains blocked.',
  'Only prerequisite shaping advanced:',
  'package/release ownership vocabulary is clearer, but package/release ownership still needs explicit assignment and approval.',
  'install-layout choices are compared, but install source approval remains absent.',
  'package proposal fixtures exist, but no package metadata is applied.',
  'a future resolver contract exists, but no default resolver or package discovery is implemented.',
  'rollback/default-disable preconditions are documented, but no runtime default-disable implementation exists.',
  'security/signing boundaries are documented, but no real signing, cosign, SLSA, security attestation, key owner, or signed availability claim exists.',
]

const REQUIRED_EVIDENCE = [
  '## Evidence',
  '### Distribution Ownership Decision Matrix',
  'Main package inclusion remains deferred and decision-only.',
  'npm companion native package(s) remain proposed and decision-only.',
  'GitHub release asset(s) remain deferred and decision-only.',
  'generated artifact package/bundle remains proposed and decision-only.',
  'source-only/no-native continuation remains a decision-only fallback option.',
  'The preferred future candidate for more design remains npm companion native package(s) plus generated artifact package/bundle inputs, but that preference is not implementation approval.',
  '### Non-Applied Fixtures',
  '`main-package-inclusion-proposal`.',
  '`companion-native-package-proposal`.',
  '`github-release-asset-proposal`.',
  '`generated-artifact-bundle-proposal`.',
  '`source-only-no-native-continuation-proposal`.',
  'All fixtures remain proposal-only, non-applied, test-only, non-approved, and future-approval-gated.',
  'Production sources must not import or read them.',
  '### Future Install Layout Resolver Contract',
  'native helper layout under `native/tmuxSnapshotParse/<helper-version>/<target>/...`.',
  'current review-only target row `linux-x64-glibc`.',
  'current module `tmuxSnapshotParse`, helper version `0.3.0-read-model-shadow`, protocol version `1`, and required capabilities `health`, `profile`, `tmuxSnapshotParse`, `tmuxSnapshotCapture`, and `compactReadModelFingerprint`.',
  'future precedence remains explicit helper path, then explicit `go-packaged-preview` package-root/manifest injection, then a future package resolver only after separate approval.',
  'This is not production resolver implementation, not package-manager delivery proof, not default resolver approval, and not default Go approval.',
  '### Rollback / Default-Disable and Fallback-Deletion Preconditions',
  'rollback after cutover must be release/tag/package/deprecation/default-disable policy, not hidden long-term TypeScript fallback.',
  'hidden runtime TypeScript fallback rollback remains unapproved.',
  'explicit `go-packaged-preview` and `go-cutover` failures remain fail-closed.',
  'default-disable implementation is future work.',
  '`compactReadModelFingerprint` remains TypeScript fallback / non-cutover unless separately approved.',
  '### Security / Signing Placeholder Policy',
  'ownership categories cover security owner, release owner, artifact/verifier owner, package/install source owner, platform owner, incident response owner, and key/credential owner.',
  'future evidence categories cover checksum, provenance, source revision, build context, license metadata, attestation placeholder vs real attestation distinction, retention, artifact/package naming, verifier behavior, supported-platform commitments, key/signature/cosign/SLSA decision if later approved, and revocation/rotation/incident response.',
  'existing attestation/signing fields are placeholder/non-real unless a later approved slice provides proof.',
  'current artifacts and checkpoint docs are review-only and not signed availability.',
  'no security claim can justify default Go, default resolver, package delivery, release asset, fallback deletion, or normal-user availability.',
  '### Package / Runtime / Workflow / Readiness Boundaries Unchanged',
  '`package.json` remains version `0.6.8`.',
  '`go-packaged-preview` remains explicit-only.',
  'current `go-cutover` semantics remain unchanged.',
  '`compactReadModelFingerprint` remains TypeScript fallback / non-cutover.',
  'the review workflow remains review-only with `permissions: contents: read` and a single `linux-x64-glibc` row.',
  '`/team readiness`, UI, tools, runtime diagnostics, command/model-callable surface, and broad Go authority are not expanded.',
]

const REQUIRED_GO_STOP = [
  '## GO / STOP Decision',
  'GO for a GitHub-only/main docs/tests/non-applied-fixture decision checkpoint after validation and leader review.',
  'GO scope:',
  'package/release ownership and install-layout decision contract.',
  'distribution ownership decision matrix.',
  'non-applied package layout fixtures.',
  'future install-layout resolver contract.',
  'rollback/default-disable and fallback-deletion precondition policy.',
  'security/signing placeholder policy.',
  'final checkpoint docs/tests.',
  'STOP for:',
  '`npm version`, `npm publish`, package release, or package source approval.',
  'changing `package.json` version away from `0.6.8`.',
  'package metadata, package files native entries, `optionalDependencies`, native dependencies, lifecycle hooks, `postinstall`, download, or install-time build.',
  '`package-lock.json`, `npm-shrinkwrap.json`, `go.mod`, or `go.sum`.',
  'checked-in artifacts, native binaries, tarballs, release assets, signatures, attestations, raw hosted records, raw API payloads, downloaded bundles, generated manifests, checksums, provenance, or verifier output.',
  'default Go, default resolver, production package discovery, or package-manager native delivery.',
  'current `go-cutover` semantic changes.',
  '`go-packaged-preview` semantic changes or default behavior.',
  'TypeScript fallback deletion, hidden fallback rollback, or `compactReadModelFingerprint` cutover.',
  '`/team readiness` expansion, UI expansion, new tool/command/model-callable surface, or runtime diagnostic expansion.',
  'broad Go authority over tmux execution/capture, worker lifecycle, task/report/PlanRun governance, UI rendering, package/release control plane, full-text boundaries, state, mailbox, or report access.',
  'hosted workflow query/fetch/trigger, `gh`, token, or network.',
  'tag creation unless prior gates are satisfied or an explicit leader/user waiver is supplied.',
  'commit/tag/push by the implementer.',
]

const REQUIRED_VALIDATION = [
  '## Validation Matrix',
  'Slice 1: `tests/suites/go-kernel-v0634-ownership-install-layout-contract-docs.cjs`.',
  'Slice 2: `tests/suites/go-kernel-v0634-distribution-option-matrix-docs.cjs`.',
  'Slice 3: `tests/suites/go-kernel-v0634-non-applied-package-layout-fixtures.cjs`.',
  'Slice 4: `tests/suites/go-kernel-v0634-install-layout-contract.cjs`.',
  'Slice 5: `tests/suites/go-kernel-v0634-rollback-default-disable-policy-docs.cjs`.',
  'Slice 6: `tests/suites/go-kernel-v0634-security-signing-ownership-docs.cjs`.',
  'Slice 7: `tests/suites/go-kernel-v0634-package-release-decision-checkpoint-docs.cjs`.',
  '`node --check tests/suites/go-kernel-v0634-package-release-decision-checkpoint-docs.cjs`.',
  'direct checkpoint guard suite.',
  'direct Slice 1–6 v0.6.34 guard suites.',
  '`npm run typecheck`.',
  '`npm run -s check:boundaries`.',
  '`git diff --check`.',
  'repo/package scans for `pi-agentteam-*.tgz`, `package-lock.json`, `npm-shrinkwrap.json`, `go.mod`, and `go.sum`.',
  'native/security scans for checked-in native binaries, archives, tarballs, release assets, signatures, attestations, raw hosted records, raw API payloads, generated manifests, checksums, provenance, downloaded bundles, and verifier output.',
  '`node tests/run.cjs <suite>` ignores the suite-name argument and runs the full suite set instead of a focused suite.',
  'v0.6.33 regression/proof commands are not claimed in this v0.6.34 checkpoint unless they are explicitly run during final validation.',
]

const REQUIRED_TAG_POLICY = [
  '## Tag Policy',
  'v0.6.31, v0.6.32, and v0.6.33 tags remain gated unless exact hosted evidence or an explicit leader/user waiver is supplied.',
  'v0.6.34 can become a `main` commit after validation and review.',
  'v0.6.34 tag waits for prior gates or an explicit leader/user waiver.',
  'No worker should create, push, or move tags for v0.6.34.',
  'No worker should run `npm version`, `npm publish`, `git tag`, `git push`, `gh`, token-based commands, hosted workflow trigger/query/fetch, or network validation for this checkpoint.',
]

const REQUIRED_BLOCKERS = [
  '## Remaining Blockers / Next Decisions',
  'select the preferred distribution/install-source path.',
  'approve or reject companion package vs main package vs release asset vs source-only continuation.',
  'real package-manager native delivery.',
  'package/release owner assignment.',
  'platform matrix expansion beyond `linux-x64-glibc`.',
  'default resolver/default Go approval.',
  'rollback/default-disable implementation.',
  'TypeScript fallback deletion approval.',
  'signing/security/key ownership.',
  'hosted observation/tag backlog.',
]

const REQUIRED_MAIN_DOC = [
  '## Slice 7 — Final Checkpoint Status',
  '`docs/perf/v0.6.34-package-release-install-layout-decision-checkpoint.md`',
  '`tests/suites/go-kernel-v0634-package-release-decision-checkpoint-docs.cjs`',
  'The checkpoint summarizes Slice 1–6 evidence, validation matrix, GO/STOP decision, distance after v0.6.34, tag policy, remaining blockers, and unchanged package/runtime/default/readiness/workflow/release/signing boundaries.',
  'If accepted, v0.6.34 moves prerequisite evidence from approximately 45–50% to approximately 55–60%, while the normal-user native helper availability claim remains 0%.',
  'Slice 7 is checkpoint docs/tests only.',
]

const FORBIDDEN_DOC_CLAIMS = [
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'normal-user availability is proven',
  'native availability proof is complete',
  'package-manager native delivery complete',
  'package-manager native delivery is complete',
  'real package-manager native delivery is complete',
  'package/release approval is granted',
  'package release is approved',
  'package/release/install source approved',
  'release asset approved',
  'release asset is approved',
  'install source approved',
  'install source is approved',
  'signing approved',
  'signing is approved',
  'signing proof is complete',
  'cosign approved',
  'cosign is approved',
  'cosign proof is complete',
  'SLSA approved',
  'SLSA is approved',
  'SLSA proof is complete',
  'security attestation approved',
  'security attestation is approved',
  'default Go enabled',
  'default Go is enabled',
  'default Go approved',
  'default Go is approved',
  'default resolver enabled',
  'default resolver is enabled',
  'default resolver approved',
  'default resolver is approved',
  'fallback deletion approved',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'second platform support is approved',
  'second platform is supported',
  'macOS is supported availability',
  'Windows is supported availability',
  'arm64 is supported availability',
  'musl is supported availability',
]

const ALLOWED_NEGATIVE_OR_PRECONDITION_PHRASES = [
  'No default Go approval.',
  'No default resolver approval.',
  'No TypeScript fallback deletion approval.',
  'No hidden fallback rollback approval.',
  'No `compactReadModelFingerprint` cutover approval.',
  'No real signing approval.',
  'No cosign approval.',
  'No SLSA approval.',
  'No security attestation approval.',
  'No signed availability claim.',
  'No release asset approval.',
  'No install source approval.',
  'Do not describe v0.6.34 as normal-user availability, package-manager native delivery, package/release approval, install source approval, release asset approval, default resolver approval, default Go approval, fallback deletion approval, signing approval, cosign proof, SLSA proof, or second-platform support.',
  'normal-user native availability proven.',
  'package/release/install ownership approved.',
  'package-manager native delivery approved/proven.',
  'default resolver/default Go approved and observed.',
  'unsupported-platform policy approved.',
  'diagnostics/no-leak proven.',
  'security/signing ownership approved.',
  'platform matrix/support policy approved.',
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

function stripAllowedBoundaryPhrases(source) {
  let stripped = source
  for (const phrase of ALLOWED_NEGATIVE_OR_PRECONDITION_PHRASES) stripped = stripped.split(phrase).join('')
  return stripped
}

function assertNoOverclaims(source, label) {
  const stripped = stripAllowedBoundaryPhrases(source)
  for (const forbidden of FORBIDDEN_DOC_CLAIMS) assert.equal(stripped.includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
}

function assertCheckpointDoc(root) {
  assert.equal(exists(root, CHECKPOINT), true, `${CHECKPOINT} should exist`)
  const checkpoint = read(root, CHECKPOINT)
  for (const expected of REQUIRED_SUMMARY) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_DISTANCE) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_EVIDENCE) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_GO_STOP) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_VALIDATION) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_TAG_POLICY) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_BLOCKERS) assertIncludes(checkpoint, expected, CHECKPOINT)
  assertNoOverclaims(checkpoint, CHECKPOINT)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(checkpoint), false, `${CHECKPOINT} must not embed raw hosted/artifact/verifier JSON bodies`)
}

function assertMainDocAndGitignore(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_MAIN_DOC) assertIncludes(doc, expected, DOC)
  assertNoOverclaims(doc, DOC)

  const gitignore = read(root, '.gitignore')
  assertIncludes(gitignore, `!${DOC}`, '.gitignore')
  assertIncludes(gitignore, `!${CHECKPOINT}`, '.gitignore')
}

function assertPackageRepoInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'], 'package remains TS/pi facade')

  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|hosted-observation|record|\.exe|\.dll|\.so|\.dylib|\.tgz|kernel\/go)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include native/helper/generated artifacts')
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
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain temp npm tarballs')
}

function assertNoCheckedInArtifacts(root) {
  const generatedNames = /(?:^|\/)(?:.*\.(?:sig|sigstore|pem|key|crt|cert|p7s|minisig)|.*(?:signature|signed|cosign|slsa|release-bundle|release-asset|attestation|attestations|agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|review-artifact-index|artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|package-artifact|workflow-summary|verifier-output|hosted-observation-record|workflow-run|raw-payload|api-payload)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|sigstore|bundle|intoto|md))$/i
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('tests/fixtures/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => !rel.startsWith('scripts/lib/go-helper-hosted-observation-record.cjs'))
    .filter(rel => !rel.startsWith('scripts/verify-go-helper-hosted-observation-record.cjs'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in artifacts/native binaries/tarballs/signatures/attestations/raw records')
}

function assertRuntimeInvariants(root) {
  const kernel = read(root, 'core/kernel.ts')
  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  const runtimeSources = `${kernel}\n${resolver}`
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel explicit preview gate')
  assertIncludes(kernel, "const packagedResolverFailure = packagedResolverRequested && !explicitHelperPath", 'kernel preview/default resolver gate')
  assertIncludes(kernel, 'const packagedManifestRequested = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath', 'kernel manifest resolver gate')
  assertIncludes(kernel, 'const helperPath = explicitHelperPath || packagedHelperPath || packagedManifestHelperPath', 'kernel helper precedence')
  assertIncludes(kernel, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel cutover modes')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'kernel fingerprint TS fallback')
  assertIncludes(kernel, 'defaultAgentTeamKernelEmbeddedHelperRoot()', 'kernel embedded helper root')
  assertIncludes(kernel, 'defaultAgentTeamKernelEmbeddedHelperManifestPath()', 'kernel embedded helper manifest')
  assert.equal(/package\.json|node_modules|__dirname|process\.cwd\(\)/i.test(kernel), false, 'kernel must not discover unapproved installed package layout by default')
  assert.equal(/download-artifact|hosted-observation|workflow-run|github\.run_id|github\.run_attempt|github\.sha|workflow_dispatch|actions\/download-artifact|cosign|slsa|signature|signed availability/i.test(runtimeSources), false, 'runtime/resolver must not consume hosted/signing metadata')
  assert.equal(/npm\s+(?:publish|version|pack)|gh\s+release|postinstall|preinstall|install-time build|curl\b|wget\b|node-gyp|prebuild/i.test(runtimeSources), false, 'runtime/resolver must not contain release/npm/download/install behavior')
}

function assertWorkflowInvariants(root) {
  assertWorkflowContract(root)
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only review artifact workflow should exist')
  const source = readWorkflow(root)
  assertIncludes(source, 'permissions:\n  contents: read', APPROVED_REVIEW_WORKFLOW)
  assertIncludes(source, `target: ${REQUIRED_MATRIX_TARGET}`, APPROVED_REVIEW_WORKFLOW)
  assertIncludes(source, VERIFIER_COMMAND_BASE, APPROVED_REVIEW_WORKFLOW)
  assert.equal(/id-token:\s*write|packages:\s*write|contents:\s*write|attestations:\s*write/i.test(source), false, 'workflow must not add write/signing permissions')
  assert.equal(/target:\s*(?!linux-x64-glibc\b)[a-z0-9-]+/i.test(source), false, 'workflow must not add second platform target')
  assert.equal(/gh\s+(?:attestation|release)|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|cosign|slsa|curl\b|wget\b|postinstall|preinstall|node-gyp|prebuild/i.test(source), false, 'workflow must not add release/signing/npm/install behavior')
}

function assertReadinessToolControlPlaneInvariants(root, env) {
  const readiness = read(root, 'commands/readiness.ts')
  const teamCommand = read(root, 'commands/team.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'readiness text')
  assert.equal(/go-packaged-preview|package-manager|native availability|release asset|install source|signing|cosign|SLSA|default Go|default resolver|signed availability/i.test(readiness.replace('not normal-user native availability proof', '')), false, 'readiness must not expand into package/native/security availability UI')
  assertIncludes(teamCommand, "const options = ['config init', 'config show', 'config validate', 'config migrate --dry-run', 'readiness']", 'team command completions')
  assert.equal(/native availability|go-packaged-preview|release|publish|signing|cosign|SLSA|install source|default Go|default resolver/i.test(teamCommand), false, '/team command must not expose native availability/release/security/default controls')

  const toolSources = walkFiles(path.join(root, 'tools'))
    .filter(file => file.endsWith('.ts'))
    .map(file => read(root, toRel(root, file)))
    .join('\n')
  for (const name of EXPECTED_TOOLS) assertIncludes(toolSources, `name: '${name}'`, 'tool registrations')
  assert.equal(/\bgo-packaged-preview\b|native availability|release asset|npm publish|package artifact|\bsigning\b|\bcosign\b|\bSLSA\b|artifact download|install source|default Go|default resolver|signed availability/i.test(toolSources), false, 'tools must not add native/release/signing/package/default control plane')

  if (env.pi?.__tools) assert.deepEqual([...env.pi.__tools.keys()].sort(), EXPECTED_TOOLS.slice().sort(), 'registered tool surface must not expand')
  if (env.pi?.__commands) assert.deepEqual([...env.pi.__commands.keys()].sort(), ['team'], 'registered command surface must not expand')

  const goBoundarySources = ['core/kernel.ts', 'core/kernelPackagedResolver.ts', 'kernel/go/agentteam-kernel/main.go']
    .filter(rel => exists(root, rel))
    .map(rel => read(root, rel))
    .join('\n')
    .replace(/exec\.CommandContext\(ctx, "tmux", "new-window", "-t", sessionName, "-n", windowName\)/g, '')
    .replace(/exec\.CommandContext\(ctx, "tmux", "kill-pane", "-t", paneID\)/g, '')
  assert.equal(/capturePane|capture-pane|tmux\s+capture|send-keys|new-window|kill-pane|agentteam_task|agentteam_receive|report_done|report_blocked|mailbox|full-text reader|full text reader|stateFilesWritten:\s*true|fullTextIncluded:\s*true|taskReportPlanRunConnected:\s*true|panelConnected:\s*true|tmuxConnected:\s*true|repository write|npm publish|package release|renderPanel|openTeamPanel/i.test(goBoundarySources), false, 'Go/kernel boundary must not expand to tmux/control-plane/UI/full-text/package authority beyond exact killPane')
}

module.exports = {
  name: 'Go kernel v0.6.34 package/release decision checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertCheckpointDoc(root)
    assertMainDocAndGitignore(root)
    assertPackageRepoInvariants(root)
    assertNoCheckedInArtifacts(root)
    assertRuntimeInvariants(root)
    assertWorkflowInvariants(root)
    assertReadinessToolControlPlaneInvariants(root, env)
  },
}
