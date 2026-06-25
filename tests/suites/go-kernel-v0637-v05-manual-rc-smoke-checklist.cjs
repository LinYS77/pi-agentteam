const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  COMMON_EVIDENCE_POLICY,
  COMMON_PRECONDITIONS,
  COMMON_STOP_CONDITIONS,
  DEFINED_NOT_EXECUTED,
  MANUAL_RC_SMOKE_SCHEMA_VERSION,
  MANUAL_RC_SMOKE_SLICE,
  MANUAL_RC_SMOKE_THEME,
  REQUIRED_COVERAGE,
  STEP_IDS,
  V05_RELEASE_TARGET,
  manualRcSmokeChecklist,
  manualRcSmokeSteps,
} = require('../fixtures/kernel/v0637/manualRcSmokeChecklist.cjs')

const DOC = 'docs/perf/v0.6.37-v0.5-release-readiness-burndown.md'
const FIXTURE = 'tests/fixtures/kernel/v0637/manualRcSmokeChecklist.cjs'
const SUITE = 'tests/suites/go-kernel-v0637-v05-manual-rc-smoke-checklist.cjs'
const P0_LEDGER_FIXTURE = 'tests/fixtures/kernel/v0637/p0ReadinessLedger.cjs'
const P0_LEDGER_SUITE = 'tests/suites/go-kernel-v0637-v05-p0-readiness-ledger.cjs'
const BASELINE_FIXTURE = 'tests/fixtures/kernel/v0637/performanceBaselineInventory.cjs'
const BASELINE_SUITE = 'tests/suites/go-kernel-v0637-v05-performance-baseline-inventory.cjs'
const P95_FIXTURE = 'tests/fixtures/kernel/v0637/p95ReleaseGates.cjs'
const P95_SUITE = 'tests/suites/go-kernel-v0637-v05-p95-release-gates.cjs'
const HOT_PATH_FIXTURE = 'tests/fixtures/kernel/v0637/hotPathBurnDownCandidates.cjs'
const HOT_PATH_SUITE = 'tests/suites/go-kernel-v0637-v05-hot-path-burndown-candidates.cjs'
const PACKAGE_VERSION = '0.6.8'

