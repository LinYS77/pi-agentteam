const assert = require('node:assert/strict')
const path = require('node:path')
const {
  assertIncludes,
  existsRel,
  readJsonRel,
  readRel,
  toRel,
  walkFiles,
} = require('./fsAssertions.cjs')
const {
  APPROVED_EMBEDDED_NATIVE_FILES,
  assertConsolidatedPackageReleaseGovernance,
  assertPackageFilesDoNotBroaden,
  assertPackageManifestGovernance,
  assertReviewWorkflowRemainsReviewOnly,
} = require('./packageReleaseGovernanceGuards.cjs')
const {
  APPROVED_NATIVE_ROOT,
  assertNoRawOrReleaseArtifacts,
} = require('./nativeGuards.cjs')
const {
  APPROVED_REVIEW_WORKFLOW,
  REQUIRED_MATRIX_TARGET,
  VERIFIER_COMMAND_BASE,
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
} = require('./reviewArtifactWorkflowGuard.cjs')
const {
  BLOCKED,
  DEFAULT_GO_BLOCKER_IDS,
  defaultGoReadinessLedger,
} = require('../fixtures/kernel/v0636/defaultGoReadinessLedger.cjs')
const {
  readinessEvidenceEntries,
  readinessEvidenceRegistry,
} = require('../fixtures/kernel/v0636/readinessEvidenceRegistry.cjs')
const {
  CURRENTLY_BLOCKED,
  FUTURE_REQUIRED,
  NON_APPLIED,
  NOT_IMPLEMENTED,
  ROLLBACK_DISABLE_POLICY_CASE_IDS,
  rollbackDisablePolicy,
  rollbackDisablePolicyCases,
} = require('../fixtures/kernel/v0636/rollbackDisablePolicyCases.cjs')
const {
  GATED,
  TAG_GATE_VERSIONS,
  UNRESOLVED,
  tagGateEntries,
  tagGateLedger,
} = require('../fixtures/kernel/v0636/tagGateLedger.cjs')
const {
  BLOCKED: P0_BLOCKED,
  STOP_GATES,
  p0ReadinessLedger,
} = require('../fixtures/kernel/v0637/p0ReadinessLedger.cjs')
const {
  CHECKPOINT_STATUS,
  PACKAGE_RUNTIME_INVARIANTS,
  finalReleaseReadinessCheckpoint,
} = require('../fixtures/kernel/v0637/finalReleaseReadinessCheckpoint.cjs')

const PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_HELPER = 'tests/helpers/packageReleaseSecurityRollbackGuards.cjs'
const PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_SUITE = 'tests/suites/go-kernel-package-release-security-rollback-guard.cjs'

const STORAGE_POLICY_DOC = 'docs/perf/v0.4.26-go-helper-artifact-pipeline.md'
const PACKAGE_RELEASE_DECISION_DOC = 'docs/perf/v0.6.34-package-release-install-layout-decision.md'
const PACKAGE_RELEASE_DECISION_CHECKPOINT = 'docs/perf/v0.6.34-package-release-install-layout-decision-checkpoint.md'

const PACKAGE_RELEASE_SECURITY_ROLLBACK_CATEGORIES = Object.freeze([
  'storage-release-policy-non-applied',
  'review-workflow-release-control-plane-absent',
  'rollback-default-disable-policy-fixture-blocked',
  'security-signing-ownership-placeholder-only',
  'tag-hosted-release-actions-gated',
  'package-runtime-tool-surface-non-expansion',
  'checked-in-artifact-surface-clean',
])

