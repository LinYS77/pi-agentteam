const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  COMMON_ENV_METADATA,
  COMMON_RECORDING_RULE,
  COMMON_RELATIVE_FALLBACK,
  COMMON_STOP_GATES,
  DEFINED_NOT_YET_PROVEN,
  GATE_IDS,
  P95_RELEASE_GATES_SCHEMA_VERSION,
  P95_RELEASE_GATES_SLICE,
  P95_RELEASE_GATES_THEME,
  V05_RELEASE_TARGET,
  p95ReleaseGateDefinitions,
  p95ReleaseGates,
} = require('../fixtures/kernel/v0637/p95ReleaseGates.cjs')

const DOC = 'docs/perf/v0.6.37-v0.5-release-readiness-burndown.md'
const FIXTURE = 'tests/fixtures/kernel/v0637/p95ReleaseGates.cjs'
const SUITE = 'tests/suites/go-kernel-v0637-v05-p95-release-gates.cjs'
const P0_LEDGER_FIXTURE = 'tests/fixtures/kernel/v0637/p0ReadinessLedger.cjs'
const P0_LEDGER_SUITE = 'tests/suites/go-kernel-v0637-v05-p0-readiness-ledger.cjs'
const BASELINE_FIXTURE = 'tests/fixtures/kernel/v0637/performanceBaselineInventory.cjs'
const BASELINE_SUITE = 'tests/suites/go-kernel-v0637-v05-performance-baseline-inventory.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_GATE_FIELDS = [
  'appOwnedTime',
  'env',
  'evidence',
  'exclusions',
  'fixture',
  'id',
  'iterations',
  'metric',
  'passFailRecording',
  'relativeFallback',
  'releaseReadyClaim',
  'scope',
  'status',
  'stopConditions',
  'threshold',
]
const REQUIRED_AGGREGATE_FIELDS = [
  'currentStatus',
  'defaultGoApproved',
  'defaultResolverApproved',
  'fallbackDeletionApproved',
  'gateIds',
  'gates',
  'nativeWorkPerformed',
  'npmPublished',
  'packageVersionChanged',
  'provesP95Pass',
  'provesReleaseReady',
  'ready',
  'relativeFallback',
  'releaseReadyClaim',
  'releaseTarget',
  'runtimeBehaviorChanged',
  'schemaVersion',
  'secondPlatformApproved',
  'signingApproved',
  'slice',
  'stopGates',
  'tagCreated',
  'theme',
  'validationCaveat',
]
const REQUIRED_DOC = [
  '## Slice 3 — p95 release gate definition',
  'Current status: `defined-not-yet-proven`.',
  'Slice 3 defines auditable v0.5 p95 release gates only; it does not prove any gate passed, does not prove release readiness status, and does not approve tag/release/package/default-Go/native/signing/second-platform/fallback-deletion work.',
  '`tests/fixtures/kernel/v0637/p95ReleaseGates.cjs`',
  '`tests/suites/go-kernel-v0637-v05-p95-release-gates.cjs`',
  '### Slice 3 gate-wide policy',
  'Relative fallback rule: if the absolute threshold cannot be judged stably on the current reviewer machine, the candidate must show at least `>= 50% improvement` over a reviewer-accepted baseline artifact recorded with matching fixture, command, warmup/measured iterations, metric field, and environment metadata.',
  'Every gate must record environment metadata: `node --version`, `npm --version`, git short SHA, platform/arch or `uname -a`, CPU facts when available, `PI_AGENTTEAM_PROFILE`, `PI_AGENTTEAM_KERNEL` metadata when present, fixture profile, warmup/measured iteration counts, and `PI_AGENTTEAM_HOME` isolation/temp-home notes.',
  '`tests/run.cjs <suite>` caveat: do not use it as focused proof for Slice 3 because suite-name arguments are not the focused-proof boundary; use `node --check` plus direct require-based guard invocation and explicit benchmark/manual evidence commands.',
  '### Slice 3 p95 gates',
  '| Gate ID | Scope / metric | Threshold / fallback | Fixture / iterations | Evidence command | Exclusions | STOP condition |',
]
const REQUIRED_DOC_TERMS = [
  'attached.panel.dataLoadMs.p95',
  'attached.panel.renderMs.p95',
  'attached.tmux.commandCount',
  'global.panel.dataLoadMs.p95',
  'one snapshot/list-panes policy',
  'taskMessageReportAction.normal.p95',
  'taskMessageReportAction.largeMailbox.p95',
  'fsStore.byKind.lock.p95',
  'no repeated requestRender for unchanged state',
  '<= 4 renders/sec',
  'spawn.bookkeepingMs.p95',
  'excluding external pi/tmux/LLM startup segments',
  'app-owned time',
  'external pi/LLM/provider/tmux-real-world variance',
  'Benchmark JSON or manual evidence must be preserved for later audit, but this Slice 3 document does not check in local output JSON and does not turn local bench numbers into release approval.',
]
const FORBIDDEN_OVERCLAIMS = [
  'p95 gate passed',
  'p95 gates passed',
  'final p95 gate passed',
  'all p95 gates pass',
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
  'normal-user native helper availability is proven',
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
const REQUIRED_THRESHOLDS = new Map([
  ['attached-team-warm-refresh-data-load-p95', { kind: 'p95-ms-lte', value: 100 }],
  ['attached-team-warm-refresh-render-p95', { kind: 'p95-ms-lte', value: 16 }],
  ['attached-team-warm-refresh-tmux-command-count', { kind: 'count-lte', value: 1 }],
  ['global-team-warm-refresh-data-load-p95', { kind: 'p95-ms-lte', value: 200 }],
  ['task-message-report-action-normal-p95', { kind: 'p95-ms-lte', value: 50 }],
  ['task-message-report-action-large-mailbox-p95', { kind: 'p95-ms-lte', value: 150 }],
  ['fsstore-lock-wait-p95', { kind: 'p95-ms-lte', value: 25 }],
  ['data-change-render-debounce-rate', { kind: 'rate-lte', value: 4 }],
  ['spawn-bookkeeping-p95', { kind: 'p95-ms-lte', value: 100 }],
])
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

function assertReleaseGateShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(p95ReleaseGates)), p95ReleaseGates, 'release gates fixture should be plain deterministic data')
  assert.deepEqual(Object.keys(p95ReleaseGates).sort(), REQUIRED_AGGREGATE_FIELDS.sort(), 'release gates aggregate should expose only expected fields')
  assert.equal(p95ReleaseGates.schemaVersion, P95_RELEASE_GATES_SCHEMA_VERSION)
  assert.equal(p95ReleaseGates.theme, P95_RELEASE_GATES_THEME)
  assert.equal(p95ReleaseGates.releaseTarget, V05_RELEASE_TARGET)
  assert.equal(p95ReleaseGates.slice, P95_RELEASE_GATES_SLICE)
  assert.equal(p95ReleaseGates.currentStatus, DEFINED_NOT_YET_PROVEN)
  assert.equal(p95ReleaseGates.ready, false)
  assert.equal(p95ReleaseGates.provesReleaseReady, false)
  assert.equal(p95ReleaseGates.provesP95Pass, false)
  assert.equal(p95ReleaseGates.releaseReadyClaim, false)
  assert.equal(p95ReleaseGates.runtimeBehaviorChanged, false)
  assert.equal(p95ReleaseGates.packageVersionChanged, false)
  assert.equal(p95ReleaseGates.tagCreated, false)
  assert.equal(p95ReleaseGates.npmPublished, false)
  assert.equal(p95ReleaseGates.nativeWorkPerformed, false)
  assert.equal(p95ReleaseGates.defaultGoApproved, false)
  assert.equal(p95ReleaseGates.defaultResolverApproved, false)
  assert.equal(p95ReleaseGates.fallbackDeletionApproved, false)
  assert.equal(p95ReleaseGates.signingApproved, false)
  assert.equal(p95ReleaseGates.secondPlatformApproved, false)
  assert.deepEqual(p95ReleaseGates.gates, p95ReleaseGateDefinitions)
  assert.deepEqual(p95ReleaseGates.gateIds, GATE_IDS)
  assert.deepEqual(p95ReleaseGates.relativeFallback, COMMON_RELATIVE_FALLBACK)
  assert.deepEqual(p95ReleaseGates.stopGates, COMMON_STOP_GATES)
  assertIncludes(p95ReleaseGates.validationCaveat, 'Do not use tests/run.cjs <suite> as focused proof', 'validation caveat')
}

