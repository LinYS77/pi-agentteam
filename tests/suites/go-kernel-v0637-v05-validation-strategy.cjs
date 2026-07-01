const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  CATEGORY_IDS,
  COMMON_STOP_CONDITIONS,
  FAILURE_TRIAGE_POLICY,
  KNOWN_CAVEATS,
  STRATEGY_DEFINED,
  V05_RELEASE_TARGET,
  VALIDATION_STRATEGY_SCHEMA_VERSION,
  VALIDATION_STRATEGY_SLICE,
  VALIDATION_STRATEGY_THEME,
  validationCategories,
  validationStrategy,
} = require('../fixtures/kernel/v0637/validationStrategy.cjs')
const { HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES } = require('../fixtures/kernel/historicalCheckpointDeletionMap.cjs')

const DOC = 'docs/perf/v0.6.37-v0.5-release-readiness-burndown.md'
const FIXTURE = 'tests/fixtures/kernel/v0637/validationStrategy.cjs'
const SUITE = 'tests/suites/go-kernel-v0637-v05-validation-strategy.cjs'
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
const RELIABILITY_FIXTURE = 'tests/fixtures/kernel/v0637/taskReportPlanRunReliability.cjs'
const RELIABILITY_SUITE = 'tests/suites/go-kernel-v0637-v05-task-report-planrun-reliability.cjs'
const FINAL_CHECKPOINT_FIXTURE = 'tests/fixtures/kernel/v0637/finalReleaseReadinessCheckpoint.cjs'
const FINAL_CHECKPOINT_SUITE = 'tests/suites/go-kernel-v0637-v05-final-readiness-checkpoint-docs.cjs'
const PACKAGE_VERSION = '0.6.8'