const PACKAGE_RELEASE_SECURITY_ROLLBACK_CATEGORY_DESCRIPTIONS = Object.freeze({
  'storage-release-policy-non-applied': 'The v0.4.26 storage/release policy remains local/test or review-only governance; release assets, npm companion packages, main package inclusion, and postinstall/download/install-time builds remain stopped unless separately approved.',
  'review-workflow-release-control-plane-absent': 'The single Go helper workflow remains a short-retention review-artifact workflow with contents:read and no tag/release/npm/package/signing/hosted release control-plane behavior.',
  'rollback-default-disable-policy-fixture-blocked': 'Rollback/default-disable evidence is represented by current fixtures that stay non-applied, future-required, currently blocked, not implemented, and not approvable by repo state alone.',
  'security-signing-ownership-placeholder-only': 'Security/signing ownership remains placeholder-only: no real signing, cosign, SLSA, attestation approval, release asset, install source, or signed availability claim is introduced.',
  'tag-hosted-release-actions-gated': 'Release/tag/backlog governance fixtures remain gated/unresolved and record no gh, hosted workflow query/fetch/trigger, raw hosted record, tag, push, npm, release, or waiver action.',
  'package-runtime-tool-surface-non-expansion': 'Package metadata, runtime/kernel resolver, /team readiness, public commands/tools, and Go helper authority do not expose package/release/default-Go/signing/native control-plane operations.',
  'checked-in-artifact-surface-clean': 'The repo contains no unapproved generated manifests, tarballs, release assets, signatures, raw hosted records, package-manager files, or release bundles outside approved embedded helper files/docs/tests fixtures.',
})

const PACKAGE_RELEASE_SECURITY_ROLLBACK_SOURCE_FILES = Object.freeze([
  'package.json',
  '.gitignore',
  '.github/workflows/go-helper-review-artifact.yml',
  'api/commands.ts',
  'api/tools.ts',
  'commands/readiness.ts',
  'commands/team.ts',
  'core/kernel.ts',
  'core/kernelPackagedResolver.ts',
  'core/kernelDiagnostics.ts',
  'kernel/go/agentteam-kernel/main.go',
  'tools/message.ts',
  'tools/messageReceive.ts',
  'tools/planRun.ts',
  'tools/task.ts',
  'tools/team.ts',
  'workerTurnPrompt.ts',
])

const PACKAGE_RELEASE_SECURITY_ROLLBACK_SUPPORTING_DOCS = Object.freeze([
  STORAGE_POLICY_DOC,
  PACKAGE_RELEASE_DECISION_DOC,
  PACKAGE_RELEASE_DECISION_CHECKPOINT,
])

const PACKAGE_RELEASE_SECURITY_ROLLBACK_SUPPORTING_FIXTURES = Object.freeze([
  'tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs',
  'tests/fixtures/kernel/v0636/readinessEvidenceRegistry.cjs',
  'tests/fixtures/kernel/v0636/rollbackDisablePolicyCases.cjs',
  'tests/fixtures/kernel/v0636/tagGateLedger.cjs',
  'tests/fixtures/kernel/v0637/p0ReadinessLedger.cjs',
  'tests/fixtures/kernel/v0637/finalReleaseReadinessCheckpoint.cjs',
  ...APPROVED_EMBEDDED_NATIVE_FILES,
])

const STORAGE_POLICY_REQUIRED = Object.freeze([
  'Slice 6 — Storage, Release, and Rollback Policy',
  'Storage decision matrix',
  'Future GitHub Actions artifact retention/access expectations',
  'Rollback/deprecation/default-disable scenarios',
  'Version-skew policy',
  'Slice 6 preserves Slice 1-5 boundaries',
  'OS temp/local outputs for tests',
  'ignored local prototype directory',
  'CI workflow workspace outputs',
  'GitHub Actions artifacts for prototype review',
  'GitHub release assets',
  'npm companion packages',
  'main package inclusion',
  'postinstall/download/install-time build',
  'review-only, limited retention, not release asset, not install source, not normal-user availability proof',
  'STOP until explicit release-policy approval',
  'STOP until package-owner approval',
  'no postinstall/download/install-time build remains binding',
  'rollback is corrected release/tag/package/deprecation/default-disable policy',
  'no hidden TS fallback as rollback after cutover',
  'STOP for default Go',
  'STOP for TypeScript fallback deletion',
  'STOP for broadening Go authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
])

const STORAGE_POLICY_FORBIDDEN_CLAIMS = Object.freeze([
  'artifact storage is active',
  'GitHub Actions artifacts are active',
  'GitHub release assets are approved',
  'release assets are approved',
  'normal-user availability is proven',
  'normal-user native availability is proven',
  'native/default cutover is approved',
  'fallback deletion is approved',
  'native packaging is approved',
  'npm publish is approved',
  'npm version is approved',
  'Go is default',
  'native Go pi extension is assumed',
  'broader Go authority is approved',
  'main package inclusion is approved',
  'postinstall download is allowed',
  'install-time build is allowed',
])