const REQUIRED_STEP_FIELDS = [
  'cleanupSafetyNotes',
  'coverage',
  'evidenceToRecord',
  'executedInThisSlice',
  'expectedObservation',
  'id',
  'preconditions',
  'purpose',
  'releaseReadyClaim',
  'safeAction',
  'status',
  'stopCondition',
]
const REQUIRED_AGGREGATE_FIELDS = [
  'commonPreconditions',
  'currentStatus',
  'defaultGoApproved',
  'defaultResolverApproved',
  'evidencePolicy',
  'executedInThisSlice',
  'fallbackDeletionApproved',
  'nativeWorkPerformed',
  'npmPublished',
  'packageVersionChanged',
  'provesP95Pass',
  'provesReleaseReady',
  'rawFullTextEvidenceAllowedByDefault',
  'ready',
  'realUserStateAllowedWithoutBackup',
  'releaseReadyClaim',
  'releaseTarget',
  'requiredCoverage',
  'runtimeBehaviorChanged',
  'schemaVersion',
  'secondPlatformApproved',
  'signingApproved',
  'slice',
  'smokePassed',
  'stepIds',
  'steps',
  'stopConditions',
  'tagCreated',
  'theme',
  'validationCaveat',
]
const REQUIRED_DOC = [
  '## Slice 5 — Manual RC smoke checklist',
  'Current status: `defined-not-executed`.',
  'Slice 5 defines a reproducible manual RC smoke checklist only; it does not execute the smoke, does not claim pass/fail, does not prove release readiness, and does not approve tag/release/package/default-Go/native/signing/second-platform/fallback-deletion work.',
  '`tests/fixtures/kernel/v0637/manualRcSmokeChecklist.cjs`',
  '`tests/suites/go-kernel-v0637-v05-manual-rc-smoke-checklist.cjs`',
  '### Slice 5 safety and evidence policy',
  '### Slice 5 manual RC smoke checklist',
  '| Step | Purpose | Safe command/action | Expected observation | Evidence to record | Cleanup / STOP |',
  '### Slice 5 validation expectations',
]
const REQUIRED_DOC_TERMS = [
  'clean temporary `PI_AGENTTEAM_HOME`',
  'backed-up existing `PI_AGENTTEAM_HOME`',
  'Do not use real/default user state unless it is backed up first and recorded.',
  'record pass/fail/blocked',
  'Do not check in raw full mailbox/report bodies, screenshots, terminal logs, PI_AGENTTEAM_HOME archives, or raw worker transcripts unless separately approved.',
  '/team config show',
  '/team config init',
  '/team config validate',
  '/team config migrate --dry-run',
  'Chinese-only',
  'marker-only',
  'visible tmux worker panes',
  'agentteam_task action=create',
  'agentteam_send type=assignment',
  'agentteam_receive',
  'report_done',
  'report_blocked',
  'waiting_review',
  'pause-on-blocked/question',
  '`/team` attached/global refresh',
  'does not mark mailbox read/delivered',
  'TaskReport full report boundary',
  'legacy `teams/-`',
  'default-go-native-package-tag-release-absence',
]
const FORBIDDEN_OVERCLAIMS = [
  'manual smoke passed',
  'smoke passed',
  'manual RC passed',
  'manual smoke executed',
  'smoke executed',
  'release-ready status is proven',
  'release ready status is proven',
  'v0.5 release-ready',
  'v0.5 release ready',
  'release can ship',
  'ready for release',
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
const DISALLOWED_STATUSES = /\b(?:passed|pass|release-ready|release ready|done|complete|completed|approved)\b/i
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

function assertChecklistShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(manualRcSmokeChecklist)), manualRcSmokeChecklist, 'manual RC smoke checklist should be plain deterministic data')
  assert.deepEqual(Object.keys(manualRcSmokeChecklist).sort(), REQUIRED_AGGREGATE_FIELDS.sort(), 'manual RC aggregate should expose only expected fields')
  assert.equal(manualRcSmokeChecklist.schemaVersion, MANUAL_RC_SMOKE_SCHEMA_VERSION)
  assert.equal(manualRcSmokeChecklist.theme, MANUAL_RC_SMOKE_THEME)
  assert.equal(manualRcSmokeChecklist.releaseTarget, V05_RELEASE_TARGET)
  assert.equal(manualRcSmokeChecklist.slice, MANUAL_RC_SMOKE_SLICE)
  assert.equal(manualRcSmokeChecklist.currentStatus, DEFINED_NOT_EXECUTED)
  assert.equal(manualRcSmokeChecklist.ready, false)
  assert.equal(manualRcSmokeChecklist.executedInThisSlice, false)
  assert.equal(manualRcSmokeChecklist.smokePassed, false)
  assert.equal(manualRcSmokeChecklist.provesReleaseReady, false)
  assert.equal(manualRcSmokeChecklist.provesP95Pass, false)
  assert.equal(manualRcSmokeChecklist.releaseReadyClaim, false)
  assert.equal(manualRcSmokeChecklist.runtimeBehaviorChanged, false)
  assert.equal(manualRcSmokeChecklist.packageVersionChanged, false)
  assert.equal(manualRcSmokeChecklist.tagCreated, false)
  assert.equal(manualRcSmokeChecklist.npmPublished, false)
  assert.equal(manualRcSmokeChecklist.nativeWorkPerformed, false)
  assert.equal(manualRcSmokeChecklist.defaultGoApproved, false)
  assert.equal(manualRcSmokeChecklist.defaultResolverApproved, false)
  assert.equal(manualRcSmokeChecklist.fallbackDeletionApproved, false)
  assert.equal(manualRcSmokeChecklist.signingApproved, false)
  assert.equal(manualRcSmokeChecklist.secondPlatformApproved, false)
  assert.equal(manualRcSmokeChecklist.realUserStateAllowedWithoutBackup, false)
  assert.equal(manualRcSmokeChecklist.rawFullTextEvidenceAllowedByDefault, false)
  assert.deepEqual(manualRcSmokeChecklist.requiredCoverage, REQUIRED_COVERAGE)
  assert.deepEqual(manualRcSmokeChecklist.stepIds, STEP_IDS)
  assert.deepEqual(manualRcSmokeChecklist.steps, manualRcSmokeSteps)
  assert.deepEqual(manualRcSmokeChecklist.evidencePolicy, COMMON_EVIDENCE_POLICY)
  assert.deepEqual(manualRcSmokeChecklist.commonPreconditions, COMMON_PRECONDITIONS)
  assert.deepEqual(manualRcSmokeChecklist.stopConditions, COMMON_STOP_CONDITIONS)
  assertIncludes(manualRcSmokeChecklist.validationCaveat, 'does not execute smoke', 'validation caveat')
}