function assertGateEntries(root) {
  assert.deepEqual(p95ReleaseGateDefinitions.map(gate => gate.id), GATE_IDS, 'gate IDs should be deterministic and ordered')
  assert.equal(new Set(p95ReleaseGateDefinitions.map(gate => gate.id)).size, GATE_IDS.length, 'gate IDs should be unique')
  assert.equal(p95ReleaseGateDefinitions.length >= 10, true, 'Slice 3 should define the requested p95 release gates')

  for (const gate of p95ReleaseGateDefinitions) {
    assert.deepEqual(Object.keys(gate).sort(), REQUIRED_GATE_FIELDS.sort(), `${gate.id} should expose required gate fields only`)
    assert.equal(typeof gate.id, 'string', `${gate.id} id`)
    assert.equal(gate.status, DEFINED_NOT_YET_PROVEN, `${gate.id} should be defined but not proven`)
    assert.equal(gate.releaseReadyClaim, false, `${gate.id} must not claim release readiness`)
    assert.equal(typeof gate.scope, 'string', `${gate.id} scope`)
    assert.equal(typeof gate.appOwnedTime, 'string', `${gate.id} appOwnedTime`)
    assert.equal(typeof gate.metric, 'string', `${gate.id} metric`)
    assert.equal(typeof gate.threshold, 'object', `${gate.id} threshold`)
    assert.deepEqual(gate.relativeFallback, COMMON_RELATIVE_FALLBACK, `${gate.id} relative fallback`)
    assert.equal(typeof gate.fixture, 'object', `${gate.id} fixture`)
    assert.deepEqual(gate.env, COMMON_ENV_METADATA, `${gate.id} env metadata`)
    assert.equal(typeof gate.iterations, 'object', `${gate.id} iterations`)
    assert.equal(typeof gate.evidence, 'object', `${gate.id} evidence`)
    assert.equal(Array.isArray(gate.exclusions), true, `${gate.id} exclusions`)
    assert.equal(gate.passFailRecording, COMMON_RECORDING_RULE, `${gate.id} pass/fail recording`)
    assert.equal(Array.isArray(gate.stopConditions), true, `${gate.id} stop conditions`)
    assert.ok(gate.scope.length > 40, `${gate.id} scope should be meaningful`)
    assert.match(gate.appOwnedTime, /Includes|Counts|agentteam|app-owned/i, `${gate.id} should distinguish app-owned time`)
    assert.ok(gate.metric.length > 8, `${gate.id} metric should be meaningful`)
    assert.equal(typeof gate.threshold.kind, 'string', `${gate.id} threshold kind`)
    assert.ok(Object.prototype.hasOwnProperty.call(gate.threshold, 'value'), `${gate.id} threshold value`)
    assert.ok(gate.threshold.unit, `${gate.id} threshold unit`)
    assert.ok(gate.fixture.profile, `${gate.id} fixture profile`)
    assert.ok(gate.fixture.source, `${gate.id} fixture source`)
    if (gate.fixture.source.startsWith('tests/')) assert.equal(exists(root, gate.fixture.source), true, `${gate.id} fixture source should exist`)
    assert.ok(gate.fixture.shape.length > 30, `${gate.id} fixture shape should be meaningful`)
    assert.ok(Object.prototype.hasOwnProperty.call(gate.iterations, 'warmup'), `${gate.id} warmup policy`)
    assert.ok(Object.prototype.hasOwnProperty.call(gate.iterations, 'measured'), `${gate.id} measured policy`)
    assert.ok(gate.iterations.overridePolicy, `${gate.id} iteration override policy`)
    assert.ok(gate.evidence.command, `${gate.id} evidence command`)
    assert.ok(gate.evidence.explicitCommand, `${gate.id} explicit evidence command`)
    assert.equal(Array.isArray(gate.evidence.outputFields), true, `${gate.id} output fields`)
    assert.ok(gate.evidence.outputFields.length >= 3, `${gate.id} should list output fields`)
    assert.ok(gate.exclusions.length >= 3, `${gate.id} should list external exclusions`)
    assert.ok(gate.exclusions.join('\n').match(/LLM|provider|tmux|pi|terminal|worker|external/i), `${gate.id} should exclude external costs`)
    assert.ok(gate.stopConditions.length > COMMON_STOP_GATES.length, `${gate.id} should include gate-specific STOP condition`)
    assert.ok(gate.stopConditions.every(condition => /^STOP\b/.test(condition)), `${gate.id} stop conditions should be explicit STOP gates`)
    assert.equal(gate.stopConditions.some(condition => condition.includes('tests/run.cjs <suite>')), true, `${gate.id} should retain focused-runner STOP gate`)
    const threshold = REQUIRED_THRESHOLDS.get(gate.id)
    if (threshold) {
      assert.equal(gate.threshold.kind, threshold.kind, `${gate.id} threshold kind`)
      assert.equal(gate.threshold.value, threshold.value, `${gate.id} threshold value`)
    }
    const gateText = JSON.stringify(gate)
    for (const forbidden of FORBIDDEN_OVERCLAIMS) assert.equal(gateText.includes(forbidden), false, `${gate.id} must not overclaim: ${forbidden}`)
  }

  const snapshot = p95ReleaseGateDefinitions.find(gate => gate.id === 'global-team-warm-refresh-snapshot-policy')
  assert.match(snapshot.threshold.value, /one snapshot\/list-panes policy/i)
  assert.match(snapshot.stopConditions.join('\n'), /per-member display-message fan-out/i)

  const unchanged = p95ReleaseGateDefinitions.find(gate => gate.id === 'unchanged-state-no-repeated-request-render')
  assert.match(unchanged.threshold.value, /no repeated requestRender/i)
  assert.match(unchanged.evidence.outputFields.join('\n'), /cacheHitCount/)
  assert.match(unchanged.evidence.outputFields.join('\n'), /diffChangedCount/)

  const debounce = p95ReleaseGateDefinitions.find(gate => gate.id === 'data-change-render-debounce-rate')
  assert.equal(debounce.threshold.value, 4)
  assert.match(debounce.threshold.unit, /renders\/sec/)

  const spawn = p95ReleaseGateDefinitions.find(gate => gate.id === 'spawn-bookkeeping-p95')
  assert.match(spawn.exclusions.join('\n'), /external pi startup/i)
  assert.match(spawn.evidence.outputFields.join('\n'), /spawn\.piStartWaitMs/)
}

