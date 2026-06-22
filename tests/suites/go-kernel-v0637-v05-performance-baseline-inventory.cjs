const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  BASELINE_ONLY_NOTE,
  BENCHMARK_IDS,
  COMMON_NON_GOALS,
  FUTURE_GATE_OWNER,
  PERFORMANCE_BASELINE_INVENTORY_SCHEMA_VERSION,
  PERFORMANCE_BASELINE_INVENTORY_SLICE,
  PERFORMANCE_BASELINE_INVENTORY_THEME,
  REPRODUCIBILITY_RULES,
  V05_RELEASE_TARGET,
  performanceBaselineBenchmarks,
  performanceBaselineInventory,
} = require('../fixtures/kernel/v0637/performanceBaselineInventory.cjs')

const DOC = 'docs/perf/v0.6.37-v0.5-release-readiness-burndown.md'
const FIXTURE = 'tests/fixtures/kernel/v0637/performanceBaselineInventory.cjs'
const SUITE = 'tests/suites/go-kernel-v0637-v05-performance-baseline-inventory.cjs'
const P0_LEDGER_FIXTURE = 'tests/fixtures/kernel/v0637/p0ReadinessLedger.cjs'
const P0_LEDGER_SUITE = 'tests/suites/go-kernel-v0637-v05-p0-readiness-ledger.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_BENCH_FIELDS = [
  'baselineOnly',
  'command',
  'defaultFixtureProfile',
  'docs',
  'env',
  'expectedOutputFields',
  'explicitCommand',
  'fixtureProfiles',
  'futureGate',
  'futureGateOwner',
  'id',
  'leakGuard',
  'measuredIterations',
  'metadataFields',
  'nonGoals',
  'releaseReadyClaim',
  'runtimeIsolation',
  'scope',
  'source',
  'tmuxMode',
  'warmupIterations',
]
const REQUIRED_DOC = [
  '# v0.6.37 v0.5 Release Readiness Burn-down',
  '## Slice 2 — Performance baseline inventory and reproducible harness check',
  '`tests/fixtures/kernel/v0637/performanceBaselineInventory.cjs`',
  '`tests/suites/go-kernel-v0637-v05-performance-baseline-inventory.cjs`',
  'Slice 2 proves inventory and reproducibility of existing performance harnesses only.',
  'It does not prove v0.5 p95 pass/fail, release-ready status, default-Go readiness, native/package availability, npm publish readiness, tag readiness, or runtime behavior changes.',
  'Slice 3 now defines final v0.5 p95 release gates and pass/fail threshold criteria; a later evidence slice must record fresh run artifacts and reviewed pass/fail results.',
  '### Existing benchmark / harness inventory',
  '`npm run bench:state-read-model`',
  '`npm run bench:team-panel-tmux`',
  '`PI_AGENTTEAM_PROFILE=1` profiling harness',
  '### Baseline-only versus future p95 gates',
  'Current benchmark `note` semantics remain `baseline only; not a release target pass/fail gate`.',
  '### Reproducibility rules',
  'record `node --version` and `npm --version` with any reviewer run.',
  'Use `AGENTTEAM_BENCH_FIXTURE=baseline` for default inventory runs; `AGENTTEAM_BENCH_FIXTURE=stress` or `large` is scalability shape only, not a release gate.',
  'State/read-model bench uses a stub runtime repository and no real tmux/pi/LLM dependency.',
  'Team-panel/tmux bench uses a fake tmux client and fake TUI; it does not prove real tmux/manual RC behavior.',
  'Benchmark JSON must be preserved as reviewer evidence when used for later gate work, but this Slice 2 doc does not check in local output JSON.',
  'Benchmark JSON must not include full mailbox/report body sentinels.',
  '### Slice 2 validation expectations',
  'Do not treat local timing numbers from Slice 2 as release pass/fail evidence.',
]
const REQUIRED_DOC_TERMS = [
  'BENCH_STATE_READ_MODEL_FULL_BODY_SENTINEL_SHOULD_NOT_LEAK',
  'BENCH_PANEL_TMUX_V0415_FULL_BODY_SENTINEL_SHOULD_NOT_LEAK',
  'PROFILE_FULL_BODY_SENTINEL',
  'fixtureProfile',
  'implementation',
  'kernel',
  'fsStore.byKind.lock',
  'fsStore.byKind.read',
  'fsStore.byKind.parse',
  'fsStore.byKind.write',
  'attached.panel.dataLoadMs',
  'global.panel.renderMs',
  'summary.fsStore.events',
  'summary.tmux.commandCount',
  'summary.panel.dataLoadCount',
]
const FORBIDDEN_OVERCLAIMS = [
  'p95 gate passed',
  'p95 gates passed',
  'final p95 gate passed',
  'release-ready status is proven',
  'release ready status is proven',
  'v0.5 release-ready',
  'v0.5 release ready',
  'default Go is enabled',
  'default Go is approved',
  'default resolver is enabled',
  'default resolver is approved',
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'native helper delivery is complete',
  'native package delivery is complete',
  'package-manager native delivery is complete',
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
  'tag was created',
  'tag was pushed',
  'npm version completed',
  'npm publish completed',
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

function assertInventoryShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(performanceBaselineInventory)), performanceBaselineInventory, 'performance inventory should be plain deterministic data')
  assert.deepEqual(Object.keys(performanceBaselineInventory).sort(), [
    'baselineOnly',
    'benchmarks',
    'defaultGoApproved',
    'futureP95GateSlice',
    'nativeWorkPerformed',
    'nonGoals',
    'npmPublished',
    'packageVersionChanged',
    'provesP95ReleaseGate',
    'provesReleaseReady',
    'ready',
    'releaseTarget',
    'reproducibilityRules',
    'runtimeBehaviorChanged',
    'schemaVersion',
    'slice',
    'tagCreated',
    'theme',
  ].sort(), 'performance inventory should expose only expected aggregate fields')
  assert.equal(performanceBaselineInventory.schemaVersion, PERFORMANCE_BASELINE_INVENTORY_SCHEMA_VERSION)
  assert.equal(performanceBaselineInventory.theme, PERFORMANCE_BASELINE_INVENTORY_THEME)
  assert.equal(performanceBaselineInventory.releaseTarget, V05_RELEASE_TARGET)
  assert.equal(performanceBaselineInventory.slice, PERFORMANCE_BASELINE_INVENTORY_SLICE)
  assert.equal(performanceBaselineInventory.ready, false)
  assert.equal(performanceBaselineInventory.provesP95ReleaseGate, false)
  assert.equal(performanceBaselineInventory.provesReleaseReady, false)
  assert.equal(performanceBaselineInventory.baselineOnly, true)
  assert.equal(performanceBaselineInventory.futureP95GateSlice, 'Slice 3')
  assert.equal(performanceBaselineInventory.runtimeBehaviorChanged, false)
  assert.equal(performanceBaselineInventory.packageVersionChanged, false)
  assert.equal(performanceBaselineInventory.tagCreated, false)
  assert.equal(performanceBaselineInventory.npmPublished, false)
  assert.equal(performanceBaselineInventory.nativeWorkPerformed, false)
  assert.equal(performanceBaselineInventory.defaultGoApproved, false)
  assert.deepEqual(performanceBaselineInventory.benchmarks, performanceBaselineBenchmarks)
  assert.deepEqual(performanceBaselineInventory.reproducibilityRules, REPRODUCIBILITY_RULES)
  assert.deepEqual(performanceBaselineInventory.nonGoals, COMMON_NON_GOALS)
}