const DECISION_DOC_REQUIRED = Object.freeze([
  'Package/release owner',
  'Install source owner',
  'Artifact/verifier owner',
  'Runtime/default resolver owner',
  'Rollback/default-disable owner',
  'Security owner',
  'Platform owner',
  'User-facing communication owner',
  'Default-disable implementation is future work, not v0.6.34.',
  'Rollback after cutover must be a release/tag/package/deprecation/default-disable policy, not hidden long-term TypeScript fallback.',
  'Hidden runtime TypeScript fallback rollback remains unapproved.',
  '`compactReadModelFingerprint` is not included; it remains TypeScript fallback / non-cutover unless separately approved.',
  'Existing attestation/signing fields are placeholder/non-real unless a later approved slice provides proof.',
  'v0.6.34 does not approve signing, cosign, SLSA, or security attestation.',
  'No security claim can be used to justify default Go, default resolver, package delivery, release asset, fallback deletion, or normal-user availability.',
  'No workflow permission expansion such as `id-token: write`, `packages: write`, or `contents: write`.',
])

const CHECKPOINT_REQUIRED = Object.freeze([
  'Route A completed package/release ownership plus install-layout decision docs/tests/fixtures.',
  'Constrained Route D support completed as future install-layout resolver contract and rollback/default-disable policy docs/tests only.',
  'Constrained Route E support completed as security/signing placeholder policy docs/tests only.',
  'Constrained Route F support completed as tag/backlog policy text only, with no hosted workflow query, trigger, fetch, raw hosted record, `gh`, token, or network action.',
  'It does not change production runtime, package metadata, default resolver, default Go, `go-cutover`, `go-packaged-preview`, readiness, workflow, package release, release asset, signing, tags, or publishing behavior.',
  'The normal-user native helper availability claim remains 0%.',
  'Default Go remains blocked.',
  'TypeScript fallback deletion remains blocked.',
  '`/team readiness`, UI, tools, runtime diagnostics, command/model-callable surface, and broad Go authority are not expanded.',
  'No worker should run `npm version`, `npm publish`, `git tag`, `git push`, `gh`, token-based commands, hosted workflow trigger/query/fetch, or network validation for this checkpoint.',
])

const RELEASE_ARTIFACT_FILE_RE = /(?:^|\/)(?:.*\.(?:sig|sigstore|pem|key|crt|cert|p7s|minisig)|.*(?:signature|signed|cosign|slsa|release-bundle|release-asset|attestation|attestations|agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|review-artifact-index|artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|package-artifact|workflow-summary|verifier-output|hosted-observation-record|workflow-run|raw-payload|api-payload)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|sigstore|bundle|intoto|md))$/i
const FORBIDDEN_TOOL_CONTROL_RE = /\bgo-packaged-preview\b|native availability|release asset|npm publish|npm version|package artifact|\bsigning\b|\bcosign\b|\bSLSA\b|security attestation|artifact download|install source|default resolver|signed availability|release mechanics/i
const FORBIDDEN_RUNTIME_RELEASE_CONTROL_RE = /download-artifact|hosted-observation|workflow-run|github\.run_id|github\.run_attempt|github\.sha|workflow_dispatch|actions\/download-artifact|cosign|slsa|signature|signed availability|npm\s+(?:publish|version|pack)|gh\s+release|git\s+(?:tag|push)|postinstall|preinstall|install-time build|curl\b|wget\b|node-gyp|prebuild/i
const EXPECTED_TOOL_NAMES = Object.freeze([
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
])

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function assertSameSet(actual, expected, label) {
  assert.deepEqual(sorted(actual), sorted(expected), `${label} should match exactly`)
}

function assertEveryFileExists(root, files, label) {
  for (const rel of files) assert.equal(existsRel(root, rel), true, `${rel} should exist for ${label}`)
}

function assertFalseFields(record, fields, label) {
  for (const field of fields) assert.equal(record[field], false, `${label} ${field} should remain false`)
}

function assertPlainData(value, label) {
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value, `${label} should remain plain deterministic data`)
}