function assertRelativeFallback() {
  assert.equal(COMMON_RELATIVE_FALLBACK.requiredImprovementPercentAtLeast, 50, 'relative fallback must require >=50% improvement')
  assert.equal(COMMON_RELATIVE_FALLBACK.requiresAcceptedBaselineArtifact, true, 'relative fallback must require accepted baseline artifact')
  assert.match(COMMON_RELATIVE_FALLBACK.comparison, /candidate p95 or count\/rate must be <= 50%/i)
  assert.ok(COMMON_RELATIVE_FALLBACK.acceptedBaselineArtifactMustRecord.includes('artifact path or immutable report reference'))
  assert.ok(COMMON_RELATIVE_FALLBACK.acceptedBaselineArtifactMustRecord.includes('environment metadata'))
  assert.match(COMMON_RELATIVE_FALLBACK.hardInvariantCaveat, /cannot pass a semantic invariant/i)
}

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_DOC_TERMS) assertIncludes(doc, expected, DOC)
  for (const id of GATE_IDS) assertIncludes(doc, `\`${id}\``, DOC)
  for (const forbidden of FORBIDDEN_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/\bpassed final p95\b|\brelease can ship\b|\bready for release\b/i.test(doc), false, `${DOC} must not imply final release gate pass`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(doc), false, `${DOC} must not embed raw hosted/artifact/verifier JSON bodies`)
  assert.match(doc, /current status should remain `defined-not-yet-proven` until a later evidence slice records reviewed pass\/fail artifacts/i)
  assert.match(doc, /does not automatically create a tag/i)
  assert.match(doc, /no tag creation, tag movement, tag push, git push, release creation/i)
  assert.match(doc, /No production TypeScript, Go, command, tool, workflow, readiness, package metadata, package file, or runtime behavior change/i)
}

