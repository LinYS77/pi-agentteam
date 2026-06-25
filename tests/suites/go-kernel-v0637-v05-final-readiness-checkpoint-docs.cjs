const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  CHECKPOINT_STATUS,
  FINAL_CHECKPOINT_SCHEMA_VERSION,
  FINAL_CHECKPOINT_SLICE,
  FINAL_CHECKPOINT_THEME,
  GO_ITEMS,
  NEXT_DECISIONS,
  PACKAGE_RUNTIME_INVARIANTS,
  REMAINING_BLOCKERS,
  SLICE_SUMMARIES,
  STOP_ITEMS,
  V05_RELEASE_TARGET,
  VALIDATION_STATUS,
  finalReleaseReadinessCheckpoint,
} = require('../fixtures/kernel/v0637/finalReleaseReadinessCheckpoint.cjs')

const DOC = 'docs/perf/v0.6.37-v0.5-release-readiness-burndown.md'
const CHECKPOINT = 'docs/perf/v0.6.37-v0.5-release-readiness-burndown-checkpoint.md'
const FIXTURE = 'tests/fixtures/kernel/v0637/finalReleaseReadinessCheckpoint.cjs'
const SUITE = 'tests/suites/go-kernel-v0637-v05-final-readiness-checkpoint-docs.cjs'
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
const RELIABILITY_FIXTURE = 'tests/fixtures/kernel/v0637/taskReportPlanRunReliability.cjs'
const RELIABILITY_SUITE = 'tests/suites/go-kernel-v0637-v05-task-report-planrun-reliability.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_SLICE_FILES = [
  DOC,
  P0_LEDGER_FIXTURE,
  P0_LEDGER_SUITE,
  BASELINE_FIXTURE,
  BASELINE_SUITE,
  P95_FIXTURE,
  P95_SUITE,
  HOT_PATH_FIXTURE,
  HOT_PATH_SUITE,
  MANUAL_RC_FIXTURE,
  MANUAL_RC_SUITE,
  VALIDATION_FIXTURE,
  VALIDATION_SUITE,
  RELIABILITY_FIXTURE,
  RELIABILITY_SUITE,
  CHECKPOINT,
  FIXTURE,
  SUITE,
]
const REQUIRED_DOC = [
  '# v0.6.37 v0.5 Release Readiness Burn-down Checkpoint',
  'final v0.6.37 docs/tests-only checkpoint for v0.5 release-readiness burn-down.',
  '## Result',
  'Result: v0.6.37 is a docs/tests/fixtures release-readiness burn-down checkpoint ready for leader review.',
  'The final v0.5 release-readiness result remains `ready:false`.',
  'This checkpoint is GO only for reviewing local docs/tests/fixtures governance evidence.',
  'This checkpoint is STOP for v0.5 release-ready approval, tag/release work, npm version/publish, package release, default-Go/default resolver, native/package helper delivery, signing/security attestations, second-platform support, fallback deletion, runtime optimization implementation, manual RC pass claims, p95 pass claims, broad `npm test` green claims, and any unresolved pane-health waiver.',
  'v0.6.37 does not approve v0.5 release readiness.',
  'v0.6.37 does not create, push, move, or imply a tag or release.',
  'v0.6.37 does not run or approve `npm version`, `npm publish`, package release, install source approval, package metadata expansion, release assets, release bundles, or package artifacts.',
  'v0.6.37 does not approve default Go, default resolver, native helper/package delivery, normal-user native availability, `go-cutover` defaulting, `go-packaged-preview` defaulting, signing, cosign, SLSA, security attestation, second-platform support, or TypeScript fallback deletion.',
  'v0.6.37 does not implement runtime optimization, command/tool/readiness expansion, UI behavior changes, workflow behavior changes, or production TypeScript/Go runtime behavior changes.',
  'The Slice 5 manual RC smoke checklist remains `defined-not-executed`.',
  'The Slice 3 p95 release gates remain `defined-not-yet-proven`.',
  'Broad `npm test` green is not claimed; the known `tests/suites/tools-state.cjs:577` pane-health mismatch remains unresolved until separately triaged.',
  '`package.json` remains version `0.6.8`.',
  '## Slice 1–8 Evidence Summary',
  'Slice 1 — P0 readiness ledger:',
  'Slice 2 — Performance baseline inventory:',
  'Slice 3 — p95 release gate definitions:',
  'Slice 4 — Focused hot-path burn-down candidates:',
  'Slice 5 — Manual RC smoke checklist:',
  'Slice 6 — Validation strategy:',
  'Slice 7 — Task/report/PlanRun release reliability map:',
  'Slice 8 — Final release-readiness checkpoint:',
  '## GO Matrix',
  'GO for:',
  '| GO item | Scope | Evidence | Limit |',
  '`local-docs-tests-governance-evidence`',
  '`focused-guards-direct-pass`',
  '`burn-down-map-complete`',
  '`ts-pi-facade-authority-preserved`',
  '## STOP Matrix',
  'STOP for:',
  '| STOP item | Reason |',
  '`not-v05-release-ready`',
  '`no-tag-release-git-push`',
  '`no-npm-version-publish-package-release`',
  '`no-default-go-native-resolver`',
  '`no-signing-security-second-platform`',
  '`no-fallback-deletion`',
  '`no-runtime-optimization-implementation`',
  '`no-manual-rc-execution-claim`',
  '`no-p95-pass-claim`',
  '`no-broad-npm-test-green-claim`',
  '`no-unresolved-pane-health-waiver`',
  '## Remaining Blockers',
  '`manual-rc-not-executed`',
  '`p95-gates-not-proven`',
  '`broad-npm-test-pane-health-mismatch`',
  '`hot-path-improvements-not-implemented`',
  '`release-tag-decisions-leader-gated`',
  '`default-go-native-remains-blocked`',
  '`task-report-planrun-final-proof-required`',
  '## Recommended Next Decisions',
  '`triage-broad-npm-test-mismatch`',
  '`execute-manual-rc-clean-home`',
  '`collect-p95-evidence`',
  '`start-first-hot-path-candidate`',
  '`panel-unchanged-state-render-suppression`',
  '`defer-release-tag-npm-native-default-go`',
  '## Package / Runtime Invariants',
  '`package.json` name remains `pi-agentteam`.',
  '`package.json` version remains `0.6.8`.',
  '`package.json` type remains `module`.',
  "`package.json#pi.extensions` remains exactly `['./index.ts']`.",
  'TypeScript/pi remains the product and control-plane facade.',
  'The stable command surface remains `/team`.',
  'The stable tool surface remains `agentteam_create`, `agentteam_spawn`, `agentteam_send`, `agentteam_receive`, `agentteam_task`, and `agentteam_planrun`.',
  '## Validation Status',
  '`node --check tests/fixtures/kernel/v0637/finalReleaseReadinessCheckpoint.cjs`.',
  '`node --check tests/suites/go-kernel-v0637-v05-final-readiness-checkpoint-docs.cjs`.',
  'Direct require-based invocation of `tests/suites/go-kernel-v0637-v05-final-readiness-checkpoint-docs.cjs`.',
  'Re-run Slice 1, Slice 2, Slice 3, Slice 4, Slice 5, Slice 6, and Slice 7 focused guards after doc edits.',
  '`git diff --check`.',
  'Do not use `tests/run.cjs <suite>` as focused proof because the runner can ignore the suite-name argument and run unrelated suites.',
  '`npm test` is optional broad regression coverage for this docs-only checkpoint. If not run, say so.',
  '## Final Recommendation',
  'Proceed with leader review of v0.6.37 as a docs/tests/fixtures-only v0.5 release-readiness burn-down checkpoint.',
]
const REQUIRED_MAIN_DOC = [
  'Slice 8 final checkpoint',
  '`tests/fixtures/kernel/v0637/finalReleaseReadinessCheckpoint.cjs`',
  '`tests/suites/go-kernel-v0637-v05-final-readiness-checkpoint-docs.cjs`',
  'focused guards: direct require-based invocation of Slice 1–8 guards with `helpers.extRoot=process.cwd()`',
  'STOP if any Slice 1–8 guard fails.',
  'direct require-based invocation of the specific Slice 1–8 guard with `helpers.extRoot=process.cwd()`',
  'Use `node --check` plus direct require-based invocation for each focused Slice 1, Slice 2, Slice 3, Slice 4, Slice 5, Slice 6, Slice 7, and Slice 8 guard',
  '## Final recommendation after Slice 8',
  'Proceed with leader review of the Slice 1 P0 ledger, Slice 2 baseline inventory, Slice 3 p95 gate definitions, Slice 4 hot-path candidate matrix, Slice 5 manual RC smoke checklist, Slice 6 validation strategy, Slice 7 task/report/PlanRun reliability map, and Slice 8 final checkpoint only.',
  'Do not proceed beyond Slice 8 to manual smoke execution, runtime optimization implementation, runner behavior changes, tag/release work, npm package work, native/default-Go/default-resolver work, signing/security work, second-platform work, fallback deletion, command/tool/readiness expansion, or broad Go authority without a separate explicit assignment and leader/user approval.',
]
const REQUIRED_AGGREGATE_FIELDS = [
  'broadNpmTestGreenClaim',
  'defaultGoApproved',
  'defaultResolverApproved',
  'docsTestsFixturesOnly',
  'fallbackDeletionApproved',
  'goItems',
  'manualRcExecuted',
  'nativeWorkPerformed',
  'nextDecisions',
  'npmPublished',
  'p95GatesProven',
  'packageRuntimeInvariants',
  'packageVersionChanged',
  'paneHealthWaived',
  'ready',
  'releaseReadyClaim',
  'releaseTarget',
  'remainingBlockers',
  'runtimeBehaviorChanged',
  'schemaVersion',
  'secondPlatformApproved',
  'signingApproved',
  'slice',
  'sliceSummaries',
  'status',
  'stopItems',
  'tagCreated',
  'theme',
  'validationStatus',
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'v0.5 release-ready approval is granted',
  'v0.5 release ready approval is granted',
  'v0.5 is release-ready',
  'v0.5 is release ready',
  'v0.6.37 approves v0.5 release readiness',
  'release can ship',
  'ready for release',
  'manual RC passed',
  'manual smoke passed',
  'p95 gates passed',
  'p95 gate passed',
  'broad npm test green',
  'npm test is green',
  'pane-health waiver granted',
  'pane health waiver granted',
  'tag was created',
  'tag was pushed',
  'git push completed',
  'npm version completed',
  'npm publish completed',
  'package release is approved',
  'install source is approved',
  'release asset is approved',
  'release bundle is approved',
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'normal-user native availability is proven',
  'native helper delivery is complete',
  'native package delivery is complete',
  'runtime optimization is implemented',
  'runtime behavior changed',
  'signing is approved',
  'cosign is approved',
  'SLSA is approved',
  'security attestation is approved',
  'second-platform support is approved',
  'second platform support is approved',
  'fallback deletion is approved',
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

function assertNoOverclaims(source, label) {
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(source.includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
  assert.equal(/\brelease can ship\b|\bready for release\b|\bmanual RC passed\b|\bp95 gates passed\b|\bnpm test is green\b/i.test(source), false, `${label} must not claim release-ready/manual/p95/npm green`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(source), false, `${label} must not embed raw artifact/verifier JSON bodies`)
}

function assertCheckpointShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(finalReleaseReadinessCheckpoint)), finalReleaseReadinessCheckpoint, 'checkpoint fixture should be plain deterministic data')
  assert.deepEqual(Object.keys(finalReleaseReadinessCheckpoint).sort(), REQUIRED_AGGREGATE_FIELDS.sort(), 'checkpoint aggregate should expose only expected fields')
  assert.equal(finalReleaseReadinessCheckpoint.schemaVersion, FINAL_CHECKPOINT_SCHEMA_VERSION)
  assert.equal(finalReleaseReadinessCheckpoint.theme, FINAL_CHECKPOINT_THEME)
  assert.equal(finalReleaseReadinessCheckpoint.slice, FINAL_CHECKPOINT_SLICE)
  assert.equal(finalReleaseReadinessCheckpoint.releaseTarget, V05_RELEASE_TARGET)
  assert.equal(finalReleaseReadinessCheckpoint.status, CHECKPOINT_STATUS)
  assert.equal(finalReleaseReadinessCheckpoint.ready, false)
  assert.equal(finalReleaseReadinessCheckpoint.releaseReadyClaim, false)
  assert.equal(finalReleaseReadinessCheckpoint.docsTestsFixturesOnly, true)
  for (const key of ['runtimeBehaviorChanged', 'packageVersionChanged', 'tagCreated', 'npmPublished', 'nativeWorkPerformed', 'defaultGoApproved', 'defaultResolverApproved', 'fallbackDeletionApproved', 'signingApproved', 'secondPlatformApproved', 'manualRcExecuted', 'p95GatesProven', 'broadNpmTestGreenClaim', 'paneHealthWaived']) {
    assert.equal(finalReleaseReadinessCheckpoint[key], false, `${key} should remain false`)
  }
  assert.deepEqual(finalReleaseReadinessCheckpoint.sliceSummaries, SLICE_SUMMARIES)
  assert.deepEqual(finalReleaseReadinessCheckpoint.goItems, GO_ITEMS)
  assert.deepEqual(finalReleaseReadinessCheckpoint.stopItems, STOP_ITEMS)
  assert.deepEqual(finalReleaseReadinessCheckpoint.remainingBlockers, REMAINING_BLOCKERS)
  assert.deepEqual(finalReleaseReadinessCheckpoint.nextDecisions, NEXT_DECISIONS)
  assert.deepEqual(finalReleaseReadinessCheckpoint.validationStatus, VALIDATION_STATUS)
  assert.deepEqual(finalReleaseReadinessCheckpoint.packageRuntimeInvariants, PACKAGE_RUNTIME_INVARIANTS)
}