function stripAllowedPublicBoundaryPhrases(source) {
  return String(source)
    .replace(/Explicit reviewer readiness summary; not normal-user native availability proof\./g, '')
    .replace(/not normal-user native availability proof/g, '')
    .replace(/default-go-readiness-dry-run/g, '')
}

function readToolSources(root) {
  return walkFiles(path.join(root, 'tools'), {
    include: file => file.endsWith('.ts'),
  })
    .map(file => readRel(root, toRel(root, file)))
    .join('\n')
}

function assertStorageReleasePolicyNonApplied(root) {
  const doc = readRel(root, STORAGE_POLICY_DOC)
  for (const expected of STORAGE_POLICY_REQUIRED) assertIncludes(doc, expected, STORAGE_POLICY_DOC)
  for (const forbidden of STORAGE_POLICY_FORBIDDEN_CLAIMS) assert.equal(doc.includes(forbidden), false, `${STORAGE_POLICY_DOC} must not imply ${forbidden}`)
  assertReviewWorkflowRemainsReviewOnly(root)
  const packageJson = assertPackageManifestGovernance(root)
  assertPackageFilesDoNotBroaden(packageJson)
}

function assertReviewWorkflowReleaseControlPlaneAbsent(root) {
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only the approved review-artifact workflow should exist')
  assertWorkflowContract(root)
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
  const workflow = readWorkflow(root)
  for (const expected of [
    'name: Go Helper Review Artifact',
    'permissions:\n  contents: read',
    `target: ${REQUIRED_MATRIX_TARGET}`,
    'actions/upload-artifact@v4',
    'actions/download-artifact@v4',
    'retention-days: 7',
    VERIFIER_COMMAND_BASE,
  ]) assertIncludes(workflow, expected, APPROVED_REVIEW_WORKFLOW)
  for (const [label, pattern] of [
    ['write permissions', /(?:contents|packages|id-token|attestations):\s*write/i],
    ['GitHub release or attestation CLI', /\bgh\s+(?:release|attestation)\b/i],
    ['npm release mechanics', /\bnpm\s+(?:publish|version|pack)\b/i],
    ['git release mechanics', /\bgit\s+(?:tag|push|commit)\b/i],
    ['signing/SLSA mechanics', /\bcosign\b|\bslsa\b|sigstore/i],
    ['download/install hooks', /\bcurl\b|\bwget\b|postinstall|preinstall|node-gyp|prebuild/i],
    ['release action', /softprops\/action-gh-release|ncipollo\/release-action|actions\/upload-release-asset/i],
  ]) assert.equal(pattern.test(workflow), false, `review workflow must not include ${label}`)
}

