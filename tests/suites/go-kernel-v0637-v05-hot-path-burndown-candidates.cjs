const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  CANDIDATE_IDS,
  COMMON_STOP_CONDITIONS,
  HOT_PATH_BURN_DOWN_SCHEMA_VERSION,
  HOT_PATH_BURN_DOWN_SLICE,
  HOT_PATH_BURN_DOWN_THEME,
  PROPOSED_NOT_STARTED,
  REQUIRED_SEAMS,
  V05_RELEASE_TARGET,
  hotPathBurnDownCandidates,
  hotPathBurnDownPlan,
} = require('../fixtures/kernel/v0637/hotPathBurnDownCandidates.cjs')

const DOC = 'docs/perf/v0.6.37-v0.5-release-readiness-burndown.md'
const FIXTURE = 'tests/fixtures/kernel/v0637/hotPathBurnDownCandidates.cjs'
const SUITE = 'tests/suites/go-kernel-v0637-v05-hot-path-burndown-candidates.cjs'
const P0_LEDGER_FIXTURE = 'tests/fixtures/kernel/v0637/p0ReadinessLedger.cjs'
const P0_LEDGER_SUITE = 'tests/suites/go-kernel-v0637-v05-p0-readiness-ledger.cjs'
const BASELINE_FIXTURE = 'tests/fixtures/kernel/v0637/performanceBaselineInventory.cjs'
const BASELINE_SUITE = 'tests/suites/go-kernel-v0637-v05-performance-baseline-inventory.cjs'
const P95_FIXTURE = 'tests/fixtures/kernel/v0637/p95ReleaseGates.cjs'
const P95_SUITE = 'tests/suites/go-kernel-v0637-v05-p95-release-gates.cjs'
const PACKAGE_VERSION = '0.6.8'

