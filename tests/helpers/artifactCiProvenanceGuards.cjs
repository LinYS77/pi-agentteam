const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  assertIncludes,
  existsRel,
  readRel,
  toRel,
  walkFiles,
} = require('./fsAssertions.cjs')
const {
  APPROVED_EMBEDDED_NATIVE_FILES,
} = require('./packageReleaseGovernanceGuards.cjs')
const {
  PACKAGE_VERSION,
  assertPackageNoReleaseGuards,
} = require('./packageGuards.cjs')
const {
  APPROVED_NATIVE_ROOT,
  assertNoRawOrReleaseArtifacts,
} = require('./nativeGuards.cjs')
const {
  APPROVED_REVIEW_WORKFLOW,
  APPROVED_REVIEW_WORKFLOW_PATH,
  REQUIRED_MATRIX_TARGET,
  STRICT_VERIFIER_EXPECTED_CONTEXT_LINES,
  VERIFIER_COMMAND_BASE,
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
} = require('./reviewArtifactWorkflowGuard.cjs')

const ARTIFACT_CI_PROVENANCE_GUARD_HELPER = 'tests/helpers/artifactCiProvenanceGuards.cjs'
const ARTIFACT_CI_PROVENANCE_GUARD_SUITE = 'tests/suites/go-kernel-artifact-ci-provenance-guard.cjs'

const ARTIFACT_CI_PROVENANCE_CATEGORIES = Object.freeze([
  'artifact-builder-temp-output-contract',
  'artifact-index-review-only-contract',
  'verifier-context-and-provenance-contract',
  'ci-review-workflow-bounded-non-release',
  'hosted-observation-minimal-non-availability',
  'no-generated-or-release-artifact-residue',
  'package-native-default-surface-unbroadened',
  'artifact-ci-provenance-supporting-suite-evidence',
])

const ARTIFACT_CI_PROVENANCE_CATEGORY_DESCRIPTIONS = Object.freeze({
  'artifact-builder-temp-output-contract': 'The explicit helper artifact builder writes only to OS temp or ignored .agentteam-artifacts, emits package-relative metadata, runs bounded go build/smoke checks, and produces compact fail-closed diagnostics.',
  'artifact-index-review-only-contract': 'The artifact index stays review-only with short retention, safe GitHub context metadata, required file rows only, and no release/install/default/native-availability claims.',
  'verifier-context-and-provenance-contract': 'The review artifact verifier binds expected CI context and checks source revision, generatedAt, exact go build command, bounded env/cwd/toolchain/run identity, smoke metadata, license, checksums, and placeholder attestation consistency.',
  'ci-review-workflow-bounded-non-release': 'The GitHub workflow remains a bounded review-artifact workflow with read-only permissions, one linux-x64-glibc build/verify row, strict reverify context flags, short retention, and no release/package/signing mechanics.',
  'hosted-observation-minimal-non-availability': 'Hosted observation records are local minimal facts only, never query GitHub or artifacts, allow explicit not-observed evidence, and cannot overclaim release/install/package/default/native availability.',
  'no-generated-or-release-artifact-residue': 'No raw CI logs, hosted records, downloaded bundles, tarballs, signatures, release assets, or generated artifact metadata are checked in outside the approved embedded native helper path.',
  'package-native-default-surface-unbroadened': 'package.json remains 0.6.8 with no lifecycle/download/install/build/release mechanics and the approved embedded native helper files remain the only packaged native surface.',
  'artifact-ci-provenance-supporting-suite-evidence': 'Current supporting builder, CI review, provenance, hosted-observation, and workflow guard suites/scripts remain present as executable evidence outside historical checkpoint docs suites.',
})

const ARTIFACT_CI_PROVENANCE_SOURCE_FILES = Object.freeze([
  'scripts/lib/go-helper-artifact-builder.cjs',
  'scripts/build-go-helper-artifact.cjs',
  'scripts/lib/go-helper-artifact-verifier.cjs',
  'scripts/verify-go-helper-artifact.cjs',
  'scripts/lib/go-helper-hosted-observation-record.cjs',
  'scripts/verify-go-helper-hosted-observation-record.cjs',
  'tests/helpers/reviewArtifactWorkflowGuard.cjs',
  '.github/workflows/go-helper-review-artifact.yml',
  '.gitignore',
  'package.json',
  'core/kernel.ts',
  'core/kernelPackagedResolver.ts',
])