function assertRollbackDefaultDisablePolicyFixtureBlocked(root) {
  assertPlainData(defaultGoReadinessLedger, 'default-Go readiness ledger')
  assert.equal(defaultGoReadinessLedger.ready, false)
  assert.equal(defaultGoReadinessLedger.defaultGo, false)
  assert.equal(defaultGoReadinessLedger.defaultResolver, false)
  assert.equal(defaultGoReadinessLedger.fallbackDeletion, false)
  assert.equal(defaultGoReadinessLedger.packageReleaseApproved, false)
  assert.equal(defaultGoReadinessLedger.signingApproved, false)
  assert.equal(defaultGoReadinessLedger.noSilentWaiver, true)
  assert.deepEqual(defaultGoReadinessLedger.blockers.map(blocker => blocker.id), [...DEFAULT_GO_BLOCKER_IDS])
  for (const blocker of defaultGoReadinessLedger.blockers) {
    assert.equal(blocker.status, BLOCKED, `${blocker.id} remains blocked`)
    assert.equal(blocker.requiredBeforeDefaultGo, true, `${blocker.id} required before default Go`)
    assert.equal(blocker.waivableByRepoStateAlone, false, `${blocker.id} not waivable by repo state alone`)
  }

  assertPlainData(rollbackDisablePolicy, 'rollback/default-disable policy')
  assert.equal(rollbackDisablePolicy.application, NON_APPLIED)
  assert.equal(rollbackDisablePolicy.gate, FUTURE_REQUIRED)
  assert.equal(rollbackDisablePolicy.currentState, CURRENTLY_BLOCKED)
  assert.equal(rollbackDisablePolicy.status, NOT_IMPLEMENTED)
  assert.equal(rollbackDisablePolicy.implemented, false)
  assert.equal(rollbackDisablePolicy.approved, false)
  assert.equal(rollbackDisablePolicy.repoStateAloneCanApprove, false)
  assert.equal(rollbackDisablePolicy.currentKernelSemanticsUnchanged, true)
  assert.deepEqual(rollbackDisablePolicyCases.map(item => item.id), [...ROLLBACK_DISABLE_POLICY_CASE_IDS])
  for (const requiredCase of [
    'future-kill-switch-overrides-default-go',
    'future-kill-switch-overrides-default-resolver',
    'explicit-go-cutover-fail-closed-diagnostics',
    'explicit-go-packaged-preview-fail-closed-diagnostics',
    'typescript-parser-fallback-retained',
    'compact-read-model-fingerprint-non-cutover',
    'future-package-deprecated-unpublished-fails-closed',
    'future-checksum-signing-mismatch-fails-closed',
    'explicit-leader-user-approval-required',
  ]) assert.ok(ROLLBACK_DISABLE_POLICY_CASE_IDS.includes(requiredCase), `rollback policy should include ${requiredCase}`)
  for (const item of rollbackDisablePolicyCases) {
    assert.equal(item.application, NON_APPLIED, `${item.id} non-applied`)
    assert.equal(item.gate, FUTURE_REQUIRED, `${item.id} future required`)
    assert.equal(item.currentState, CURRENTLY_BLOCKED, `${item.id} currently blocked`)
    assert.equal(item.status, NOT_IMPLEMENTED, `${item.id} not implemented`)
    assert.equal(item.implemented, false, `${item.id} not implemented flag`)
    assert.equal(item.approved, false, `${item.id} not approved`)
    assert.equal(item.repoStateAloneCanApprove, false, `${item.id} cannot be approved by repo state alone`)
    assert.ok(item.doesNotProve.includes('default Go approval or enablement'), `${item.id} denies default Go approval`)
    assert.ok(item.doesNotProve.includes('TypeScript fallback deletion approval'), `${item.id} denies fallback deletion approval`)
    assert.ok(item.doesNotProve.includes('signing/cosign/SLSA/security attestation approval'), `${item.id} denies signing approval`)
  }

  const kernel = readRel(root, 'core/kernel.ts')
  for (const expected of [
    "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'",
    "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested",
    'const startupFallback = cutoverRequested ? undefined',
    'if (cutoverRequested) {\n      recordCutoverUnavailable(toCutoverFailureKind(kind), detail)\n      return\n    }',
    'if (cutoverRequested || !fallback) return cutoverUnavailableSnapshot(capturedAt)',
    'if (cutoverRequested) return fallback(compactInput)',
    "resultMarker: 'stale'",
  ]) assertIncludes(kernel, expected, 'kernel rollback/default-disable boundary')
  assert.equal(/default-disable|defaultDisable|hidden fallback rollback|fallback deletion approved|compactReadModelFingerprint cutover/i.test(kernel), false, 'kernel must not add runtime default-disable/fallback-deletion/cutover policy behavior')
}