function assertSteps(root) {
  assert.deepEqual(manualRcSmokeSteps.map(step => step.id), STEP_IDS, 'step IDs should be deterministic and ordered')
  assert.equal(new Set(manualRcSmokeSteps.map(step => step.id)).size, STEP_IDS.length, 'step IDs should be unique')
  const coverage = new Set(manualRcSmokeSteps.flatMap(step => step.coverage))
  for (const required of REQUIRED_COVERAGE) assert.equal(coverage.has(required), true, `checklist should cover ${required}`)
  for (const step of manualRcSmokeSteps) {
    assert.deepEqual(Object.keys(step).sort(), REQUIRED_STEP_FIELDS.sort(), `${step.id} should expose required step fields only`)
    assert.equal(step.status, DEFINED_NOT_EXECUTED, `${step.id} should be defined-not-executed`)
    assert.equal(DISALLOWED_STATUSES.test(step.status), false, `${step.id} status must not imply execution/pass/release readiness`)
    assert.equal(Array.isArray(step.coverage), true, `${step.id} coverage`)
    assert.ok(step.coverage.length >= 1, `${step.id} should list coverage tags`)
    for (const item of step.coverage) assert.ok(REQUIRED_COVERAGE.includes(item), `${step.id} coverage tag should be known: ${item}`)
    assert.ok(step.purpose.length > 40, `${step.id} purpose should be meaningful`)
    assert.equal(Array.isArray(step.preconditions), true, `${step.id} preconditions`)
    assert.ok(step.preconditions.length >= COMMON_PRECONDITIONS.length + 1, `${step.id} should include common and specific preconditions`)
    assert.ok(step.preconditions.join('\n').includes('PI_AGENTTEAM_HOME'), `${step.id} should include state safety precondition`)
    assert.ok(step.safeAction.length > 60, `${step.id} safe action should be meaningful`)
    assert.match(step.safeAction, /`|agentteam_|\/team|PI_AGENTTEAM_HOME|PlanRun|rm -rf|tmux|git status|safe/i, `${step.id} should describe a concrete safe action`)
    assert.ok(step.expectedObservation.length > 60, `${step.id} expected observation should be meaningful`)
    assert.equal(Array.isArray(step.evidenceToRecord), true, `${step.id} evidence`) 
    assert.ok(step.evidenceToRecord.length >= COMMON_EVIDENCE_POLICY.length + 1, `${step.id} should include common and specific evidence policy`)
    assert.match(step.evidenceToRecord.join('\n'), /pass, fail, or blocked|Do not check in raw full MailboxMessage\.text|Manual smoke complements/i, `${step.id} should include evidence capture policy`)
    assert.ok(step.cleanupSafetyNotes.length > 40, `${step.id} cleanup notes should be meaningful`)
    assert.ok(step.stopCondition.startsWith('STOP '), `${step.id} stop condition should be explicit`)
    assert.equal(step.releaseReadyClaim, false, `${step.id} must not claim release readiness`)
    assert.equal(step.executedInThisSlice, false, `${step.id} must not be executed in Slice 5`)
    const stepText = JSON.stringify(step)
    for (const forbidden of FORBIDDEN_OVERCLAIMS) assert.equal(stepText.includes(forbidden), false, `${step.id} must not overclaim: ${forbidden}`)
  }
}

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_DOC_TERMS) assertIncludes(doc, expected, DOC)
  for (const id of STEP_IDS) assertIncludes(doc, `\`${id}\``, DOC)
  for (const coverage of REQUIRED_COVERAGE) assertIncludes(doc, coverage, DOC)
  for (const forbidden of FORBIDDEN_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/\bsmoke passed\b|\bmanual smoke passed\b|\bmanual RC passed\b|\brelease can ship\b|\bready for release\b/i.test(doc), false, `${DOC} must not imply smoke pass or release readiness`)
  assert.match(doc, /does not execute the smoke/i)
  assert.match(doc, /defined-not-executed/i)
  assert.match(doc, /Do not proceed beyond Slice 8/i)
  assert.match(doc, /clean temporary `PI_AGENTTEAM_HOME`/i)
  assert.match(doc, /backed up first and recorded/i)
  assert.match(doc, /manual RC smoke complements static tests and deterministic benches; it does not replace Slice 3 p95 evidence/i)
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
  const productionRootFiles = ['index.ts', 'agents.ts', 'policy.ts', 'renderers.ts', 'session.ts', 'teamPanel.ts', 'config.ts']
  const productionFiles = []
  for (const rel of productionRootFiles) if (exists(root, rel)) productionFiles.push(path.join(root, rel))
  for (const rel of productionRoots) {
    const full = path.join(root, rel)
    if (fs.existsSync(full)) walkFiles(full, productionFiles)
  }
  for (const file of productionFiles.filter(file => /\.(?:ts|js|cjs|mjs)$/.test(file))) {
    const source = fs.readFileSync(file, 'utf8')
    assert.equal(source.includes('manualRcSmokeChecklist'), false, `${toRel(root, file)} must not import/read Slice 5 manual RC checklist`)
    assert.equal(source.includes('manualRcSmokeSteps'), false, `${toRel(root, file)} must not import/read Slice 5 manual RC steps`)
    assert.equal(source.includes('tests/fixtures/kernel/v0637/manualRcSmokeChecklist.cjs'), false, `${toRel(root, file)} must not import/read Slice 5 fixture path`)
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
  for (const rel of [DOC, FIXTURE, SUITE, P0_LEDGER_FIXTURE, P0_LEDGER_SUITE, BASELINE_FIXTURE, BASELINE_SUITE, P95_FIXTURE, P95_SUITE, HOT_PATH_FIXTURE, HOT_PATH_SUITE]) assert.equal(exists(root, rel), true, `${rel} should exist`)
}

module.exports = {
  name: 'Go kernel v0.6.37 v0.5 manual RC smoke checklist',
  async run(env) {
    const root = env.helpers.extRoot
    assertSliceFiles(root)
    assertChecklistShape(root)
    assertSteps(root)
    assertDoc(root)
    assertPackageRuntimeInvariants(root)
    assertFixtureNotUsedByProduction(root)
    assertArtifactInvariants(root)
    assertGitignore(root)
  },
}