const ARTIFACT_CI_PROVENANCE_SUPPORTING_SUITES = Object.freeze([
  'tests/suites/go-kernel-v0629-helper-artifact-builder.cjs',
  'tests/suites/go-kernel-v0629-real-helper-artifact-build.cjs',
  'tests/suites/go-kernel-v0629-packaged-preview-manifest-integration.cjs',
  'tests/suites/go-kernel-v0629-real-artifact-clean-install-preview.cjs',
  'tests/suites/go-kernel-v0630-ci-artifact-index.cjs',
  'tests/suites/go-kernel-v0630-ci-artifact-reverify.cjs',
  'tests/suites/go-kernel-v0630-ci-matrix-policy.cjs',
  'tests/suites/go-kernel-v0630-ci-review-artifact-workflow.cjs',
  'tests/suites/go-kernel-v0630-packaged-preview-reviewer-usability.cjs',
  'tests/suites/go-kernel-v0631-ci-artifact-bundle-surface.cjs',
  'tests/suites/go-kernel-v0631-ci-artifact-context.cjs',
  'tests/suites/go-kernel-v0631-ci-review-artifact-workflow-strict-context.cjs',
  'tests/suites/go-kernel-v0631-hosted-observation-docs.cjs',
  'tests/suites/go-kernel-v0632-builder-provenance-consistency.cjs',
  'tests/suites/go-kernel-v0632-hosted-observation-record.cjs',
  'tests/suites/go-kernel-v0632-provenance-build-context.cjs',
  'tests/suites/go-kernel-v0632-workflow-context-binding.cjs',
])

const ARTIFACT_CI_PROVENANCE_SUPPORTING_DOCS = Object.freeze([
  'docs/perf/v0.6.29-real-go-helper-artifact-entry-checkpoint.md',
  'docs/perf/v0.6.30-ci-review-artifact-prototype.md',
  'docs/perf/v0.6.30-ci-review-artifact-prototype-checkpoint.md',
  'docs/perf/v0.6.31-ci-review-artifact-verifier-hardening.md',
  'docs/perf/v0.6.31-ci-review-artifact-verifier-hardening-checkpoint.md',
  'docs/perf/v0.6.32-ci-review-provenance-build-context.md',
  'docs/perf/v0.6.32-ci-review-provenance-build-context-checkpoint.md',
])

const REQUIRED_REVIEW_FILE_KINDS = Object.freeze([
  'helper',
  'manifest',
  'checksums',
  'provenance',
  'license',
  'license-metadata',
  'attestation',
])

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function assertEveryFileExists(root, files, label) {
  for (const rel of files) assert.equal(existsRel(root, rel), true, `${rel} should exist for ${label}`)
}

function assertNoCompactDiagnosticLeaks(value, label) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  assert.ok(text.length < 1600, `${label} diagnostic should stay compact`)
  for (const forbidden of [
    process.cwd(),
    'stdout',
    'stderr',
    'stack',
    'AssertionError',
    'Error:',
    'artifact-index.json',
    'manifest.json',
    'provenance.json',
    'SHA256SUMS',
    'attestation.intoto',
    'downloaded bundle',
    'raw API payload',
    'workflow summary',
    'https://',
    'api.github.com',
  ]) {
    assert.equal(text.includes(forbidden), false, `${label} diagnostic must not leak ${forbidden}`)
  }
}