function assertSecuritySigningOwnershipPlaceholderOnly(root) {
  const decisionDoc = readRel(root, PACKAGE_RELEASE_DECISION_DOC)
  const checkpoint = readRel(root, PACKAGE_RELEASE_DECISION_CHECKPOINT)
  for (const expected of DECISION_DOC_REQUIRED) assertIncludes(decisionDoc, expected, PACKAGE_RELEASE_DECISION_DOC)
  for (const expected of CHECKPOINT_REQUIRED) assertIncludes(checkpoint, expected, PACKAGE_RELEASE_DECISION_CHECKPOINT)

  assert.equal(defaultGoReadinessLedger.signingApproved, false, 'default-Go ledger must not approve signing')
  assert.equal(readinessEvidenceRegistry.signingEvidence, false, 'evidence registry must not provide signing evidence')
  assert.equal(readinessEvidenceRegistry.releaseAssetEvidence, false, 'evidence registry must not provide release asset evidence')
  assert.equal(readinessEvidenceRegistry.installSourceEvidence, false, 'evidence registry must not provide install source evidence')
  for (const entry of readinessEvidenceEntries) {
    assert.equal(entry.signingEvidence, false, `${entry.id} signing evidence false`)
    assert.equal(entry.releaseAssetEvidence, false, `${entry.id} release asset evidence false`)
    assert.equal(entry.installSourceEvidence, false, `${entry.id} install source evidence false`)
    assert.ok(entry.doesNotProve.includes('signing/cosign/SLSA/security attestation approval'), `${entry.id} denies signing approval`)
  }

  const manifest = readJsonRel(root, `${APPROVED_NATIVE_ROOT}/manifest.json`)
  assert.equal(manifest.attestation.kind, 'placeholder-only', 'embedded helper attestation must remain placeholder-only')
  assert.equal(manifest.attestation.signed, false, 'embedded helper attestation must remain unsigned')
  assert.equal(manifest.packageVersion, '0.6.8', 'embedded helper manifest package version remains unchanged')

  const workflow = readWorkflow(root)
  assert.equal(/id-token:\s*write|packages:\s*write|contents:\s*write|attestations:\s*write/i.test(workflow), false, 'workflow must not add signing/package/write permissions')
  assert.equal(/cosign|slsa|gh\s+attestation|gh\s+release|npm\s+(?:publish|version)|git\s+(?:tag|push|commit)|curl\b|wget\b|postinstall|preinstall|node-gyp|prebuild/i.test(workflow), false, 'workflow must not add signing/release/npm/download/install behavior')
}

function assertTagHostedReleaseActionsGated() {
  assertPlainData(tagGateLedger, 'tag gate ledger')
  assertFalseFields(tagGateLedger, [
    'releaseWorkPerformed',
    'tagCreated',
    'pushPerformed',
    'hostedWorkflowQueried',
    'ghUsed',
    'npmPublish',
    'npmVersion',
    'rawHostedRecordsCheckedIn',
    'releaseAssetsCreated',
    'waiverInvented',
  ], 'tag gate ledger')
  assert.deepEqual(tagGateEntries.map(entry => entry.version), [...TAG_GATE_VERSIONS])
  for (const entry of tagGateEntries) {
    assert.equal(entry.status, GATED, `${entry.version} tag gate status`)
    assert.equal(entry.resolution, UNRESOLVED, `${entry.version} tag gate resolution`)
    assert.equal(entry.requiresLeaderDecision, true, `${entry.version} requires leader decision`)
    assert.equal(entry.releaseWorkPerformed, false, `${entry.version} release work`)
    assert.equal(entry.tagCreated, false, `${entry.version} tag created`)
    assert.equal(entry.tagPushed, false, `${entry.version} tag pushed`)
    assert.equal(entry.hostedWorkflowQueried, false, `${entry.version} hosted workflow queried`)
    assert.equal(entry.ghUsed, false, `${entry.version} gh used`)
    assert.equal(entry.rawHostedRecordsCheckedIn, false, `${entry.version} raw hosted records`)
    assert.equal(entry.waiverInvented, false, `${entry.version} no invented waiver`)
    assert.ok(entry.doesNotProve.includes('release created'), `${entry.version} denies release creation`)
    assert.ok(entry.doesNotProve.includes('npm publish completed'), `${entry.version} denies npm publish`)
    assert.ok(entry.doesNotProve.includes('signing/cosign/SLSA/security attestation approval'), `${entry.version} denies signing approval`)
  }
  const v0634 = tagGateEntries.find(entry => entry.version === 'v0.6.34')
  assert.ok(v0634, 'v0.6.34 tag gate entry should exist')
  assert.equal(v0634.requiresHostedEvidenceOrWaiver, true, 'v0.6.34 tag requires hosted evidence or waiver')
  assert.deepEqual(v0634.blockedBy, ['v0.6.31', 'v0.6.32', 'v0.6.33'])

  assert.equal(p0ReadinessLedger.ready, false, 'P0 ledger not release ready')
  assert.equal(p0ReadinessLedger.tagCreated, false, 'P0 ledger tag not created')
  assert.equal(p0ReadinessLedger.npmPublished, false, 'P0 ledger npm not published')
  assert.equal(p0ReadinessLedger.nativeWorkPerformed, false, 'P0 ledger native work not performed')
  assert.ok(STOP_GATES.some(item => item.includes('no tag creation')), 'P0 STOP gates should deny tag/release')
  assert.ok(STOP_GATES.some(item => item.includes('no npm version')), 'P0 STOP gates should deny npm release')
  assert.ok(STOP_GATES.some(item => item.includes('no native package')), 'P0 STOP gates should deny native/signing/platform')
  const releaseGovernanceRow = p0ReadinessLedger.rows.find(row => row.id === 'release-tag-default-go-native-governance')
  assert.ok(releaseGovernanceRow, 'P0 ledger should include release/tag/default-Go/native governance row')
  assert.equal(releaseGovernanceRow.status, P0_BLOCKED, 'release/tag/default-Go/native governance row remains blocked')

  assert.equal(finalReleaseReadinessCheckpoint.status, CHECKPOINT_STATUS)
  assert.equal(finalReleaseReadinessCheckpoint.ready, false)
  assert.equal(finalReleaseReadinessCheckpoint.releaseReadyClaim, false)
  assert.equal(finalReleaseReadinessCheckpoint.tagCreated, false)
  assert.equal(finalReleaseReadinessCheckpoint.npmPublished, false)
  assert.equal(finalReleaseReadinessCheckpoint.nativeWorkPerformed, false)
  assert.equal(finalReleaseReadinessCheckpoint.defaultGoApproved, false)
  assert.equal(finalReleaseReadinessCheckpoint.defaultResolverApproved, false)
  assert.equal(finalReleaseReadinessCheckpoint.fallbackDeletionApproved, false)
  assert.equal(finalReleaseReadinessCheckpoint.signingApproved, false)
  assert.equal(finalReleaseReadinessCheckpoint.secondPlatformApproved, false)
}