const REQUIRED_CANDIDATE_FIELDS = [
  'affectedSeam',
  'boundaryPreservation',
  'expectedImpact',
  'expectedSignal',
  'firstImplementationCandidate',
  'id',
  'implementationSketch',
  'p95GateIds',
  'p95ImprovementClaimed',
  'priority',
  'rank',
  'releaseReadyClaim',
  'requiredCharacterization',
  'risk',
  'runtimeOptimizationApplied',
  'seam',
  'sourcePaths',
  'status',
  'stopConditions',
  'validationCommands',
]
const REQUIRED_AGGREGATE_FIELDS = [
  'candidateIds',
  'candidates',
  'currentStatus',
  'defaultGoApproved',
  'defaultResolverApproved',
  'fallbackDeletionApproved',
  'firstImplementationCandidateId',
  'firstImplementationRationale',
  'fullTextBoundaryChanged',
  'hiddenSchedulerApproved',
  'nativeWorkPerformed',
  'nonGoals',
  'npmPublished',
  'p95ImprovementClaimed',
  'ready',
  'releaseReadyClaim',
  'releaseTarget',
  'requiredSeams',
  'runtimeBehaviorChanged',
  'runtimeOptimizationApplied',
  'schemaVersion',
  'secondPlatformApproved',
  'signingApproved',
  'slice',
  'tagCreated',
  'theme',
  'validationCaveat',
  'workerSpawnsWorkerApproved',
]
const REQUIRED_DOC = [
  '## Slice 4 — Focused hot-path burn-down candidates',
  'Current status: `proposed-not-started`.',
  'Slice 4 ranks and defines focused hot-path burn-down candidates only; it does not implement runtime optimization, does not claim p95 improvement, does not prove release readiness, and does not approve tag/release/package/default-Go/native/signing/second-platform/fallback-deletion work.',
  '`tests/fixtures/kernel/v0637/hotPathBurnDownCandidates.cjs`',
  '`tests/suites/go-kernel-v0637-v05-hot-path-burndown-candidates.cjs`',
  '### Slice 4 candidate policy',
  '### Slice 4 candidate matrix',
  '| Rank | Candidate | Seam / source paths | Expected p95 signal and impact | Risk | Required characterization / validation | STOP gates |',
  '### Slice 4 first implementation recommendation',
  'Recommended first implementation candidate: `panel-unchanged-state-render-suppression`.',
  '### Slice 4 validation expectations',
]
const REQUIRED_DOC_TERMS = [
  'state/read-model compact sidecars and fsStore access',
  'tmux adapter / light reconcile / snapshot reuse',
  'team panel data source/render/cache/fingerprint',
  'task/message/report lifecycle action path',
  'PlanRun/report review progression reliability path',
  'config/bootstrap command path',
  'worker spawn bookkeeping path',
  'hidden scheduler/autopilot',
  'worker-spawns-worker',
  'full-text body reads',
  'TypeScript/pi facade',
  'leader-gated task governance',
]
const FORBIDDEN_OVERCLAIMS = [
  'runtime optimization applied',
  'runtime optimization implemented',
  'p95 improvement achieved',
  'p95 improved',
  'p95 gate passed',
  'p95 gates passed',
  'release-ready status is proven',
  'release ready status is proven',
  'v0.5 release-ready',
  'v0.5 release ready',
  'release can ship',
  'ready for release',
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
const DISALLOWED_STATUSES = /\b(?:implemented|done|passed|pass|release-ready|release ready|approved|complete|completed)\b/i
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

function assertPlanShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(hotPathBurnDownPlan)), hotPathBurnDownPlan, 'hot-path plan should be plain deterministic data')
  assert.deepEqual(Object.keys(hotPathBurnDownPlan).sort(), REQUIRED_AGGREGATE_FIELDS.sort(), 'hot-path aggregate should expose only expected fields')
  assert.equal(hotPathBurnDownPlan.schemaVersion, HOT_PATH_BURN_DOWN_SCHEMA_VERSION)
  assert.equal(hotPathBurnDownPlan.theme, HOT_PATH_BURN_DOWN_THEME)
  assert.equal(hotPathBurnDownPlan.releaseTarget, V05_RELEASE_TARGET)
  assert.equal(hotPathBurnDownPlan.slice, HOT_PATH_BURN_DOWN_SLICE)
  assert.equal(hotPathBurnDownPlan.currentStatus, PROPOSED_NOT_STARTED)
  assert.equal(hotPathBurnDownPlan.ready, false)
  assert.equal(hotPathBurnDownPlan.runtimeBehaviorChanged, false)
  assert.equal(hotPathBurnDownPlan.runtimeOptimizationApplied, false)
  assert.equal(hotPathBurnDownPlan.p95ImprovementClaimed, false)
  assert.equal(hotPathBurnDownPlan.releaseReadyClaim, false)
  assert.equal(hotPathBurnDownPlan.tagCreated, false)
  assert.equal(hotPathBurnDownPlan.npmPublished, false)
  assert.equal(hotPathBurnDownPlan.nativeWorkPerformed, false)
  assert.equal(hotPathBurnDownPlan.defaultGoApproved, false)
  assert.equal(hotPathBurnDownPlan.defaultResolverApproved, false)
  assert.equal(hotPathBurnDownPlan.fallbackDeletionApproved, false)
  assert.equal(hotPathBurnDownPlan.signingApproved, false)
  assert.equal(hotPathBurnDownPlan.secondPlatformApproved, false)
  assert.equal(hotPathBurnDownPlan.hiddenSchedulerApproved, false)
  assert.equal(hotPathBurnDownPlan.workerSpawnsWorkerApproved, false)
  assert.equal(hotPathBurnDownPlan.fullTextBoundaryChanged, false)
  assert.deepEqual(hotPathBurnDownPlan.requiredSeams, REQUIRED_SEAMS)
  assert.deepEqual(hotPathBurnDownPlan.candidateIds, CANDIDATE_IDS)
  assert.deepEqual(hotPathBurnDownPlan.candidates, hotPathBurnDownCandidates)
  assert.equal(hotPathBurnDownPlan.firstImplementationCandidateId, 'panel-unchanged-state-render-suppression')
  assert.match(hotPathBurnDownPlan.firstImplementationRationale, /High|visible|flicker|low/i)
  assert.deepEqual(hotPathBurnDownPlan.nonGoals, COMMON_STOP_CONDITIONS)
  assertIncludes(hotPathBurnDownPlan.validationCaveat, 'candidate matrix only', 'validation caveat')
}