function assertBuilderTempOutputContract(root) {
  const builder = require(path.join(root, 'scripts/lib/go-helper-artifact-builder.cjs'))
  assert.equal(builder.MODULE, 'tmuxSnapshotParse', 'builder module should remain tmuxSnapshotParse')
  assert.equal(builder.BUILDER_VERSION, '0.6.29-slice1-local-builder', 'builder version should remain slice-scoped')
  assert.equal(builder.REPO_ARTIFACT_DIR, '.agentteam-artifacts', 'builder repo-local output should stay ignored .agentteam-artifacts')
  assert.equal(builder.CI_REVIEW_RETENTION_DAYS, 7, 'builder review retention should stay short')

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-artifact-ci-guard-'))
  try {
    const outputRoot = path.join(tempRoot, 'output')
    const resolved = builder.resolveOutputRoot({ extRoot: root, outputRoot })
    assert.equal(resolved.extRoot, path.resolve(root), 'builder extRoot should be explicit')
    assert.equal(resolved.outputRoot, outputRoot, 'builder output root should be explicit')
    assert.equal(resolved.outputRootKind, 'os-temp', 'builder should classify temp output as os-temp')
    assert.equal(fs.existsSync(outputRoot), true, 'builder resolveOutputRoot should create only requested temp output')

    assert.throws(() => builder.resolveOutputRoot({ extRoot: root, outputRoot: path.join(root, 'agentteam-forbidden-builder-output') }), error => {
      assert.ok(error instanceof builder.GoHelperArtifactBuilderError, 'repo output should throw compact builder error')
      const diagnostic = error.toDiagnostic()
      assert.equal(diagnostic.failureKind, 'output-root-forbidden', 'repo output should fail closed')
      assert.equal(diagnostic.resultMarker, 'fail-closed', 'repo output diagnostic marker')
      assertNoCompactDiagnosticLeaks(diagnostic, 'builder output-root-forbidden')
      return true
    })
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }

  const builderSource = readRel(root, 'scripts/lib/go-helper-artifact-builder.cjs')
  const builderCli = readRel(root, 'scripts/build-go-helper-artifact.cjs')
  for (const expected of [
    "cp.spawnSync('go', ['build', '-trimpath', '-o', helperPath, '.']",
    "env: { ...process.env, ...env, GO111MODULE: 'off' }",
    'assertAllowedOutputRoot(outputRoot, extRoot)',
    "writeJson(manifestPath, manifest)",
    "fs.writeFileSync(checksumPath, checksumRows.map(([hash, rel]) => `${hash}  ${rel}`).join('\\n') + '\\n', 'utf8')",
    "reviewOnly: true",
    "releaseAsset: false",
    "installSource: false",
    "normalUserAvailability: false",
    "placeholderOnly: true",
    "signed: false",
    "signing: 'not-real-signing'",
  ]) assertIncludes(builderSource, expected, 'artifact builder source')
  for (const expected of [
    'runHealth(helperPath, env, timeoutMs)',
    'runTmuxSnapshotParseSmoke(helperPath, env, timeoutMs)',
    'runWorkerLifecycleInspectPaneSmoke(helperPath, env, timeoutMs)',
    'runTmuxAvailabilitySmoke(helperPath, env, timeoutMs)',
    'writeArtifactIndex({',
  ]) assertIncludes(builderSource, expected, 'artifact builder source')
  for (const expected of [
    '--artifact-index writes review/transport artifact-index.json metadata.',
    '--ci-review is shorthand for --artifact-index for GitHub Actions review artifacts.',
    'The only repo-local output root allowed is ignored .agentteam-artifacts/.',
    'compactFailure',
  ]) assertIncludes(builderCli, expected, 'artifact builder CLI')
  assert.equal(/curl\b|wget\b|gh\s+release|npm\s+(?:publish|version)|git\s+(?:tag|push)|cosign|slsa/i.test(`${builderSource}\n${builderCli}`), false, 'builder must not contain release/download/signing mechanics')
}