function assertPackageRuntimeToolSurfaceNonExpansion(root, env) {
  const packageJson = assertPackageManifestGovernance(root)
  assertPackageFilesDoNotBroaden(packageJson)

  const readiness = stripAllowedPublicBoundaryPhrases(readRel(root, 'commands/readiness.ts'))
  assert.equal(FORBIDDEN_TOOL_CONTROL_RE.test(readiness), false, 'readiness command must not expose package/release/signing/default-native controls')
  const teamCommand = readRel(root, 'commands/team.ts')
  assertIncludes(teamCommand, "const options = ['config init', 'config show', 'config validate', 'config migrate --dry-run', 'readiness']", 'team command completions')
  assert.equal(FORBIDDEN_TOOL_CONTROL_RE.test(teamCommand), false, '/team command must not expose package/release/signing/default-native controls')

  const toolSources = readToolSources(root)
  for (const name of EXPECTED_TOOL_NAMES) assertIncludes(toolSources, `name: '${name}'`, 'tool registration surface')
  assert.equal(FORBIDDEN_TOOL_CONTROL_RE.test(toolSources), false, 'model-callable tools must not expose package/release/signing/default-native controls')
  if (env?.pi?.__tools) assertSameSet([...env.pi.__tools.keys()], EXPECTED_TOOL_NAMES, 'registered tool surface')
  if (env?.pi?.__commands) assert.deepEqual([...env.pi.__commands.keys()].sort(), ['team'], 'registered command surface')

  const runtimeSources = [
    readRel(root, 'core/kernel.ts'),
    readRel(root, 'core/kernelPackagedResolver.ts'),
  ].join('\n')
  assert.equal(FORBIDDEN_RUNTIME_RELEASE_CONTROL_RE.test(runtimeSources), false, 'runtime/resolver must not contain package/release/signing/download/install control-plane behavior')

  const goSource = readRel(root, 'kernel/go/agentteam-kernel/main.go')
  assert.equal(/npm\s+(?:publish|version|pack)|gh\s+release|git\s+(?:tag|push)|cosign|slsa|release asset|package-manager native delivery|normal-user native availability|fallback deletion|agentteam_receive|report_done|report_blocked|renderPanel/i.test(goSource), false, 'Go helper must not own package/release/default/fallback/read-boundary control plane')

  assert.equal(PACKAGE_RUNTIME_INVARIANTS.packageVersion, '0.6.8')
  assert.deepEqual(PACKAGE_RUNTIME_INVARIANTS.piExtensions, ['./index.ts'])
  assert.deepEqual(PACKAGE_RUNTIME_INVARIANTS.stableToolSurface, [...EXPECTED_TOOL_NAMES])
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.packageMetadataChanged, false)
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.productionRuntimeChanged, false)
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.tagCreated, false)
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.npmPublished, false)
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.nativeWorkPerformed, false)
}

