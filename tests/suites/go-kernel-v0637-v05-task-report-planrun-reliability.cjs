const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  COMMON_STOP_CONDITIONS,
  GREEN_WITH_FINAL_VALIDATION_REQUIRED,
  MAPPED_NOT_PROVEN,
  RELIABILITY_STATUSES,
  REQUIRED_INVARIANTS,
  REQUIREMENT_IDS,
  TASK_REPORT_PLANRUN_RELIABILITY_SCHEMA_VERSION,
  TASK_REPORT_PLANRUN_RELIABILITY_SLICE,
  TASK_REPORT_PLANRUN_RELIABILITY_THEME,
  V05_RELEASE_TARGET,
  taskReportPlanRunReliability,
  taskReportPlanRunRequirements,
} = require('../fixtures/kernel/v0637/taskReportPlanRunReliability.cjs')
const { HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES } = require('../fixtures/kernel/historicalCheckpointDeletionMap.cjs')

const DOC = 'docs/perf/v0.6.37-v0.5-release-readiness-burndown.md'
const FIXTURE = 'tests/fixtures/kernel/v0637/taskReportPlanRunReliability.cjs'
const SUITE = 'tests/suites/go-kernel-v0637-v05-task-report-planrun-reliability.cjs'
const P0_LEDGER_FIXTURE = 'tests/fixtures/kernel/v0637/p0ReadinessLedger.cjs'
const P0_LEDGER_SUITE = 'tests/suites/go-kernel-v0637-v05-p0-readiness-ledger.cjs'
const BASELINE_FIXTURE = 'tests/fixtures/kernel/v0637/performanceBaselineInventory.cjs'
const BASELINE_SUITE = 'tests/suites/go-kernel-v0637-v05-performance-baseline-inventory.cjs'
const P95_FIXTURE = 'tests/fixtures/kernel/v0637/p95ReleaseGates.cjs'
const P95_SUITE = 'tests/suites/go-kernel-v0637-v05-p95-release-gates.cjs'
const HOT_PATH_FIXTURE = 'tests/fixtures/kernel/v0637/hotPathBurnDownCandidates.cjs'
const HOT_PATH_SUITE = 'tests/suites/go-kernel-v0637-v05-hot-path-burndown-candidates.cjs'
const MANUAL_RC_FIXTURE = 'tests/fixtures/kernel/v0637/manualRcSmokeChecklist.cjs'
const MANUAL_RC_SUITE = 'tests/suites/go-kernel-v0637-v05-manual-rc-smoke-checklist.cjs'
const VALIDATION_FIXTURE = 'tests/fixtures/kernel/v0637/validationStrategy.cjs'
const VALIDATION_SUITE = 'tests/suites/go-kernel-v0637-v05-validation-strategy.cjs'
const FINAL_CHECKPOINT_FIXTURE = 'tests/fixtures/kernel/v0637/finalReleaseReadinessCheckpoint.cjs'
const FINAL_CHECKPOINT_SUITE = 'tests/suites/go-kernel-v0637-v05-final-readiness-checkpoint-docs.cjs'
const PACKAGE_VERSION = '0.6.8'