function assertSourceCommands(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.scripts['bench:state-read-model'], 'PI_AGENTTEAM_PROFILE=1 node tests/bench/team-read-model-baseline.cjs')
  assert.equal(packageJson.scripts['bench:team-panel-tmux'], 'PI_AGENTTEAM_PROFILE=1 node tests/bench/team-panel-tmux-refresh-v0415.cjs')
  const stateBench = read(root, 'tests/bench/team-read-model-baseline.cjs')
  assertIncludes(stateBench, 'byKind', 'state bench source')
  assertIncludes(stateBench, 'lockWaitMs', 'state bench source')
  assertIncludes(stateBench, 'AGENTTEAM_BENCH_ITERATIONS', 'state bench source')
  const panelBench = read(root, 'tests/bench/team-panel-tmux-refresh-v0415.cjs')
  assertIncludes(panelBench, 'attached.panel', 'panel bench source')
  assertIncludes(panelBench, 'global.panel', 'panel bench source')
  assertIncludes(panelBench, 'requestRenderCount', 'panel bench source')
  assertIncludes(panelBench, 'AGENTTEAM_BENCH_ITERATIONS', 'panel bench source')
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
  const productionRootFiles = ['index.ts', 'agents.ts', 'policy.ts', 'renderers.ts', 'session.ts', 'teamPanel.ts']
  const productionFiles = []
  for (const rel of productionRootFiles) if (exists(root, rel)) productionFiles.push(path.join(root, rel))
  for (const rel of productionRoots) {
    const full = path.join(root, rel)
    if (fs.existsSync(full)) walkFiles(full, productionFiles)
  }
  for (const file of productionFiles.filter(file => /\.(?:ts|js|cjs|mjs)$/.test(file))) {
    const source = fs.readFileSync(file, 'utf8')
    assert.equal(source.includes('p95ReleaseGates'), false, `${toRel(root, file)} must not import/read Slice 3 release gates`)
    assert.equal(source.includes('p95ReleaseGateDefinitions'), false, `${toRel(root, file)} must not import/read Slice 3 release gate definitions`)
    assert.equal(source.includes('tests/fixtures/kernel/v0637/p95ReleaseGates.cjs'), false, `${toRel(root, file)} must not import/read Slice 3 fixture path`)
  }
}