function assertCheckedInArtifactSurfaceClean(root) {
  assertNoRawOrReleaseArtifacts(root)
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum', '.agentteam-artifacts']) {
    assert.equal(existsRel(root, rel), false, `${rel} must not exist`)
  }
  assert.deepEqual(require('node:fs').readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain npm tarballs')
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => !rel.startsWith('tests/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => !rel.startsWith(`${APPROVED_NATIVE_ROOT}/`))
    .filter(rel => !rel.startsWith('scripts/lib/go-helper-hosted-observation-record.cjs'))
    .filter(rel => !rel.startsWith('scripts/verify-go-helper-hosted-observation-record.cjs'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || RELEASE_ARTIFACT_FILE_RE.test(rel))
  assert.deepEqual(forbidden.sort(), [], 'repo must not contain checked-in generated/hosted/native/release/signing artifacts outside approved fixtures/docs/tests')
}

function assertPackageReleaseSecurityRollbackGuard(root, env) {
  const checked = new Set()
  const mark = (category, assertion) => {
    assertion()
    checked.add(category)
  }

  assertEveryFileExists(root, [
    PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_HELPER,
    PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_SUITE,
    ...PACKAGE_RELEASE_SECURITY_ROLLBACK_SOURCE_FILES,
    ...PACKAGE_RELEASE_SECURITY_ROLLBACK_SUPPORTING_DOCS,
    ...PACKAGE_RELEASE_SECURITY_ROLLBACK_SUPPORTING_FIXTURES,
  ], 'package/release/security/rollback guard evidence')

  assertConsolidatedPackageReleaseGovernance(root)
  mark('storage-release-policy-non-applied', () => assertStorageReleasePolicyNonApplied(root))
  mark('review-workflow-release-control-plane-absent', () => assertReviewWorkflowReleaseControlPlaneAbsent(root))
  mark('rollback-default-disable-policy-fixture-blocked', () => assertRollbackDefaultDisablePolicyFixtureBlocked(root))
  mark('security-signing-ownership-placeholder-only', () => assertSecuritySigningOwnershipPlaceholderOnly(root))
  mark('tag-hosted-release-actions-gated', () => assertTagHostedReleaseActionsGated())
  mark('package-runtime-tool-surface-non-expansion', () => assertPackageRuntimeToolSurfaceNonExpansion(root, env))
  mark('checked-in-artifact-surface-clean', () => assertCheckedInArtifactSurfaceClean(root))

  const checkedCategories = sorted(checked)
  assert.deepEqual(checkedCategories, sorted(PACKAGE_RELEASE_SECURITY_ROLLBACK_CATEGORIES), 'package/release/security/rollback guard should execute every category')
  return { checkedCategories }
}

module.exports = {
  PACKAGE_RELEASE_SECURITY_ROLLBACK_CATEGORIES,
  PACKAGE_RELEASE_SECURITY_ROLLBACK_CATEGORY_DESCRIPTIONS,
  PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_HELPER,
  PACKAGE_RELEASE_SECURITY_ROLLBACK_GUARD_SUITE,
  PACKAGE_RELEASE_SECURITY_ROLLBACK_SOURCE_FILES,
  PACKAGE_RELEASE_SECURITY_ROLLBACK_SUPPORTING_DOCS,
  PACKAGE_RELEASE_SECURITY_ROLLBACK_SUPPORTING_FIXTURES,
  assertPackageReleaseSecurityRollbackGuard,
  assertPackageRuntimeToolSurfaceNonExpansion,
  assertReviewWorkflowReleaseControlPlaneAbsent,
  assertRollbackDefaultDisablePolicyFixtureBlocked,
  assertSecuritySigningOwnershipPlaceholderOnly,
  assertStorageReleasePolicyNonApplied,
  assertTagHostedReleaseActionsGated,
}