const REQUIRED_CATEGORY_FIELDS = [
  'broadRegression',
  'commands',
  'focusedProof',
  'id',
  'knownCaveats',
  'proofKind',
  'purpose',
  'releaseReadyClaim',
  'requiredForCurrentSlice',
  'requiredForRelease',
  'scope',
  'status',
  'stopConditions',
]
const REQUIRED_AGGREGATE_FIELDS = [
  'broadSuiteGreenClaimed',
  'categories',
  'categoryIds',
  'currentStatus',
  'defaultGoApproved',
  'defaultResolverApproved',
  'failureTriagePolicy',
  'fallbackDeletionApproved',
  'knownCaveats',
  'nativeWorkPerformed',
  'npmPublished',
  'packageVersionChanged',
  'ready',
  'releaseReadyClaim',
  'releaseTarget',
  'runtimeBehaviorChanged',
  'schemaVersion',
  'secondPlatformApproved',
  'signingApproved',
  'slice',
  'stopConditions',
  'tagCreated',
  'testsRunSuiteArgumentFocusedProofAllowed',
  'theme',
  'validationCaveat',
]
const REQUIRED_DOC = [
  '## Slice 6 — Regression suite stabilization / validation strategy',
  'Current status: `strategy-defined`.',
  'Slice 6 defines the v0.6.37/v0.5 release validation strategy only; it does not fix `tests/run.cjs`, does not claim broad suite green, does not prove release readiness, and does not approve tag/release/package/default-Go/native/signing/second-platform/fallback-deletion work.',
  '`tests/fixtures/kernel/v0637/validationStrategy.cjs`',
  '`tests/suites/go-kernel-v0637-v05-validation-strategy.cjs`',
  '### Slice 6 validation categories',
  '| Category | Focused or broad | Commands | Purpose / scope | Required for release | Caveats / STOP |',
  '### Slice 6 known caveats and failure triage',
  '### Slice 6 validation expectations',
]
const REQUIRED_DOC_TERMS = [
  'syntax: `node --check` for new/changed `.cjs` files',
  'focused guards: direct require-based invocation of Slice 1–8 guards with `helpers.extRoot=process.cwd()`',
  'broad regression: `npm test`, but not focused proof',
  'type/boundary: `npm run typecheck`, `npm run -s check:boundaries`, `git diff --check`',
  'perf: `npm run --silent bench:state-read-model`, `npm run --silent bench:team-panel-tmux`',
  'manual RC: later execution of the Slice 5 checklist, not this slice',
  '`tests/run.cjs <suite>` must not be represented as focused proof unless a future runner fix is implemented and tested',
  'tests/suites/tools-state.cjs:577',
  'pane lost',
  'initial task busy via bridge delivery',
  'unresolved broad-regression blocker/watch item',
  'do not ignore as unrelated without leader review',
]
const FORBIDDEN_OVERCLAIMS = [
  'broad suite is green',
  'npm test passed',
  'all regression passed',
  'release-ready status is proven',
  'release ready status is proven',
  'v0.5 release-ready',
  'v0.5 release ready',
  'release can ship',
  'ready for release',
  'tests/run.cjs <suite> is focused proof',
  'p95 gate passed',
  'p95 gates passed',
  'manual smoke passed',
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

function assertStrategyShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(validationStrategy)), validationStrategy, 'validation strategy should be plain deterministic data')
  assert.deepEqual(Object.keys(validationStrategy).sort(), REQUIRED_AGGREGATE_FIELDS.sort(), 'validation strategy aggregate should expose only expected fields')
  assert.equal(validationStrategy.schemaVersion, VALIDATION_STRATEGY_SCHEMA_VERSION)
  assert.equal(validationStrategy.theme, VALIDATION_STRATEGY_THEME)
  assert.equal(validationStrategy.releaseTarget, V05_RELEASE_TARGET)
  assert.equal(validationStrategy.slice, VALIDATION_STRATEGY_SLICE)
  assert.equal(validationStrategy.currentStatus, STRATEGY_DEFINED)
  assert.equal(validationStrategy.ready, false)
  assert.equal(validationStrategy.broadSuiteGreenClaimed, false)
  assert.equal(validationStrategy.releaseReadyClaim, false)
  assert.equal(validationStrategy.runtimeBehaviorChanged, false)
  assert.equal(validationStrategy.packageVersionChanged, false)
  assert.equal(validationStrategy.tagCreated, false)
  assert.equal(validationStrategy.npmPublished, false)
  assert.equal(validationStrategy.nativeWorkPerformed, false)
  assert.equal(validationStrategy.defaultGoApproved, false)
  assert.equal(validationStrategy.defaultResolverApproved, false)
  assert.equal(validationStrategy.fallbackDeletionApproved, false)
  assert.equal(validationStrategy.signingApproved, false)
  assert.equal(validationStrategy.secondPlatformApproved, false)
  assert.equal(validationStrategy.testsRunSuiteArgumentFocusedProofAllowed, false)
  assert.deepEqual(validationStrategy.categoryIds, CATEGORY_IDS)
  assert.deepEqual(validationStrategy.categories, validationCategories)
  assert.deepEqual(validationStrategy.knownCaveats, KNOWN_CAVEATS)
  assert.deepEqual(validationStrategy.failureTriagePolicy, FAILURE_TRIAGE_POLICY)
  assert.deepEqual(validationStrategy.stopConditions, COMMON_STOP_CONDITIONS)
  assertIncludes(validationStrategy.validationCaveat, 'does not fix tests/run.cjs behavior', 'validation caveat')
}