const REQUIRED_REQUIREMENT_FIELDS = [
  'expectedInvariant',
  'existingEvidence',
  'finalValidationRequired',
  'id',
  'invariant',
  'releaseReadyClaim',
  'releaseRisk',
  'requiredProof',
  'scope',
  'sourcePaths',
  'status',
  'stopConditions',
  'validationCommands',
]
const REQUIRED_AGGREGATE_FIELDS = [
  'autoCloseAutoBlockApproved',
  'currentStatus',
  'defaultGoApproved',
  'defaultResolverApproved',
  'fallbackDeletionApproved',
  'fullTextBoundaryChanged',
  'hiddenSchedulerApproved',
  'nativeWorkPerformed',
  'npmPublished',
  'packageVersionChanged',
  'ready',
  'releaseReadyClaim',
  'releaseTarget',
  'requiredInvariants',
  'requirementIds',
  'requirements',
  'runtimeBehaviorChanged',
  'schemaVersion',
  'secondPlatformApproved',
  'signingApproved',
  'slice',
  'statuses',
  'stopConditions',
  'tagCreated',
  'theme',
  'validationCaveat',
  'workerSpawnsWorkerApproved',
]
const REQUIRED_DOC = [
  '## Slice 7 — Task/report/PlanRun release reliability burn-down',
  'Current status: `mapped-not-proven`.',
  'Slice 7 maps task/report/PlanRun release reliability requirements only; it does not fix runtime behavior, does not prove release readiness, and does not approve tag/release/package/default-Go/native/signing/second-platform/fallback-deletion work.',
  '`tests/fixtures/kernel/v0637/taskReportPlanRunReliability.cjs`',
  '`tests/suites/go-kernel-v0637-v05-task-report-planrun-reliability.cjs`',
  '### Slice 7 reliability policy',
  '### Slice 7 reliability matrix',
  '| Requirement | Status | Expected invariant | Existing evidence | Required final proof / validation | Release risk / STOP gates |',
  '### Slice 7 validation expectations',
]
const REQUIRED_DOC_TERMS = [
  'Worker completion requires `report_done`/`report_blocked`; natural-language-only completion is not sufficient.',
  'Non-leader reports create TaskReport/action request only; no auto-close/auto-block mutation.',
  'Leader explicitly reviews and closes/blocks/unblocks tasks.',
  'Idle/offline/error owner with open assigned task and no report remains visible/nudgeable.',
  '`agentteam_receive` is mailbox full-text/read boundary.',
  '`agentteam_task action=report` is TaskReport full-text boundary.',
  'Compact task/history/panel surfaces do not leak full message/report body.',
  'PlanRun approve does not auto-create extra tasks beyond intended advance; report_done waits for leader review.',
  'PlanRun blocked/question pauses compactly and does not autopilot downstream work.',
  'Peer reports/inform messages do not drive planner/implementer work without leader assignment.',
  'Worker-to-worker delegation/broadcast remains bounded by leader rules.',
]
const FORBIDDEN_OVERCLAIMS = [
  'release-ready status is proven',
  'release ready status is proven',
  'v0.5 release-ready',
  'v0.5 release ready',
  'release can ship',
  'ready for release',
  'hidden autopilot approved',
  'hidden scheduler approved',
  'worker-spawns-worker approved',
  'full-text leak allowed',
  'auto-close approved',
  'auto-block approved',
  'p95 gate passed',
  'p95 gates passed',
  'tag was created',
  'tag was pushed',
  'npm version completed',
  'npm publish completed',
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'native helper delivery is complete',
  'native package delivery is complete',
  'package release is approved',
  'install source is approved',
  'release asset is approved',
  'signing is approved',
  'cosign is approved',
  'SLSA is approved',
  'security attestation is approved',
  'second-platform support is approved',
  'second platform support is approved',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
]
const ROOT_FORBIDDEN_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
]
const FORBIDDEN_ARTIFACT = /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig)$/i
const FORBIDDEN_GENERATED_RECORD = /(?:^|\/)(?:artifact-index|generated-manifest|checksum|checksums|sha256sums|provenance|attestation|hosted-observation|raw-record|raw-hosted|release-bundle|release-asset|signature-material)(?:[-_.\/]|$)/i
const APPROVED_EMBEDDED_NATIVE_PREFIX = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'
const ALLOWED_REVIEW_RECORDS = new Set([
  '.github/workflows/go-helper-review-artifact.yml',
  'scripts/build-go-helper-artifact.cjs',
  'scripts/lib/go-helper-artifact-builder.cjs',
  'scripts/lib/go-helper-artifact-verifier.cjs',
  'scripts/lib/go-helper-clean-install-proof.cjs',
  'scripts/lib/go-helper-hosted-observation-record.cjs',
  'scripts/lib/pi-extension-install-load-proof.cjs',
  'scripts/verify-go-helper-artifact.cjs',
  'scripts/verify-go-helper-clean-install-proof.cjs',
  'scripts/verify-go-helper-hosted-observation-record.cjs',
  'scripts/verify-pi-extension-install-load.cjs',
])

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
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

function assertReliabilityShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(taskReportPlanRunReliability)), taskReportPlanRunReliability, 'reliability fixture should be plain deterministic data')
  assert.deepEqual(Object.keys(taskReportPlanRunReliability).sort(), REQUIRED_AGGREGATE_FIELDS.sort(), 'reliability aggregate should expose only expected fields')
  assert.equal(taskReportPlanRunReliability.schemaVersion, TASK_REPORT_PLANRUN_RELIABILITY_SCHEMA_VERSION)
  assert.equal(taskReportPlanRunReliability.theme, TASK_REPORT_PLANRUN_RELIABILITY_THEME)
  assert.equal(taskReportPlanRunReliability.releaseTarget, V05_RELEASE_TARGET)
  assert.equal(taskReportPlanRunReliability.slice, TASK_REPORT_PLANRUN_RELIABILITY_SLICE)
  assert.equal(taskReportPlanRunReliability.currentStatus, MAPPED_NOT_PROVEN)
  assert.equal(taskReportPlanRunReliability.ready, false)
  assert.equal(taskReportPlanRunReliability.releaseReadyClaim, false)
  assert.equal(taskReportPlanRunReliability.runtimeBehaviorChanged, false)
  assert.equal(taskReportPlanRunReliability.packageVersionChanged, false)
  assert.equal(taskReportPlanRunReliability.tagCreated, false)
  assert.equal(taskReportPlanRunReliability.npmPublished, false)
  assert.equal(taskReportPlanRunReliability.nativeWorkPerformed, false)
  assert.equal(taskReportPlanRunReliability.defaultGoApproved, false)
  assert.equal(taskReportPlanRunReliability.defaultResolverApproved, false)
  assert.equal(taskReportPlanRunReliability.fallbackDeletionApproved, false)
  assert.equal(taskReportPlanRunReliability.signingApproved, false)
  assert.equal(taskReportPlanRunReliability.secondPlatformApproved, false)
  assert.equal(taskReportPlanRunReliability.hiddenSchedulerApproved, false)
  assert.equal(taskReportPlanRunReliability.workerSpawnsWorkerApproved, false)
  assert.equal(taskReportPlanRunReliability.fullTextBoundaryChanged, false)
  assert.equal(taskReportPlanRunReliability.autoCloseAutoBlockApproved, false)
  assert.deepEqual(taskReportPlanRunReliability.requiredInvariants, REQUIRED_INVARIANTS)
  assert.deepEqual(taskReportPlanRunReliability.requirementIds, REQUIREMENT_IDS)
  assert.deepEqual(taskReportPlanRunReliability.statuses, RELIABILITY_STATUSES)
  assert.deepEqual(taskReportPlanRunReliability.requirements, taskReportPlanRunRequirements)
  assert.deepEqual(taskReportPlanRunReliability.stopConditions, COMMON_STOP_CONDITIONS)
  assertIncludes(taskReportPlanRunReliability.validationCaveat, 'does not fix runtime behavior', 'validation caveat')
}