function assertFixtureContent() {
  assert.deepEqual(SLICE_SUMMARIES.map(row => row.slice), [1, 2, 3, 4, 5, 6, 7, 8], 'slice summaries should cover Slice 1-8')
  const statusBySlice = new Map(SLICE_SUMMARIES.map(row => [row.slice, row.status]))
  assert.equal(statusBySlice.get(3), 'defined-not-yet-proven')
  assert.equal(statusBySlice.get(4), 'proposed-not-started')
  assert.equal(statusBySlice.get(5), 'defined-not-executed')
  assert.equal(statusBySlice.get(6), 'strategy-defined')
  assert.equal(statusBySlice.get(7), 'mapped-not-proven')
  assert.equal(statusBySlice.get(8), CHECKPOINT_STATUS)
  assert.deepEqual(GO_ITEMS.map(row => row.id), ['local-docs-tests-governance-evidence', 'focused-guards-direct-pass', 'burn-down-map-complete', 'ts-pi-facade-authority-preserved'])
  assert.ok(GO_ITEMS.every(row => row.decision === 'GO'), 'all GO rows should be GO')
  assert.ok(GO_ITEMS.every(row => /not|only|does not|no default-Go|not completion/i.test(row.limit)), 'GO rows must name their limits')
  assert.deepEqual(STOP_ITEMS.map(row => row.id), ['not-v05-release-ready', 'no-tag-release-git-push', 'no-npm-version-publish-package-release', 'no-default-go-native-resolver', 'no-signing-security-second-platform', 'no-fallback-deletion', 'no-runtime-optimization-implementation', 'no-manual-rc-execution-claim', 'no-p95-pass-claim', 'no-broad-npm-test-green-claim', 'no-unresolved-pane-health-waiver'])
  assert.ok(STOP_ITEMS.every(row => /No |not |remains|waiver/i.test(row.reason)), 'STOP rows should be explicit denials')
  const blockers = new Set(REMAINING_BLOCKERS.map(row => row.id))
  for (const id of ['manual-rc-not-executed', 'p95-gates-not-proven', 'broad-npm-test-pane-health-mismatch', 'hot-path-improvements-not-implemented', 'release-tag-decisions-leader-gated', 'default-go-native-remains-blocked', 'task-report-planrun-final-proof-required']) assert.equal(blockers.has(id), true, `blocker should exist: ${id}`)
  const decisions = new Set(NEXT_DECISIONS.map(row => row.id))
  for (const id of ['triage-broad-npm-test-mismatch', 'execute-manual-rc-clean-home', 'collect-p95-evidence', 'start-first-hot-path-candidate', 'defer-release-tag-npm-native-default-go']) assert.equal(decisions.has(id), true, `decision should exist: ${id}`)
  assert.ok(NEXT_DECISIONS.every(row => row.decisionOwner === 'leader'), 'next decisions should remain leader-owned')
  assert.deepEqual(VALIDATION_STATUS.map(row => row.id), ['node-check-v0637-cjs', 'direct-slice-1-8-guards', 'git-diff-check', 'npm-test'])
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.packageName, 'pi-agentteam')
  assert.equal(PACKAGE_RUNTIME_INVARIANTS.packageVersion, PACKAGE_VERSION)
  assert.deepEqual(PACKAGE_RUNTIME_INVARIANTS.piExtensions, ['./index.ts'])
}

