const assert = require('node:assert/strict')
const cp = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  APPROVED_REVIEW_WORKFLOW,
  APPROVED_REVIEW_WORKFLOW_PATH,
  REQUIRED_MATRIX_TARGET,
  STRICT_VERIFIER_EXPECTED_CONTEXT_LINES,
  VERIFIER_COMMAND_BASE,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')
const recordVerifier = require('../../scripts/lib/go-helper-hosted-observation-record.cjs')

const DOC = 'docs/perf/v0.6.32-ci-review-provenance-build-context.md'
const PACKAGE_VERSION = '0.6.8'
const PUSHED_V0631_COMMIT = '9aa2d93f02d30dd856f5e67f528c2441bbbd76a5'
const OBSERVED_COMMIT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const RUN_ID = '6320001'
const LEAK_SENTINELS = [
  'V0632-HOSTED-OBSERVATION-URL-SHOULD-NOT-LEAK',
  'V0632-HOSTED-OBSERVATION-RAW-PAYLOAD-SHOULD-NOT-LEAK',
  'V0632-HOSTED-OBSERVATION-ABS-PATH-SHOULD-NOT-LEAK',
  'V0632-HOSTED-OBSERVATION-ARTIFACT-BODY-SHOULD-NOT-LEAK',
  'V0632-HOSTED-OBSERVATION-STACK-SHOULD-NOT-LEAK',
  'V0632-HOSTED-OBSERVATION-MAILBOX-REPORT-SHOULD-NOT-LEAK',
]

const REQUIRED_DOC_LINES = [
  'Route C — provenance/build-context consistency is the v0.6.32 main route.',
  'Route A — hosted observation record support is supporting evidence only',
  'Route B — second platform row is deferred',
  'Route D — package-manager clean-install proof is deferred',
  'Route E — package/release/default resolver/default Go/native availability work is deferred',
  `The v0.6.31 implementation has been pushed at commit \`${PUSHED_V0631_COMMIT}\` on \`main\`.`,
  'The `v0.6.31` tag remains gated by hosted workflow observation.',
  'exact hosted run evidence for that commit or explicitly changes the release rule',
  '`not_observed_locally` record with `observed: false`',
  'must continue to say `not observed locally`',
  'does not query GitHub, require `gh`, require a token, download artifacts, or execute the workflow',
  '`workflowPath: ".github/workflows/go-helper-review-artifact.yml"`',
  '`workflowName: "Go Helper Review Artifact"`',
  '`jobs`: exactly `build-review-artifact` and `verify-review-artifact`',
  '`target: "linux-x64-glibc"`',
  '`retentionDays: 7`',
  '`reviewOnly: true`, `releaseAsset: false`, `installSource: false`, `packageArtifact: false`, `normalUserAvailability: false`',
  'it must not include `runId`, `runAttempt`, `conclusion`, or `jobs`',
  'Do not commit hosted artifacts, downloaded bundles, verifier JSON bodies, workflow summaries, raw API payloads',
  'Allowed checkpoint evidence is limited to commit, run id, run attempt, workflow status/conclusion, build/verify job result, target, retention',
  'Package version stays `0.6.8`.',
  'No default resolver and no default Go.',
  'No checked-in hosted artifacts',
  'Hosted observation for commit `9aa2d93f02d30dd856f5e67f528c2441bbbd76a5` is not observed locally.',
  'The `v0.6.31` tag remains gated unless exact hosted run evidence is supplied or the release rule changes.',
  'Slice 1 adds the local hosted observation record validator, CLI, docs, and guard only.',
]

const FORBIDDEN_DOC_CLAIMS = [
  'release assets are implemented',
  'release asset is approved',
  'install source is approved',
  'package artifact is approved',
  'package-manager clean-install proof is complete',
  'normal-user native availability is proven',
  'native availability proof is complete',
  'second platform is supported',
  'macOS is supported availability',
  'Windows is supported availability',
  'arm64 is supported availability',
  'musl is supported availability',
  'default Go is enabled',
  'default resolver is enabled',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'signing is approved',
  'cosign is approved',
  'SLSA is approved',
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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function observedRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    workflowPath: recordVerifier.WORKFLOW_PATH,
    workflowName: recordVerifier.WORKFLOW_NAME,
    commitSha: OBSERVED_COMMIT,
    observed: true,
    runId: RUN_ID,
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
    ...overrides,
  }
}

function notObservedRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    workflowPath: recordVerifier.WORKFLOW_PATH,
    workflowName: recordVerifier.WORKFLOW_NAME,
    commitSha: PUSHED_V0631_COMMIT,
    observed: false,
    status: 'not_observed_locally',
    target: recordVerifier.TARGET,
    retentionDays: recordVerifier.RETENTION_DAYS,
    reviewOnly: true,
    releaseAsset: false,
    installSource: false,
    packageArtifact: false,
    normalUserAvailability: false,
    ...overrides,
  }
}

function assertNoDiagnosticLeaks(value, roots = [], forbiddenValues = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  assert.ok(text.length < 1200, 'diagnostic must stay compact')
  for (const root of roots) {
    if (!root) continue
    assert.equal(text.includes(path.resolve(root)), false, 'diagnostic must not leak absolute roots')
  }
  assert.equal(text.includes(process.cwd()), false, 'diagnostic must not leak cwd')
  assert.equal(/https?:\/\/|api\.github\.com|stdout|stderr|Error:|AssertionError|\bat\s+|stack|artifact-index\.json|manifest\.json|provenance\.json|SHA256SUMS|attestation\.intoto|workflow summary|verifier JSON|raw API payload|downloaded bundle/i.test(text), false, 'diagnostic must avoid URLs, process output, and payload internals')
  for (const secret of [...LEAK_SENTINELS, ...forbiddenValues]) {
    assert.equal(text.includes(secret), false, `diagnostic must not leak ${secret}`)
  }
}

function assertFailure(record, failureKind, roots = [], forbiddenValues = []) {
  assert.throws(() => recordVerifier.verifyHostedObservationRecord(record), error => {
    assert.ok(error instanceof recordVerifier.HostedObservationRecordError, 'expected hosted observation record error')
    const diagnostic = error.toDiagnostic()
    assert.equal(diagnostic.ok, false)
    assert.equal(diagnostic.status, 'unavailable')
    assert.equal(diagnostic.module, recordVerifier.MODULE)
    assert.equal(diagnostic.capability, recordVerifier.MODULE)
    assert.equal(diagnostic.resultMarker, 'fail-closed')
    assert.equal(diagnostic.failureKind, failureKind)
    assertNoDiagnosticLeaks(diagnostic, roots, forbiddenValues)
    return true
  })
}

function runCli(root, args) {
  const cli = path.join(root, 'scripts', 'verify-go-helper-hosted-observation-record.cjs')
  return cp.spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, PATH: process.env.PATH || '' },
  })
}

function runPositiveValidatorCases(root) {
  const observed = recordVerifier.verifyHostedObservationRecord(observedRecord())
  assert.equal(observed.summary.ok, true)
  assert.equal(observed.summary.resultMarker, 'hosted-observation-record-verified')
  assert.equal(observed.summary.observed, true)
  assert.equal(observed.summary.observation, 'hosted workflow observed')
  assert.equal(observed.summary.conclusion, 'success')
  assert.equal(observed.summary.runId, RUN_ID)
  assert.equal(observed.summary.target, 'linux-x64-glibc')
  assert.equal(observed.summary.retentionDays, 7)
  assert.equal(observed.summary.reviewOnly, true)
  assert.equal(observed.summary.releaseAsset, false)
  assert.equal(observed.summary.installSource, false)
  assert.equal(observed.summary.packageArtifact, false)
  assert.equal(observed.summary.normalUserAvailability, false)
  assert.deepEqual(observed.summary.jobs, {
    'build-review-artifact': 'success',
    'verify-review-artifact': 'success',
  })
  assertNoDiagnosticLeaks(observed.summary, [root])

  const notObserved = recordVerifier.verifyHostedObservationRecord(notObservedRecord())
  assert.equal(notObserved.summary.ok, true)
  assert.equal(notObserved.summary.observed, false)
  assert.equal(notObserved.summary.observation, 'not observed locally')
  assert.equal(notObserved.summary.evidenceKind, 'review-only non-availability evidence')
  assert.equal(Object.prototype.hasOwnProperty.call(notObserved.summary, 'runId'), false, 'not observed summary must not include run id')
  assertNoDiagnosticLeaks(notObserved.summary, [root])
}