function assertCategories() {
  assert.deepEqual(validationCategories.map(category => category.id), CATEGORY_IDS, 'validation categories should be deterministic and ordered')
  assert.equal(new Set(validationCategories.map(category => category.id)).size, CATEGORY_IDS.length, 'validation category IDs should be unique')
  for (const category of validationCategories) {
    assert.deepEqual(Object.keys(category).sort(), REQUIRED_CATEGORY_FIELDS.sort(), `${category.id} should expose required category fields only`)
    assert.equal(category.status, STRATEGY_DEFINED, `${category.id} should be strategy-defined`)
    assert.ok(category.purpose.length > 40, `${category.id} purpose should be meaningful`)
    assert.equal(Array.isArray(category.commands), true, `${category.id} commands`)
    assert.ok(category.commands.length >= 1, `${category.id} should list commands`)
    assert.ok(category.scope.length > 40, `${category.id} scope should be meaningful`)
    assert.ok(category.proofKind.length > 4, `${category.id} proofKind should be meaningful`)
    assert.equal(typeof category.focusedProof, 'boolean', `${category.id} focusedProof`)
    assert.equal(typeof category.broadRegression, 'boolean', `${category.id} broadRegression`)
    assert.equal(typeof category.requiredForRelease, 'boolean', `${category.id} requiredForRelease`)
    assert.equal(typeof category.requiredForCurrentSlice, 'boolean', `${category.id} requiredForCurrentSlice`)
    assert.equal(Array.isArray(category.knownCaveats), true, `${category.id} known caveats`)
    assert.equal(Array.isArray(category.stopConditions), true, `${category.id} STOP gates`)
    assert.ok(category.stopConditions.length > COMMON_STOP_CONDITIONS.length, `${category.id} should include specific STOP gates`)
    assert.ok(category.stopConditions.every(condition => /^STOP\b/.test(condition)), `${category.id} stop conditions should be explicit STOP gates`)
    assert.equal(category.releaseReadyClaim, false, `${category.id} must not claim release readiness`)
    const categoryText = JSON.stringify(category)
    for (const forbidden of FORBIDDEN_OVERCLAIMS) assert.equal(categoryText.includes(forbidden), false, `${category.id} must not overclaim: ${forbidden}`)
  }

  const syntax = validationCategories.find(category => category.id === 'syntax-node-check')
  assert.equal(syntax.focusedProof, true)
  assert.match(syntax.commands.join('\n'), /node --check/)

  const focused = validationCategories.find(category => category.id === 'focused-v0637-guards-direct')
  assert.equal(focused.focusedProof, true)
  assert.equal(focused.broadRegression, false)
  assert.match(focused.commands.join('\n'), /helpers:\s*\{\s*extRoot:\s*process\.cwd\(\)\s*\}/)
  assert.match(focused.commands.join('\n'), /go-kernel-v0637-v05-task-report-planrun-reliability\.cjs/)
  assert.match(focused.commands.join('\n'), /go-kernel-v0637-v05-final-readiness-checkpoint-docs\.cjs/)
  assert.match(focused.knownCaveats.join('\n'), /Do not replace this with tests\/run\.cjs <suite>/)

  const broad = validationCategories.find(category => category.id === 'broad-regression-npm-test')
  assert.equal(broad.focusedProof, false)
  assert.equal(broad.broadRegression, true)
  assert.deepEqual(broad.commands, ['npm test'])
  assert.match(broad.knownCaveats.join('\n'), /tools-state\.cjs:577/)
  assert.match(broad.stopConditions.join('\n'), /silently ignored/)

  const typeBoundary = validationCategories.find(category => category.id === 'typecheck-boundary-diff')
  assert.match(typeBoundary.commands.join('\n'), /npm run typecheck/)
  assert.match(typeBoundary.commands.join('\n'), /npm run -s check:boundaries/)
  assert.match(typeBoundary.commands.join('\n'), /git diff --check/)

  const perf = validationCategories.find(category => category.id === 'performance-bench-evidence')
  assert.match(perf.commands.join('\n'), /bench:state-read-model/)
  assert.match(perf.commands.join('\n'), /bench:team-panel-tmux/)
  assert.match(perf.knownCaveats.join('\n'), /Local timing numbers are not release approval/)

  const manual = validationCategories.find(category => category.id === 'manual-rc-smoke-evidence')
  assert.equal(manual.requiredForCurrentSlice, false)
  assert.match(manual.knownCaveats.join('\n'), /Slice 6 does not execute manual smoke/)
}