function assertCandidates(root) {
  assert.deepEqual(hotPathBurnDownCandidates.map(candidate => candidate.id), CANDIDATE_IDS, 'candidate IDs should be deterministic and ordered')
  assert.equal(new Set(hotPathBurnDownCandidates.map(candidate => candidate.id)).size, CANDIDATE_IDS.length, 'candidate IDs should be unique')
  assert.equal(hotPathBurnDownCandidates.length >= 6 && hotPathBurnDownCandidates.length <= 9, true, 'Slice 4 should define 6-9 focused candidates')
  assert.deepEqual(hotPathBurnDownCandidates.map(candidate => candidate.rank), [1, 2, 3, 4, 5, 6, 7, 8], 'ranks should be deterministic')
  const seamCoverage = new Set(hotPathBurnDownCandidates.map(candidate => candidate.seam))
  for (const seam of REQUIRED_SEAMS) assert.equal(seamCoverage.has(seam), true, `candidate matrix should cover required seam ${seam}`)
  assert.equal(hotPathBurnDownCandidates.filter(candidate => candidate.firstImplementationCandidate).length, 1, 'exactly one first implementation candidate should be marked')
  assert.equal(hotPathBurnDownCandidates.find(candidate => candidate.firstImplementationCandidate).id, hotPathBurnDownPlan.firstImplementationCandidateId)

  for (const candidate of hotPathBurnDownCandidates) {
    assert.deepEqual(Object.keys(candidate).sort(), REQUIRED_CANDIDATE_FIELDS.sort(), `${candidate.id} should expose required candidate fields only`)
    assert.equal(typeof candidate.id, 'string', `${candidate.id} id`)
    assert.equal(Number.isInteger(candidate.rank), true, `${candidate.id} rank`)
    assert.match(candidate.priority, /^P[123]$/, `${candidate.id} priority`)
    assert.equal(candidate.status, PROPOSED_NOT_STARTED, `${candidate.id} should be proposed/not-started`)
    assert.equal(DISALLOWED_STATUSES.test(candidate.status), false, `${candidate.id} status must not imply implementation/pass/release readiness`)
    assert.ok(REQUIRED_SEAMS.includes(candidate.seam), `${candidate.id} seam should be known`)
    assert.ok(candidate.affectedSeam.length > 40, `${candidate.id} affected seam should be meaningful`)
    assert.equal(Array.isArray(candidate.sourcePaths), true, `${candidate.id} source paths`)
    assert.ok(candidate.sourcePaths.length >= 3, `${candidate.id} should cite source paths`)
    for (const rel of candidate.sourcePaths) {
      assert.equal(typeof rel, 'string', `${candidate.id} source path should be string`)
      assert.equal(exists(root, rel), true, `${candidate.id} source path should exist: ${rel}`)
      assert.equal(/^(state|teamPanel|tmux|app|tools|commands|adapters|runtime|tests|config\.ts|config\.example\.json)/.test(rel), true, `${candidate.id} source path should stay within mapped docs/tests/source areas: ${rel}`)
    }
    assert.equal(Array.isArray(candidate.p95GateIds), true, `${candidate.id} p95 gate linkage`)
    assert.ok(candidate.p95GateIds.length >= 1, `${candidate.id} should link to Slice 3 gate or future evidence gate`)
    assert.ok(candidate.p95GateIds.every(id => typeof id === 'string' && (id.includes('-p95') || id.includes('snapshot-policy') || id.includes('request-render') || id.includes('debounce') || id.includes('tmux-command-count') || id.startsWith('future-evidence-gate:'))), `${candidate.id} should link to p95/evidence gate ids`)
    assert.ok(candidate.expectedSignal.length > 60, `${candidate.id} expected signal should be meaningful`)
    assert.match(candidate.expectedSignal, /p95|requestRender|snapshot|lockWaitMs|evidence|timing|gate/i, `${candidate.id} expected signal should mention measurable signal`)
    assert.ok(candidate.expectedImpact.length > 50, `${candidate.id} expected impact should be meaningful`)
    assert.match(candidate.expectedImpact, /impact|visible|latency|throughput|reliability|readiness|responsiveness/i, `${candidate.id} expected impact should be explicit`)
    assert.ok(candidate.risk.length > 40, `${candidate.id} risk should be meaningful`)
    assert.match(candidate.risk, /risk/i, `${candidate.id} risk should name risk`)
    assert.ok(candidate.implementationSketch.length > 60, `${candidate.id} implementation sketch should be meaningful`)
    assert.match(candidate.implementationSketch, /Later implementation|Later work|future|first add|characterization/i, `${candidate.id} should not implement now`)
    assert.equal(Array.isArray(candidate.requiredCharacterization), true, `${candidate.id} required tests`)
    assert.ok(candidate.requiredCharacterization.length >= 2, `${candidate.id} should require characterization`) 
    assert.equal(Array.isArray(candidate.validationCommands), true, `${candidate.id} validation commands`)
    assert.ok(candidate.validationCommands.length >= 2, `${candidate.id} should list validation commands`)
    assert.equal(Array.isArray(candidate.stopConditions), true, `${candidate.id} STOP gates`)
    assert.ok(candidate.stopConditions.length > COMMON_STOP_CONDITIONS.length, `${candidate.id} should include candidate-specific STOP gates`)
    assert.ok(candidate.stopConditions.every(condition => /^STOP\b/.test(condition)), `${candidate.id} stop conditions should be explicit STOP gates`)
    assert.match(candidate.stopConditions.join('\n'), /full|governance|runtime|tag|npm|native|default-Go|scheduler|worker-spawns-worker/i, `${candidate.id} should carry global STOP gates`)
    assert.ok(candidate.boundaryPreservation.length > 80, `${candidate.id} boundary preservation should be meaningful`)
    assert.match(candidate.boundaryPreservation, /TypeScript\/pi facade/i, `${candidate.id} should preserve TypeScript/pi facade`)
    assert.match(candidate.boundaryPreservation, /governance|full-text|receive|report|compact|task/i, `${candidate.id} should preserve governance/full-text boundaries`)
    assert.equal(candidate.releaseReadyClaim, false, `${candidate.id} must not claim release readiness`)
    assert.equal(candidate.runtimeOptimizationApplied, false, `${candidate.id} must not apply runtime optimization`)
    assert.equal(candidate.p95ImprovementClaimed, false, `${candidate.id} must not claim p95 improvement`)
    const candidateText = JSON.stringify(candidate)
    for (const forbidden of FORBIDDEN_OVERCLAIMS) assert.equal(candidateText.includes(forbidden), false, `${candidate.id} must not overclaim: ${forbidden}`)
  }
}

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_DOC_TERMS) assertIncludes(doc, expected, DOC)
  for (const id of CANDIDATE_IDS) assertIncludes(doc, `\`${id}\``, DOC)
  for (const seam of REQUIRED_SEAMS) assertIncludes(doc, seam, DOC)
  for (const forbidden of FORBIDDEN_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/\bimplemented\b[\s\S]{0,80}\bp95 improvement\b|\bp95 improvement achieved\b|\bruntime optimization applied\b|\brelease can ship\b|\bready for release\b/i.test(doc), false, `${DOC} must not imply implementation/pass/release readiness`)
  assert.match(doc, /does not implement runtime optimization/i)
  assert.match(doc, /does not claim p95 improvement/i)
  assert.match(doc, /Do not proceed beyond Slice 8/i)
  assert.match(doc, /no hidden scheduler\/autopilot/i)
  assert.match(doc, /no worker-spawns-worker/i)
  assert.match(doc, /no full-text body reads/i)
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
    assert.equal(source.includes('hotPathBurnDownCandidates'), false, `${toRel(root, file)} must not import/read Slice 4 candidate fixture`)
    assert.equal(source.includes('hotPathBurnDownPlan'), false, `${toRel(root, file)} must not import/read Slice 4 candidate plan`)
    assert.equal(source.includes('tests/fixtures/kernel/v0637/hotPathBurnDownCandidates.cjs'), false, `${toRel(root, file)} must not import/read Slice 4 fixture path`)
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
  for (const rel of [DOC, FIXTURE, SUITE, P0_LEDGER_FIXTURE, P0_LEDGER_SUITE, BASELINE_FIXTURE, BASELINE_SUITE, P95_FIXTURE, P95_SUITE]) assert.equal(exists(root, rel), true, `${rel} should exist`)
}

module.exports = {
  name: 'Go kernel v0.6.37 v0.5 hot-path burn-down candidates',
  async run(env) {
    const root = env.helpers.extRoot
    assertSliceFiles(root)
    assertPlanShape(root)
    assertCandidates(root)
    assertDoc(root)
    assertPackageRuntimeInvariants(root)
    assertFixtureNotUsedByProduction(root)
    assertArtifactInvariants(root)
    assertGitignore(root)
  },
}