function assertArtifactIndexReviewOnlyContract(root) {
  const builderSource = readRel(root, 'scripts/lib/go-helper-artifact-builder.cjs')
  for (const expected of [
    'function writeArtifactIndex(input)',
    "const ARTIFACT_INDEX_FILENAME = 'artifact-index.json'",
    'const CI_REVIEW_RETENTION_DAYS = 7',
    "kind: 'github-actions-artifact'",
    'expiresHint: `retention-days:${CI_REVIEW_RETENTION_DAYS}`',
    'files,',
    'github: githubMetadata(env)',
    "safeMetadataString(env.GITHUB_REPOSITORY, 'unknown-repository')",
    "safeMetadataString(env.GITHUB_WORKFLOW, 'unknown-workflow')",
    "safeMetadataString(env.GITHUB_RUN_ID, 'unknown-run-id')",
    "safeMetadataString(env.GITHUB_RUN_ATTEMPT, 'unknown-run-attempt')",
    "safeMetadataString(env.GITHUB_SHA, 'unknown-sha')",
    "safeMetadataString(env.GITHUB_REF, 'unknown-ref')",
  ]) assertIncludes(builderSource, expected, 'artifact index source')
  for (const kind of REQUIRED_REVIEW_FILE_KINDS) assertIncludes(builderSource, `, '${kind}')`, `artifact index ${kind} row`)

  const verifierSource = readRel(root, 'scripts/lib/go-helper-artifact-verifier.cjs')
  for (const expected of [
    "'reviewOnly'",
    "'releaseAsset'",
    "'installSource'",
    "'normalUserAvailability'",
    "index.reviewOnly !== true || index.releaseAsset !== false || index.installSource !== false || index.normalUserAvailability !== false",
    "index.retentionHint.kind !== 'github-actions-artifact'",
    'index.retentionHint.days !== REVIEW_RETENTION_DAYS',
    'index.expiresHint !== `retention-days:${REVIEW_RETENTION_DAYS}`',
  ]) assertIncludes(verifierSource, expected, 'artifact index verifier source')
}

function assertVerifierContextAndProvenanceContract(root) {
  const verifier = require(path.join(root, 'scripts/lib/go-helper-artifact-verifier.cjs'))
  for (const failureKind of ['context-mismatch', 'provenance-mismatch', 'artifact-surface-invalid', 'attestation-invalid']) {
    assert.equal(verifier.FAILURE_KINDS.has(failureKind), true, `verifier should expose ${failureKind}`)
  }
  assert.throws(() => verifier.verifyGoHelperArtifact({ artifactRoot: path.join(os.tmpdir(), 'agentteam-artifact-ci-missing-root') }), error => {
    assert.ok(error instanceof verifier.GoHelperArtifactVerifierError, 'missing artifact root should throw compact verifier error')
    const diagnostic = error.toDiagnostic()
    assert.equal(diagnostic.failureKind, 'artifact-root-invalid')
    assert.equal(diagnostic.resultMarker, 'fail-closed')
    assertNoCompactDiagnosticLeaks(diagnostic, 'verifier artifact-root-invalid')
    return true
  })

  const verifierSource = readRel(root, 'scripts/lib/go-helper-artifact-verifier.cjs')
  const verifierCli = readRel(root, 'scripts/verify-go-helper-artifact.cjs')
  for (const expected of [
    'function validateExpectedContext(index, options)',
    "['target', expectedString(options, 'expectedTarget'), index.target]",
    "['sourceRevision', expectedString(options, 'expectedSourceRevision'), index.sourceRevision]",
    "['github.sha', expectedString(options, 'expectedGithubSha'), githubString(index, 'sha')]",
    "['github.runId', expectedString(options, 'expectedGithubRunId'), githubString(index, 'runId')]",
    "['github.runAttempt', expectedString(options, 'expectedGithubRunAttempt'), githubString(index, 'runAttempt')]",
    "['github.ref', expectedString(options, 'expectedGithubRef'), githubString(index, 'ref')]",
    'function validateProvenance(index, manifest, paths, options)',
    'assertExactCommand(block.command, helperRelPath)',
    'assertExactBuildEnv(block.env)',
    "block.cwd !== SOURCE_ROOT_REL",
    "manifest.build.runIdentity !== `github-run-${expectedRunId}`",
    "provenance.outputRootKind !== 'os-temp'",
    "body.predicate.placeholderOnly !== true || body.predicate.signed !== false || body.predicate.signing !== 'not-real-signing'",
  ]) assertIncludes(verifierSource, expected, 'artifact verifier provenance source')
  for (const expected of [
    '--expected-target requires a target',
    '--expected-source-revision requires a sha',
    '--expected-github-sha requires a sha',
    '--expected-github-run-id requires an id',
    '--expected-github-run-attempt requires an attempt',
    '--expected-github-ref requires a ref',
    'This is reviewer/CI transport validation, not runtime download or install-source behavior.',
  ]) assertIncludes(verifierCli, expected, 'artifact verifier CLI')
}