function assertKnownCaveatsAndTriage() {
  const runner = KNOWN_CAVEATS.find(caveat => caveat.id === 'tests-run-suite-argument-not-focused-proof')
  assert.equal(runner.status, 'unresolved-runner-caveat')
  assert.match(runner.summary, /tests\/run\.cjs <suite> must not be represented as focused proof/i)
  assert.match(runner.policy, /direct require-based invocation/i)

  const pane = KNOWN_CAVEATS.find(caveat => caveat.id === 'tools-state-pane-health-mismatch')
  assert.equal(pane.status, 'unresolved-watch')
  assert.match(pane.summary, /tests\/suites\/tools-state\.cjs:577/)
  assert.match(pane.summary, /pane lost/)
  assert.match(pane.summary, /initial task busy via bridge delivery/)
  assert.match(pane.policy, /do not attribute it to docs-only v0\.6\.37 slices unless evidence proves causality/i)

  assert.ok(FAILURE_TRIAGE_POLICY.some(policy => /focused v0\.6\.37 guard failure blocks/.test(policy)), 'focused failure should block current slice')
  assert.ok(FAILURE_TRIAGE_POLICY.some(policy => /broad npm test failure.*recorded, triaged, and leader-reviewed/.test(policy)), 'broad failure should require triage')
  assert.ok(FAILURE_TRIAGE_POLICY.some(policy => /Do not silently ignore broad regression failures/.test(policy)), 'broad failures must not be silently ignored')
}

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_DOC_TERMS) assertIncludes(doc, expected, DOC)
  for (const id of CATEGORY_IDS) assertIncludes(doc, `\`${id}\``, DOC)
  for (const caveat of KNOWN_CAVEATS) assertIncludes(doc, caveat.id, DOC)
  for (const forbidden of FORBIDDEN_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/\bnpm test passed\b|\brelease can ship\b|\bready for release\b/i.test(doc), false, `${DOC} must not claim broad suite green or release readiness`)
  assert.match(doc, /does not fix `tests\/run\.cjs`/i)
  assert.match(doc, /does not claim broad suite green/i)
  assert.match(doc, /Do not proceed beyond Slice 8/i)
  assert.match(doc, /broad npm test failure must be recorded and triaged before release readiness claim/i)
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
    assert.equal(source.includes('validationStrategy'), false, `${toRel(root, file)} must not import/read Slice 6 validation strategy`)
    assert.equal(source.includes('validationCategories'), false, `${toRel(root, file)} must not import/read Slice 6 validation categories`)
    assert.equal(source.includes('tests/fixtures/kernel/v0637/validationStrategy.cjs'), false, `${toRel(root, file)} must not import/read Slice 6 fixture path`)
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
  for (const rel of [DOC, FIXTURE, SUITE, P0_LEDGER_FIXTURE, P0_LEDGER_SUITE, BASELINE_FIXTURE, BASELINE_SUITE, P95_FIXTURE, P95_SUITE, HOT_PATH_FIXTURE, HOT_PATH_SUITE, MANUAL_RC_FIXTURE, MANUAL_RC_SUITE, RELIABILITY_FIXTURE, RELIABILITY_SUITE, FINAL_CHECKPOINT_FIXTURE]) assert.equal(exists(root, rel), true, `${rel} should exist`)
  assert.ok(HISTORICAL_CHECKPOINT_STEP5C_DELETED_SUITES.includes(FINAL_CHECKPOINT_SUITE), `${FINAL_CHECKPOINT_SUITE} should be accounted for by Step5C deletion evidence`)
  assert.equal(exists(root, FINAL_CHECKPOINT_SUITE), false, `${FINAL_CHECKPOINT_SUITE} should remain absent after Step5C deletion`)
}

module.exports = {
  name: 'Go kernel v0.6.37 v0.5 validation strategy',
  async run(env) {
    const root = env.helpers.extRoot
    assertSliceFiles(root)
    assertStrategyShape(root)
    assertCategories()
    assertKnownCaveatsAndTriage()
    assertDoc(root)
    assertPackageRuntimeInvariants(root)
    assertFixtureNotUsedByProduction(root)
    assertArtifactInvariants(root)
    assertGitignore(root)
  },
}