function runCliCases(root) {
  let tempRoot
  try {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0632-hosted-observation-'))
    assert.equal(path.dirname(tempRoot), os.tmpdir(), 'temp root must be directly under OS tmpdir')
    const observedPath = path.join(tempRoot, 'observed.json')
    const notObservedPath = path.join(tempRoot, 'not-observed.json')
    writeJson(observedPath, observedRecord())
    writeJson(notObservedPath, notObservedRecord())

    const observedRun = runCli(root, ['--record', observedPath, '--json'])
    assert.equal(observedRun.status, 0, observedRun.stderr)
    const observedSummary = JSON.parse(observedRun.stdout)
    assert.equal(observedSummary.observed, true)
    assert.equal(observedSummary.runId, RUN_ID)
    assertNoDiagnosticLeaks(observedSummary, [root, tempRoot])

    const blockedNotObserved = runCli(root, ['--record', notObservedPath, '--json'])
    assert.equal(blockedNotObserved.status, 1, 'not observed CLI records require explicit flag')
    assert.equal(blockedNotObserved.stdout, '')
    const blockedDiagnostic = JSON.parse(blockedNotObserved.stderr)
    assert.equal(blockedDiagnostic.failureKind, 'record-observation-invalid')
    assertNoDiagnosticLeaks(blockedDiagnostic, [root, tempRoot])

    const allowedNotObserved = runCli(root, ['--record', notObservedPath, '--allow-not-observed', '--json'])
    assert.equal(allowedNotObserved.status, 0, allowedNotObserved.stderr)
    const notObservedSummary = JSON.parse(allowedNotObserved.stdout)
    assert.equal(notObservedSummary.observed, false)
    assert.equal(notObservedSummary.observation, 'not observed locally')
    assert.equal(notObservedSummary.evidenceKind, 'review-only non-availability evidence')
    assert.equal(Object.prototype.hasOwnProperty.call(notObservedSummary, 'runId'), false, 'not observed CLI summary must not include run id')
    assertNoDiagnosticLeaks(notObservedSummary, [root, tempRoot])
  } finally {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function runNegativeValidatorCases(root) {
  const cases = [
    ['bad commit sha', observedRecord({ commitSha: 'not-a-sha' }), 'record-schema-invalid', []],
    ['wrong workflow path', observedRecord({ workflowPath: '.github/workflows/release.yml' }), 'record-schema-invalid', []],
    ['wrong target', observedRecord({ target: 'darwin-arm64' }), 'record-schema-invalid', []],
    ['retention mismatch', observedRecord({ retentionDays: 90 }), 'record-schema-invalid', []],
    ['missing conclusion', (() => { const record = observedRecord(); delete record.conclusion; return record })(), 'record-observation-invalid', []],
    ['missing jobs', (() => { const record = observedRecord(); delete record.jobs; return record })(), 'record-observation-invalid', []],
    ['failed verify job', observedRecord({ jobs: [
      { name: 'build-review-artifact', status: 'completed', conclusion: 'success', target: recordVerifier.TARGET },
      { name: 'verify-review-artifact', status: 'completed', conclusion: 'failure', target: recordVerifier.TARGET },
    ] }), 'record-observation-invalid', []],
    ['release flag true', observedRecord({ releaseAsset: true }), 'record-availability-overclaim', []],
    ['install source true', observedRecord({ installSource: true }), 'record-availability-overclaim', []],
    ['package flag true', observedRecord({ packageArtifact: true }), 'record-availability-overclaim', []],
    ['normal user availability true', observedRecord({ normalUserAvailability: true }), 'record-availability-overclaim', []],
    ['url field', observedRecord({ artifactUrl: `https://example.invalid/${LEAK_SENTINELS[0]}` }), 'record-forbidden-content', [LEAK_SENTINELS[0]]],
    ['raw payload field', observedRecord({ rawPayload: LEAK_SENTINELS[1] }), 'record-forbidden-content', [LEAK_SENTINELS[1]]],
    ['absolute path', observedRecord({ report: `/tmp/${LEAK_SENTINELS[2]}` }), 'record-forbidden-content', [LEAK_SENTINELS[2]]],
    ['artifact body', observedRecord({ note: `artifact-index.json ${LEAK_SENTINELS[3]}` }), 'record-forbidden-content', [LEAK_SENTINELS[3]]],
    ['stack trace', observedRecord({ note: `Error: ${LEAK_SENTINELS[4]}\n    at verifier (/tmp/file.js:1:1)` }), 'record-forbidden-content', [LEAK_SENTINELS[4]]],
    ['overclaim text', observedRecord({ note: 'normal-user native availability is proven' }), 'record-availability-overclaim', []],
    ['not observed with run id', notObservedRecord({ runId: RUN_ID }), 'record-observation-invalid', []],
    ['not observed with conclusion', notObservedRecord({ conclusion: 'success' }), 'record-observation-invalid', []],
    ['not observed overclaim', notObservedRecord({ note: 'default Go is enabled' }), 'record-availability-overclaim', []],
  ]

  for (const [name, record, failureKind, forbiddenValues] of cases) {
    try {
      assertFailure(record, failureKind, [root], forbiddenValues)
    } catch (error) {
      error.message = `${name}: ${error.message}`
      throw error
    }
  }
}

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC_LINES) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_DOC_CLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
}