function assertCiReviewWorkflowBoundedNonRelease(root) {
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only the approved review artifact workflow should exist')
  assertWorkflowContract(root)
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
  const workflow = readWorkflow(root)
  assertIncludes(workflow, `permissions:\n  contents: read`, 'review workflow permissions')
  assert.equal((workflow.match(/actions\/upload-artifact@v4/g) || []).length, 1, 'review workflow should upload exactly once')
  assert.equal((workflow.match(/actions\/download-artifact@v4/g) || []).length, 1, 'review workflow should download exactly once')
  assert.equal((workflow.match(new RegExp(`target: ${REQUIRED_MATRIX_TARGET}`, 'g')) || []).length, 2, 'review workflow should keep one build and one verify linux-x64-glibc row')
  for (const expected of STRICT_VERIFIER_EXPECTED_CONTEXT_LINES) assertIncludes(workflow, expected, 'review workflow strict verifier expected context')
  assertIncludes(workflow, VERIFIER_COMMAND_BASE, 'review workflow verifier command')
  assertIncludes(workflow, 'retention-days: 7', 'review workflow retention')
  assert.equal(/macos-latest|windows-latest|arm64|musl|cross-?compile|continue-on-error|experimental:\s*true/i.test(workflow), false, 'review workflow must not add unsupported platform rows')
  assert.equal(/gh\s+release|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|cosign|slsa|signing|gh\s+attestation|id-token:\s*write|packages:\s*write/i.test(workflow), false, 'review workflow must not add release/package/signing mechanics')
  assert.equal(/curl\b|wget\b|node-gyp\b|prebuild\b|postinstall|preinstall|install-time build|package-manager install proof/i.test(workflow), false, 'review workflow must not add download/install/package behavior')
}

function observedRecord(recordVerifier) {
  return {
    schemaVersion: 1,
    workflowPath: recordVerifier.WORKFLOW_PATH,
    workflowName: recordVerifier.WORKFLOW_NAME,
    commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    observed: true,
    runId: '300300300',
    runAttempt: '1',
    status: 'completed',
    conclusion: 'success',
    jobs: [
      { name: 'build-review-artifact', status: 'completed', conclusion: 'success', target: recordVerifier.TARGET },
      { name: 'verify-review-artifact', status: 'completed', conclusion: 'success', target: recordVerifier.TARGET },
    ],
    target: recordVerifier.TARGET,
    retentionDays: recordVerifier.RETENTION_DAYS,
    reviewOnly: true,
    releaseAsset: false,
    installSource: false,
    packageArtifact: false,
    normalUserAvailability: false,
  }
}

function notObservedRecord(recordVerifier) {
  return {
    schemaVersion: 1,
    workflowPath: recordVerifier.WORKFLOW_PATH,
    workflowName: recordVerifier.WORKFLOW_NAME,
    commitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    observed: false,
    status: 'not_observed_locally',
    target: recordVerifier.TARGET,
    retentionDays: recordVerifier.RETENTION_DAYS,
    reviewOnly: true,
    releaseAsset: false,
    installSource: false,
    packageArtifact: false,
    normalUserAvailability: false,
  }
}