function assertBenchmarkEntries(root) {
  assert.deepEqual(performanceBaselineBenchmarks.map(entry => entry.id), BENCHMARK_IDS, 'benchmark IDs should be deterministic and ordered')
  assert.equal(new Set(performanceBaselineBenchmarks.map(entry => entry.id)).size, BENCHMARK_IDS.length, 'benchmark IDs should be unique')
  for (const entry of performanceBaselineBenchmarks) {
    assert.deepEqual(Object.keys(entry).sort(), REQUIRED_BENCH_FIELDS.sort(), `${entry.id} should expose required benchmark fields only`)
    assert.equal(typeof entry.id, 'string', `${entry.id} id`)
    assert.equal(typeof entry.command, 'string', `${entry.id} command`)
    assert.equal(typeof entry.explicitCommand, 'string', `${entry.id} explicitCommand`)
    assert.equal(typeof entry.scope, 'string', `${entry.id} scope`)
    assert.equal(typeof entry.source, 'string', `${entry.id} source`)
    assert.equal(typeof entry.docs, 'string', `${entry.id} docs`)
    assert.equal(Array.isArray(entry.fixtureProfiles), true, `${entry.id} fixtureProfiles`)
    assert.equal(typeof entry.defaultFixtureProfile, 'string', `${entry.id} defaultFixtureProfile`)
    assert.equal(Array.isArray(entry.env), true, `${entry.id} env`)
    assert.equal(typeof entry.runtimeIsolation, 'string', `${entry.id} runtimeIsolation`)
    assert.equal(typeof entry.tmuxMode, 'string', `${entry.id} tmuxMode`)
    assert.equal(Array.isArray(entry.expectedOutputFields), true, `${entry.id} expectedOutputFields`)
    assert.equal(Array.isArray(entry.metadataFields), true, `${entry.id} metadataFields`)
    assert.equal(typeof entry.leakGuard, 'object', `${entry.id} leakGuard`)
    assert.equal(entry.baselineOnly, true, `${entry.id} should be baseline-only`)
    assert.equal(entry.futureGate, true, `${entry.id} should identify future gate relevance`)
    assert.equal(entry.futureGateOwner, FUTURE_GATE_OWNER, `${entry.id} future gate owner`)
    assert.equal(entry.releaseReadyClaim, false, `${entry.id} should not claim release-ready`)
    assert.deepEqual(entry.nonGoals, COMMON_NON_GOALS, `${entry.id} nonGoals should be common guardrails`)
    assert.ok(entry.command.length > 10, `${entry.id} command should be meaningful`)
    assert.ok(entry.explicitCommand.length > 10, `${entry.id} explicitCommand should be meaningful`)
    assert.ok(entry.scope.length > 40, `${entry.id} scope should be meaningful`)
    assert.ok(exists(root, entry.source), `${entry.id} source should exist: ${entry.source}`)
    assert.ok(exists(root, entry.docs), `${entry.id} docs should exist: ${entry.docs}`)
    assert.ok(entry.fixtureProfiles.length >= 1, `${entry.id} should define fixture profiles or source fixture`)
    assert.ok(entry.env.length >= 1, `${entry.id} should define env expectations`)
    assert.ok(entry.runtimeIsolation.includes('temporary') || entry.runtimeIsolation.includes('temp'), `${entry.id} should document temp isolation`)
    assert.ok(/fake|stub|no real tmux/i.test(entry.tmuxMode), `${entry.id} should document tmux fake/stub boundary`)
    assert.ok(entry.expectedOutputFields.length >= 8, `${entry.id} should list expected output fields`)
    assert.ok(entry.metadataFields.length >= 4, `${entry.id} should list metadata fields`)
    assert.equal(typeof entry.leakGuard.sentinel, 'string', `${entry.id} leak sentinel`)
    assert.ok(entry.leakGuard.sentinel.length > 10, `${entry.id} leak sentinel should be meaningful`)
    assert.match(entry.leakGuard.sourceBodies, /TaskReport\.text|MailboxMessage\.text|mailbox|report/i, `${entry.id} should identify full-body source`)
    assert.match(entry.leakGuard.outputPolicy, /sentinel|JSON|summary/i, `${entry.id} should explain no-leak output policy`)
    const claimText = [entry.command, entry.explicitCommand, entry.scope, entry.runtimeIsolation, entry.tmuxMode, ...entry.expectedOutputFields, ...entry.metadataFields, entry.leakGuard.outputPolicy].join('\n')
    for (const forbidden of FORBIDDEN_OVERCLAIMS) assert.equal(claimText.includes(forbidden), false, `${entry.id} must not overclaim: ${forbidden}`)
  }

  const state = performanceBaselineBenchmarks.find(entry => entry.id === 'state-read-model-baseline')
  assertIncludes(state.command, 'npm run bench:state-read-model', state.id)
  assertIncludes(state.explicitCommand, 'PI_AGENTTEAM_PROFILE=1 node tests/bench/team-read-model-baseline.cjs', state.id)
  assert.ok(state.fixtureProfiles.some(profile => profile.name === 'baseline' && profile.warmupIterations === 1 && profile.measuredIterations === 5), 'state bench should record baseline iterations')
  assert.ok(state.fixtureProfiles.some(profile => profile.name === 'stress' && profile.measuredIterations === 3), 'state bench should record stress profile')
  for (const field of ['panel.dataLoadMs', 'panel.readModelMs', 'fsStore.byKind.read', 'fsStore.byCallSite', 'tmux.stubCallCount', 'kernel', 'fixtureProfile']) assert.ok(state.expectedOutputFields.includes(field), `state bench should list ${field}`)

  const panel = performanceBaselineBenchmarks.find(entry => entry.id === 'team-panel-tmux-refresh')
  assertIncludes(panel.command, 'npm run bench:team-panel-tmux', panel.id)
  assertIncludes(panel.explicitCommand, 'PI_AGENTTEAM_PROFILE=1 node tests/bench/team-panel-tmux-refresh-v0415.cjs', panel.id)
  assert.ok(panel.fixtureProfiles.some(profile => profile.name === 'baseline' && profile.warmupIterations === 1 && profile.measuredIterations === 5), 'panel bench should record baseline iterations')
  assert.ok(panel.fixtureProfiles.some(profile => profile.name === 'large' && profile.measuredIterations === 3), 'panel bench should record large profile')
  for (const field of ['attached.panel.dataLoadMs', 'attached.tmux.commandCount', 'global.panel.renderMs', 'global.tmux.commandNames', 'attached.cacheHitCount', 'global.diffChangedCount']) assert.ok(panel.expectedOutputFields.includes(field), `panel bench should list ${field}`)

  const profiling = performanceBaselineBenchmarks.find(entry => entry.id === 'profiling-harness')
  assertIncludes(profiling.explicitCommand, 'PI_AGENTTEAM_PROFILE=1', profiling.id)
  assert.equal(profiling.warmupIterations, 'not applicable; source suite asserts profiling event shape rather than timing percentiles')
  assert.equal(profiling.measuredIterations, 'not applicable; source suite asserts profiling event shape rather than timing percentiles')
  for (const field of ['summary.fsStore.events', 'summary.tmux.commandCount', 'summary.panel.dataLoadCount', 'summary.panel.events']) assert.ok(profiling.expectedOutputFields.includes(field), `profiling harness should list ${field}`)
}

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_DOC_TERMS) assertIncludes(doc, expected, DOC)
  for (const id of BENCHMARK_IDS) assertIncludes(doc, `\`${id}\``, DOC)
  for (const rule of REPRODUCIBILITY_RULES) assertIncludes(doc, rule, DOC)
  for (const forbidden of FORBIDDEN_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(doc), false, `${DOC} must not embed raw hosted/artifact/verifier JSON bodies`)
  assert.equal(/\bpassed final p95\b|\brelease can ship\b|\bready for release\b/i.test(doc), false, `${DOC} must not imply final release gate pass`)
}