function assertCheckpointDoc(root) {
  assert.equal(exists(root, CHECKPOINT), true, `${CHECKPOINT} should exist`)
  const checkpoint = read(root, CHECKPOINT)
  for (const expected of REQUIRED_DOC) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const rel of REQUIRED_SLICE_FILES) assertIncludes(checkpoint, `\`${rel}\``, CHECKPOINT)
  for (const row of SLICE_SUMMARIES) {
    assertIncludes(checkpoint, row.title, CHECKPOINT)
    assertIncludes(checkpoint, row.status, CHECKPOINT)
    for (const rel of row.fixtures) assertIncludes(checkpoint, `\`${rel}\``, CHECKPOINT)
    for (const rel of row.guards) assertIncludes(checkpoint, `\`${rel}\``, CHECKPOINT)
  }
  for (const row of GO_ITEMS) assertIncludes(checkpoint, `\`${row.id}\``, CHECKPOINT)
  for (const row of STOP_ITEMS) assertIncludes(checkpoint, `\`${row.id}\``, CHECKPOINT)
  for (const row of REMAINING_BLOCKERS) assertIncludes(checkpoint, `\`${row.id}\``, CHECKPOINT)
  for (const row of NEXT_DECISIONS) assertIncludes(checkpoint, `\`${row.id}\``, CHECKPOINT)
  assert.match(checkpoint, /GO only for reviewing local docs\/tests\/fixtures governance evidence/i)
  assert.match(checkpoint, /STOP for v0\.5 release-ready approval/i)
  assert.match(checkpoint, /known `tests\/suites\/tools-state\.cjs:577` pane-health mismatch remains unresolved/i)
  assert.match(checkpoint, /actual `pane lost` vs expected `initial task busy via bridge delivery`/i)
  assert.match(checkpoint, /manual RC smoke checklist remains `defined-not-executed`/i)
  assert.match(checkpoint, /p95 release gates remain `defined-not-yet-proven`/i)
  assert.match(checkpoint, /Do not use `tests\/run\.cjs <suite>` as focused proof/i)
  assertNoOverclaims(checkpoint, CHECKPOINT)
}