function assertArtifactInvariants(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain pi-agentteam temp tarballs')
  const forbiddenArtifacts = []
  const forbiddenRecords = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !ALLOWED_REVIEW_RECORDS.has(rel) && FORBIDDEN_GENERATED_RECORD.test(rel)) forbiddenRecords.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain checked-in native/archive/signing/release artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain generated manifests/checksums/provenance/attestation/raw hosted/release records outside docs/tests/review helper areas')
}

function assertGitignore(root) {
  const gitignore = read(root, '.gitignore')
  assertIncludes(gitignore, `!${DOC}`, '.gitignore')
}

function assertSliceFiles(root) {
  for (const rel of [DOC, FIXTURE, SUITE, P0_LEDGER_FIXTURE, P0_LEDGER_SUITE, BASELINE_FIXTURE, BASELINE_SUITE]) assert.equal(exists(root, rel), true, `${rel} should exist`)
}

module.exports = {
  name: 'Go kernel v0.6.37 v0.5 p95 release gates',
  async run(env) {
    const root = env.helpers.extRoot
    assertSliceFiles(root)
    assertReleaseGateShape(root)
    assertGateEntries(root)
    assertRelativeFallback()
    assertDoc(root)
    assertSourceCommands(root)
    assertPackageRuntimeInvariants(root)
    assertFixtureNotUsedByProduction(root)
    assertArtifactInvariants(root)
    assertGitignore(root)
  },
}