function assertSourceCommands(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.scripts['bench:state-read-model'], 'PI_AGENTTEAM_PROFILE=1 node tests/bench/team-read-model-baseline.cjs')
  assert.equal(packageJson.scripts['bench:team-panel-tmux'], 'PI_AGENTTEAM_PROFILE=1 node tests/bench/team-panel-tmux-refresh-v0415.cjs')
  const stateSource = read(root, 'tests/bench/team-read-model-baseline.cjs')
  assertIncludes(stateSource, "note: 'baseline only; not a release target pass/fail gate'", 'state bench source')
  assertIncludes(stateSource, 'AGENTTEAM_BENCH_FIXTURE', 'state bench source')
  assertIncludes(stateSource, 'AGENTTEAM_BENCH_ITERATIONS', 'state bench source')
  assertIncludes(stateSource, 'AGENTTEAM_BENCH_WARMUP', 'state bench source')
  assertIncludes(stateSource, 'BENCH_STATE_READ_MODEL_FULL_BODY_SENTINEL_SHOULD_NOT_LEAK', 'state bench source')
  assertIncludes(stateSource, 'if (serialized.includes(BENCH_SENTINEL)) throw new Error', 'state bench source')
  const panelSource = read(root, 'tests/bench/team-panel-tmux-refresh-v0415.cjs')
  assertIncludes(panelSource, "note: 'baseline only; not a release target pass/fail gate'", 'panel bench source')
  assertIncludes(panelSource, 'AGENTTEAM_BENCH_FIXTURE', 'panel bench source')
  assertIncludes(panelSource, 'AGENTTEAM_BENCH_ITERATIONS', 'panel bench source')
  assertIncludes(panelSource, 'AGENTTEAM_BENCH_WARMUP', 'panel bench source')
  assertIncludes(panelSource, 'BENCH_PANEL_TMUX_V0415_FULL_BODY_SENTINEL_SHOULD_NOT_LEAK', 'panel bench source')
  assertIncludes(panelSource, 'if (serialized.includes(BENCH_SENTINEL)) throw new Error', 'panel bench source')
  const profilingSource = read(root, 'tests/suites/profiling-harness.cjs')
  assertIncludes(profilingSource, 'PI_AGENTTEAM_PROFILE', 'profiling harness source')
  assertIncludes(profilingSource, 'PROFILE_FULL_BODY_SENTINEL', 'profiling harness source')
  assertIncludes(profilingSource, 'profiling summary must not include full mailbox/report body sentinels', 'profiling harness source')
  assert.equal(BASELINE_ONLY_NOTE, 'baseline only; not a release target pass/fail gate')
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
    assert.equal(source.includes('performanceBaselineInventory'), false, `${toRel(root, file)} must not import/read Slice 2 performance inventory`)
    assert.equal(source.includes('performanceBaselineBenchmarks'), false, `${toRel(root, file)} must not import/read Slice 2 performance benchmarks`)
    assert.equal(source.includes('tests/fixtures/kernel/v0637/performanceBaselineInventory.cjs'), false, `${toRel(root, file)} must not import/read Slice 2 fixture path`)
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

function assertSliceFiles(root) {
  for (const rel of [DOC, FIXTURE, SUITE, P0_LEDGER_FIXTURE, P0_LEDGER_SUITE]) assert.equal(exists(root, rel), true, `${rel} should exist`)
}

module.exports = {
  name: 'Go kernel v0.6.37 v0.5 performance baseline inventory',
  async run(env) {
    const root = env.helpers.extRoot
    assertSliceFiles(root)
    assertInventoryShape(root)
    assertBenchmarkEntries(root)
    assertDoc(root)
    assertSourceCommands(root)
    assertPackageRuntimeInvariants(root)
    assertFixtureNotUsedByProduction(root)
    assertArtifactInvariants(root)
  },
}