function assertGitignore(root) {
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
}

function assertWorkflowStillReviewOnly(root) {
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only one review workflow file may exist')
  assertWorkflowContract(root)
  const workflow = readWorkflow(root)
  assertIncludes(workflow, `permissions:\n  contents: read`, 'workflow permissions')
  assertIncludes(workflow, VERIFIER_COMMAND_BASE, 'workflow verifier command')
  for (const expected of STRICT_VERIFIER_EXPECTED_CONTEXT_LINES) assertIncludes(workflow, expected, 'workflow strict expected-context flags')
  assert.equal((workflow.match(/actions\/upload-artifact@v4/g) || []).length, 1, 'workflow uploads exactly once')
  assert.equal((workflow.match(/actions\/download-artifact@v4/g) || []).length, 1, 'workflow downloads exactly once')
  assert.equal((workflow.match(/^\s+- runner:/gm) || []).length, 2, 'workflow keeps one build row and one verify row')
  assert.equal((workflow.match(new RegExp(`target: ${REQUIRED_MATRIX_TARGET}`, 'g')) || []).length, 2, 'workflow keeps linux-x64-glibc build and verify rows only')
  assert.equal((workflow.match(/runner: ubuntu-latest/g) || []).length, 2, 'workflow keeps ubuntu-latest build and verify rows')
  assert.equal((workflow.match(/retention-days: 7/g) || []).length, 1, 'workflow retention stays 7 days')
  assert.equal(/verify-go-helper-hosted-observation-record|hosted-observation-record|workflow summary|step summary/i.test(workflow), false, 'workflow must not consume hosted observation records or summaries')
  assert.equal(/macos-latest|windows-latest|linux-arm64|arm64|musl|cross-?compile|continue-on-error|experimental:\s*true/i.test(workflow), false, 'workflow must not add unsupported rows')
  assert.equal(/gh\s+release|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|cosign|slsa|signing|gh\s+attestation/i.test(workflow), false, 'workflow must not add release/npm/git/signing behavior')
  assert.equal(/curl\b|wget\b|node-gyp\b|prebuild|postinstall|preinstall|install-time build|package-manager install proof/i.test(workflow), false, 'workflow must not add download/install/package behavior')
}

function assertPackageRuntimeGuardrails(root) {
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

  const runtimeSources = [read(root, 'core/kernel.ts'), read(root, 'core/kernelPackagedResolver.ts')].join('\n')
  assert.equal(/hosted-observation|observation record|verify-go-helper-hosted-observation-record|artifact-index|artifactIndex|go-helper-review-artifact|download-artifact|github\.sha|github\.run_id|workflow_dispatch/i.test(runtimeSources), false, 'runtime/resolver must not read hosted observation or workflow metadata')
  assert.equal(/default Go is enabled|normal-user native availability|package-manager install proof|release asset/i.test(runtimeSources), false, 'runtime/resolver must not claim package/release/default availability')
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

function assertNoGeneratedOrHostedArtifacts(root) {
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
  name: 'Go kernel v0.6.32 hosted observation record',
  async run(env) {
    const root = env.helpers.extRoot
    assert.ok(recordVerifier.FAILURE_KINDS.has('record-forbidden-content'), 'record verifier should expose forbidden-content diagnostics')
    assert.ok(recordVerifier.FAILURE_KINDS.has('record-availability-overclaim'), 'record verifier should expose overclaim diagnostics')
    runPositiveValidatorCases(root)
    runCliCases(root)
    runNegativeValidatorCases(root)
    assertDoc(root)
    assertGitignore(root)
    assertWorkflowStillReviewOnly(root)
    assertPackageRuntimeGuardrails(root)
    assertNoGeneratedOrHostedArtifacts(root)
  },
}