function assertHostedObservationMinimalNonAvailability(root) {
  const recordVerifier = require(path.join(root, 'scripts/lib/go-helper-hosted-observation-record.cjs'))
  assert.equal(recordVerifier.MODULE, 'hostedObservationRecord')
  assert.equal(recordVerifier.WORKFLOW_PATH, APPROVED_REVIEW_WORKFLOW_PATH)
  assert.equal(recordVerifier.WORKFLOW_NAME, 'Go Helper Review Artifact')
  assert.equal(recordVerifier.TARGET, REQUIRED_MATRIX_TARGET)
  assert.equal(recordVerifier.RETENTION_DAYS, 7)
  assert.deepEqual(recordVerifier.FLAG_EXPECTATIONS, {
    reviewOnly: true,
    releaseAsset: false,
    installSource: false,
    packageArtifact: false,
    normalUserAvailability: false,
  }, 'hosted observation flags should stay review-only/non-availability')

  const observed = recordVerifier.verifyHostedObservationRecord(observedRecord(recordVerifier)).summary
  assert.equal(observed.ok, true, 'observed record should verify')
  assert.equal(observed.observation, 'hosted workflow observed')
  assert.equal(observed.reviewOnly, true)
  assert.equal(observed.releaseAsset, false)
  assert.equal(observed.installSource, false)
  assert.equal(observed.packageArtifact, false)
  assert.equal(observed.normalUserAvailability, false)
  assert.deepEqual(observed.jobs, {
    'build-review-artifact': 'success',
    'verify-review-artifact': 'success',
  })

  const notObserved = recordVerifier.verifyHostedObservationRecord(notObservedRecord(recordVerifier)).summary
  assert.equal(notObserved.ok, true, 'not-observed record should verify as local non-availability evidence')
  assert.equal(notObserved.observation, 'not observed locally')
  assert.equal(notObserved.evidenceKind, 'review-only non-availability evidence')
  assert.equal(Object.prototype.hasOwnProperty.call(notObserved, 'runId'), false, 'not-observed summary should not contain hosted run id')

  assert.throws(() => recordVerifier.verifyHostedObservationRecord({
    ...observedRecord(recordVerifier),
    releaseAsset: true,
    normalUserAvailability: true,
  }), error => {
    assert.ok(error instanceof recordVerifier.HostedObservationRecordError, 'overclaim should throw hosted observation error')
    const diagnostic = error.toDiagnostic()
    assert.equal(diagnostic.failureKind, 'record-availability-overclaim')
    assertNoCompactDiagnosticLeaks(diagnostic, 'hosted observation overclaim')
    return true
  })

  const source = readRel(root, 'scripts/lib/go-helper-hosted-observation-record.cjs')
  const cli = readRel(root, 'scripts/verify-go-helper-hosted-observation-record.cjs')
  for (const expected of [
    'omit hosted artifact, API, download, and release URLs from the record',
    'not observed locally records must not include hosted run evidence',
    'normal[- ]user native availability',
    'release asset is approved',
    'package artifact is approved',
    'install source is approved',
    'default Go is enabled',
    'default resolver is enabled',
  ]) assertIncludes(source, expected, 'hosted observation validator')
  for (const forbidden of [/require\('node:child_process'\)|https?:\/\/|api\.github\.com|actions\/download-artifact|\bgh\s+/i]) {
    assert.equal(forbidden.test(cli), false, 'hosted observation CLI must not query GitHub or download artifacts')
  }
  assertIncludes(cli, 'This command does not query GitHub, use gh, download artifacts, or validate release/package/default availability.', 'hosted observation CLI usage')
}

function assertNoGeneratedOrReleaseArtifactResidue(root) {
  assertNoRawOrReleaseArtifacts(root, {
    rawMessage: 'repo must not contain raw CI/hosted/release evidence files',
    artifactMessage: 'repo must not contain unapproved archives/signatures/release artifacts',
  })
  assert.equal(existsRel(root, '.agentteam-artifacts'), false, '.agentteam-artifacts must remain ignored and absent')
  assertIncludes(readRel(root, '.gitignore'), '.agentteam-artifacts/', '.gitignore should keep generated artifact output ignored')

  const forbidden = []
  const generatedEvidenceFile = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|review-artifact-index|artifact-index|artifact-verifier|hosted-observation|workflow-summary|verifier-output|downloaded-bundle|raw-api-payload|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|release-asset|manifest|license)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|md)$/i
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (rel.startsWith(`${APPROVED_NATIVE_ROOT}/`)) continue
    if (rel.startsWith('tests/suites/') || rel.startsWith('tests/helpers/') || rel.startsWith('docs/perf/') || rel === '.github/workflows/go-helper-review-artifact.yml') continue
    if (/\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig|asc|spdx|sbom|log)$/i.test(rel) || generatedEvidenceFile.test(rel)) forbidden.push(rel)
  }
  assert.deepEqual(forbidden.sort(), [], 'repo must not contain checked-in raw/generated review artifacts outside approved native fixture/docs/tests')
}