function assertMainDocAndGitignore(root) {
  const mainDoc = read(root, DOC)
  for (const expected of REQUIRED_MAIN_DOC) assertIncludes(mainDoc, expected, DOC)
  assertNoOverclaims(mainDoc, DOC)

  const gitignore = read(root, '.gitignore')
  assertIncludes(gitignore, `!${DOC}`, '.gitignore')
  assertIncludes(gitignore, `!${CHECKPOINT}`, '.gitignore')
}

function assertSliceFilesExist(root) {
  for (const rel of REQUIRED_SLICE_FILES) assert.equal(exists(root, rel), true, `${rel} should exist`)
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
    assert.equal(source.includes('finalReleaseReadinessCheckpoint'), false, `${toRel(root, file)} must not import/read Slice 8 checkpoint fixture`)
    assert.equal(source.includes('finalReleaseReadinessCheckpoint.cjs'), false, `${toRel(root, file)} must not import/read Slice 8 checkpoint fixture path`)
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

module.exports = {
  name: 'Go kernel v0.6.37 v0.5 final readiness checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertSliceFilesExist(root)
    assertCheckpointShape(root)
    assertFixtureContent()
    assertCheckpointDoc(root)
    assertMainDocAndGitignore(root)
    assertPackageRuntimeInvariants(root)
    assertFixtureNotUsedByProduction(root)
    assertArtifactInvariants(root)
  },
}