function assertRequirements(root) {
  assert.deepEqual(taskReportPlanRunRequirements.map(row => row.id), REQUIREMENT_IDS, 'requirement IDs should be deterministic and ordered')
  assert.equal(new Set(taskReportPlanRunRequirements.map(row => row.id)).size, REQUIREMENT_IDS.length, 'requirement IDs should be unique')
  const invariants = new Set(taskReportPlanRunRequirements.map(row => row.invariant))
  for (const invariant of REQUIRED_INVARIANTS) assert.equal(invariants.has(invariant), true, `requirements should cover ${invariant}`)
  for (const row of taskReportPlanRunRequirements) {
    assert.deepEqual(Object.keys(row).sort(), REQUIRED_REQUIREMENT_FIELDS.sort(), `${row.id} should expose required fields only`)
    assert.ok(RELIABILITY_STATUSES.includes(row.status), `${row.id} status should be allowed`)
    assert.equal(row.status === GREEN_WITH_FINAL_VALIDATION_REQUIRED ? row.finalValidationRequired : true, true, `${row.id} green status must still require final validation`)
    assert.equal(row.releaseReadyClaim, false, `${row.id} must not claim release readiness`)
    assert.equal(row.finalValidationRequired, true, `${row.id} should require final validation`)
    assert.ok(REQUIRED_INVARIANTS.includes(row.invariant), `${row.id} invariant should be required`)
    assert.ok(row.scope.length > 40, `${row.id} scope should be meaningful`)
    assert.ok(row.expectedInvariant.length > 70, `${row.id} expected invariant should be meaningful`)
    assert.equal(Array.isArray(row.sourcePaths), true, `${row.id} source paths`)
    assert.ok(row.sourcePaths.length >= 3, `${row.id} should list source paths`)
    for (const rel of row.sourcePaths) {
      assert.equal(typeof rel, 'string', `${row.id} source path should be string`)
      assert.equal(exists(root, rel), true, `${row.id} source path should exist: ${rel}`)
      assert.equal(/^(app|tools|runtime|teamPanel|state|tests|docs|workerTurnPrompt\.ts)/.test(rel), true, `${row.id} source path should stay within mapped source/docs/tests areas: ${rel}`)
    }
    assert.equal(Array.isArray(row.existingEvidence), true, `${row.id} evidence`)
    assert.ok(row.existingEvidence.length >= 2, `${row.id} should cite existing evidence`)
    assert.ok(row.existingEvidence.some(item => item.startsWith('tests/') || item.startsWith('docs/')), `${row.id} should cite tests/docs evidence`)
    assert.ok(row.releaseRisk.length > 50, `${row.id} release risk should be meaningful`)
    assert.ok(row.requiredProof.length > 60, `${row.id} required proof should be meaningful`)
    assert.match(row.requiredProof, /manual RC|Keep|final|proof|passing|validation/i, `${row.id} required proof should name remaining proof`)
    assert.equal(Array.isArray(row.validationCommands), true, `${row.id} validation commands`)
    assert.ok(row.validationCommands.length >= 2, `${row.id} should list validation commands`)
    assert.equal(Array.isArray(row.stopConditions), true, `${row.id} STOP gates`)
    assert.ok(row.stopConditions.length > COMMON_STOP_CONDITIONS.length, `${row.id} should include specific STOP gate`)
    assert.ok(row.stopConditions.every(condition => /^STOP\b/.test(condition)), `${row.id} stop conditions should be explicit STOP gates`)
    assert.match(row.stopConditions.join('\n'), /full|report_done|report_blocked|autopilot|scheduler|worker-spawns-worker|tag|npm|native|default-Go|runtime/i, `${row.id} should include release reliability STOP gates`)
    const rowText = JSON.stringify(row)
    for (const forbidden of FORBIDDEN_OVERCLAIMS) assert.equal(rowText.includes(forbidden), false, `${row.id} must not overclaim: ${forbidden}`)
  }
}

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_DOC_TERMS) assertIncludes(doc, expected, DOC)
  for (const id of REQUIREMENT_IDS) assertIncludes(doc, `\`${id}\``, DOC)
  for (const invariant of REQUIRED_INVARIANTS) assertIncludes(doc, invariant, DOC)
  for (const forbidden of FORBIDDEN_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/\brelease can ship\b|\bready for release\b|\brelease-ready status is proven\b|\bauto-close approved\b|\bauto-block approved\b/i.test(doc), false, `${DOC} must not claim release readiness or approve auto mutation`)
  assert.match(doc, /does not fix runtime behavior/i)
  assert.match(doc, /mapped-not-proven/i)
  assert.match(doc, /Do not proceed beyond Slice 8/i)
  assert.match(doc, /natural-language-only completion is not sufficient/i)
  assert.match(doc, /no auto-close\/auto-block mutation/i)
  assert.match(doc, /does not autopilot downstream work/i)
}

function assertPackageRuntimeInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.type, 'module')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'])
  for (const field of ['main', 'exports', 'types']) assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)
  assert.deepEqual(Object.keys(packageJson.dependencies || {}).sort(), [], 'dependencies must remain empty or absent')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish', 'prepack', 'postpack']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define lifecycle script ${lifecycle}`)
  }
  for (const [scriptName, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+version\b/i.test(command), false, `${scriptName} must not run npm version`)
    assert.equal(/npm\s+publish\b/i.test(command), false, `${scriptName} must not run npm publish`)
    if (/npm\s+pack\b/i.test(command)) {
      assert.match(command, /--dry-run\b/, `${scriptName} may only run npm pack as dry-run`)
      assert.match(command, /--ignore-scripts\b/, `${scriptName} npm pack dry-run must ignore scripts`)
    }
    assert.equal(/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild\b/i.test(command), false, `${scriptName} must not build/download native helper`)
  }
}

function assertFixtureNotUsedByProduction(root) {
  const productionRoots = ['api', 'app', 'commands', 'core', 'hooks', 'runtime', 'state', 'teamPanel', 'tmux', 'tools', 'adapters']
  const productionRootFiles = ['index.ts', 'agents.ts', 'policy.ts', 'renderers.ts', 'session.ts', 'teamPanel.ts', 'config.ts', 'workerTurnPrompt.ts']
  const productionFiles = []
  for (const rel of productionRootFiles) if (exists(root, rel)) productionFiles.push(path.join(root, rel))
  for (const rel of productionRoots) {
    const full = path.join(root, rel)
    if (fs.existsSync(full)) walkFiles(full, productionFiles)
  }
  for (const file of productionFiles.filter(file => /\.(?:ts|js|cjs|mjs)$/.test(file))) {
    const source = fs.readFileSync(file, 'utf8')
    assert.equal(source.includes('taskReportPlanRunReliability'), false, `${toRel(root, file)} must not import/read Slice 7 reliability fixture`)
    assert.equal(source.includes('taskReportPlanRunRequirements'), false, `${toRel(root, file)} must not import/read Slice 7 reliability rows`)
    assert.equal(source.includes('tests/fixtures/kernel/v0637/taskReportPlanRunReliability.cjs'), false, `${toRel(root, file)} must not import/read Slice 7 fixture path`)
  }
}

function assertArtifactInvariants(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain pi-agentteam temp tarballs')
  const forbiddenArtifacts = []
  const forbiddenRecords = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX) && !rel.startsWith('docs/') && !rel.startsWith('tests/') && !ALLOWED_REVIEW_RECORDS.has(rel) && FORBIDDEN_GENERATED_RECORD.test(rel)) forbiddenRecords.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain unapproved checked-in native/archive/signing/release artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain unapproved generated manifests/checksums/provenance/attestation/raw hosted/release records outside docs/tests/review helper areas')
}

function assertGitignore(root) {
  const gitignore = read(root, '.gitignore')
  assertIncludes(gitignore, `!${DOC}`, '.gitignore')
}

function assertSliceFiles(root) {
  for (const rel of [DOC, FIXTURE, SUITE, P0_LEDGER_FIXTURE, P0_LEDGER_SUITE, BASELINE_FIXTURE, BASELINE_SUITE, P95_FIXTURE, P95_SUITE, HOT_PATH_FIXTURE, HOT_PATH_SUITE, MANUAL_RC_FIXTURE, MANUAL_RC_SUITE, VALIDATION_FIXTURE, VALIDATION_SUITE, FINAL_CHECKPOINT_FIXTURE]) assert.equal(exists(root, rel), true, `${rel} should exist`)
  assert.ok(HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES.includes(FINAL_CHECKPOINT_SUITE), `${FINAL_CHECKPOINT_SUITE} should be accounted for by Step5C deletion evidence`)
  assert.equal(exists(root, FINAL_CHECKPOINT_SUITE), false, `${FINAL_CHECKPOINT_SUITE} should remain absent after Step5C deletion`)
}

module.exports = {
  name: 'Go kernel v0.6.37 v0.5 task/report/PlanRun reliability',
  async run(env) {
    const root = env.helpers.extRoot
    assertSliceFiles(root)
    assertReliabilityShape(root)
    assertRequirements(root)
    assertDoc(root)
    assertPackageRuntimeInvariants(root)
    assertFixtureNotUsedByProduction(root)
    assertArtifactInvariants(root)
    assertGitignore(root)
  },
}