function assertPackageNativeDefaultSurfaceUnbroadened(root) {
  const packageJson = assertPackageNoReleaseGuards(root, {
    expectedVersion: PACKAGE_VERSION,
    expectedPiExtensions: ['./index.ts'],
  })
  assert.equal(packageJson.version, '0.6.8', 'package version should remain frozen')
  for (const rel of APPROVED_EMBEDDED_NATIVE_FILES) assert.equal(existsRel(root, rel), true, `${rel} approved embedded native file should remain present`)
  for (const entry of packageJson.files || []) {
    const rel = String(entry).replace(/^!/, '').replace(/^\//, '').replace(/^\.\//, '')
    const approvedNative = APPROVED_EMBEDDED_NATIVE_FILES.includes(rel)
    assert.equal(rel.startsWith('native/') && !approvedNative, false, `package files must not include unapproved native path: ${rel}`)
    assert.equal(/(?:artifact-index|hosted-observation|workflow|go-helper-review-artifact|downloaded|bundle|release|signing|slsa|cosign)/i.test(rel), false, `package files must not include review/release artifact surface: ${rel}`)
  }

  const runtimeSources = [
    readRel(root, 'core/kernel.ts'),
    readRel(root, 'core/kernelPackagedResolver.ts'),
  ].join('\n')
  assert.equal(/hosted-observation|verify-go-helper-hosted-observation-record|artifact-index|artifactIndex|go-helper-review-artifact|download-artifact|github\.sha|github\.run_id|github\.run_attempt|workflow_dispatch|provenance\.json|release asset|package-manager install proof/i.test(runtimeSources), false, 'runtime/resolver must not read artifact/provenance/hosted observation/workflow metadata')
  assert.equal(/go\s+build|GO111MODULE|build-go-helper-artifact|verify-go-helper-artifact/i.test(readRel(root, 'core/kernel.ts')), false, 'runtime kernel must not execute or import artifact builder/verifier')
}

function assertSupportingSuiteEvidence(root) {
  assertEveryFileExists(root, [
    ARTIFACT_CI_PROVENANCE_GUARD_HELPER,
    ARTIFACT_CI_PROVENANCE_GUARD_SUITE,
    ...ARTIFACT_CI_PROVENANCE_SOURCE_FILES,
    ...ARTIFACT_CI_PROVENANCE_SUPPORTING_SUITES,
    ...ARTIFACT_CI_PROVENANCE_SUPPORTING_DOCS,
  ], 'artifact/CI/provenance guard')

  const evidenceChecks = [
    ['tests/suites/go-kernel-v0629-helper-artifact-builder.cjs', ['buildGoHelperArtifact', 'assertPositiveArtifact', 'GO111MODULE']],
    ['tests/suites/go-kernel-v0629-real-helper-artifact-build.cjs', ['Go kernel v0.6.29 real helper artifact build validation', 'buildGoHelperArtifact']],
    ['tests/suites/go-kernel-v0630-ci-artifact-index.cjs', ['assertArtifactIndex', 'reviewOnly', 'normalUserAvailability']],
    ['tests/suites/go-kernel-v0630-ci-artifact-reverify.cjs', ['verifyGoHelperArtifact', 'review-artifact-reverified', 'go-packaged-preview']],
    ['tests/suites/go-kernel-v0630-ci-review-artifact-workflow.cjs', ['assertWorkflowContract', 'actions/upload-artifact@v4', 'verify-review-artifact']],
    ['tests/suites/go-kernel-v0631-ci-artifact-bundle-surface.cjs', ['artifact-surface-invalid', 'symlink', 'extra file']],
    ['tests/suites/go-kernel-v0631-ci-artifact-context.cjs', ['context-mismatch', 'expectedGithubSha', 'expectedGithubRunId']],
    ['tests/suites/go-kernel-v0631-ci-review-artifact-workflow-strict-context.cjs', ['STRICT_VERIFIER_EXPECTED_CONTEXT_LINES', '--expected-github-run-id', '--expected-source-revision']],
    ['tests/suites/go-kernel-v0631-hosted-observation-docs.cjs', ['hosted observation', 'not observed locally', 'release assets']],
    ['tests/suites/go-kernel-v0632-builder-provenance-consistency.cjs', ['buildGoHelperArtifact', 'assertBuildContext', 'artifact-index.json']],
    ['tests/suites/go-kernel-v0632-hosted-observation-record.cjs', ['verifyHostedObservationRecord', 'not observed locally', 'normalUserAvailability']],
    ['tests/suites/go-kernel-v0632-provenance-build-context.cjs', ['provenance-mismatch', 'command tamper', 'outputRootKind']],
    ['tests/suites/go-kernel-v0632-workflow-context-binding.cjs', ['STRICT_VERIFIER_EXPECTED_CONTEXT_LINES', '--expected-source-revision', 'linux-x64-glibc']],
  ]
  for (const [rel, expectedValues] of evidenceChecks) {
    const source = readRel(root, rel)
    for (const expected of expectedValues) assertIncludes(source, expected, `${rel} supporting evidence`)
  }
}

async function assertArtifactCiProvenanceGuard(root) {
  assertEveryFileExists(root, [
    ARTIFACT_CI_PROVENANCE_GUARD_HELPER,
    ARTIFACT_CI_PROVENANCE_GUARD_SUITE,
    ...ARTIFACT_CI_PROVENANCE_SOURCE_FILES,
  ], 'artifact/CI/provenance guard')

  const checked = new Set()
  const mark = async (category, assertion) => {
    await assertion()
    checked.add(category)
  }

  await mark('artifact-builder-temp-output-contract', () => assertBuilderTempOutputContract(root))
  await mark('artifact-index-review-only-contract', () => assertArtifactIndexReviewOnlyContract(root))
  await mark('verifier-context-and-provenance-contract', () => assertVerifierContextAndProvenanceContract(root))
  await mark('ci-review-workflow-bounded-non-release', () => assertCiReviewWorkflowBoundedNonRelease(root))
  await mark('hosted-observation-minimal-non-availability', () => assertHostedObservationMinimalNonAvailability(root))
  await mark('no-generated-or-release-artifact-residue', () => assertNoGeneratedOrReleaseArtifactResidue(root))
  await mark('package-native-default-surface-unbroadened', () => assertPackageNativeDefaultSurfaceUnbroadened(root))
  await mark('artifact-ci-provenance-supporting-suite-evidence', () => assertSupportingSuiteEvidence(root))

  const checkedCategories = sorted(checked)
  assert.deepEqual(checkedCategories, sorted(ARTIFACT_CI_PROVENANCE_CATEGORIES), 'artifact/CI/provenance guard should execute every category')
  return { checkedCategories }
}

module.exports = {
  ARTIFACT_CI_PROVENANCE_CATEGORIES,
  ARTIFACT_CI_PROVENANCE_CATEGORY_DESCRIPTIONS,
  ARTIFACT_CI_PROVENANCE_GUARD_HELPER,
  ARTIFACT_CI_PROVENANCE_GUARD_SUITE,
  ARTIFACT_CI_PROVENANCE_SOURCE_FILES,
  ARTIFACT_CI_PROVENANCE_SUPPORTING_DOCS,
  ARTIFACT_CI_PROVENANCE_SUPPORTING_SUITES,
  assertArtifactCiProvenanceGuard,
}
