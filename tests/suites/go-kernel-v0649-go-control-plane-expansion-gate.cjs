const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_ADR,
  ALLOWED_FUTURE_GO_CAPABILITIES,
  EXPANSION_STATUS,
  FACADE_RESPONSIBILITIES,
  FIRST_IMPLEMENTATION_SLICE,
  GO_CONTROL_PLANE_EXPANSION_SCHEMA_VERSION,
  GO_CONTROL_PLANE_EXPANSION_THEME,
  MIGRATION_ORDER,
  PACKAGE_VERSION,
  PRESERVED_PRODUCT_SEMANTICS,
  RELEASE_PACKAGE_GUARDS,
  SUPERSEDED_ADRS,
  TARGET_ARCHITECTURE,
  TMUX_CAPTURE_ENTRY_CRITERIA,
  goControlPlaneExpansionGate,
} = require('../fixtures/kernel/v0649/goControlPlaneExpansionGate.cjs')

const DOC = 'docs/perf/v0.6.49-go-control-plane-expansion-gate.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0649/goControlPlaneExpansionGate.cjs'
const SUITE = 'tests/suites/go-kernel-v0649-go-control-plane-expansion-gate.cjs'
const REQUIRED_DOC = [
  '# v0.6.49 Go Control-Plane Expansion Gate',
  'Result: v0.6.49 accepts the user-authorized architecture direction to expand Go beyond the `tmuxSnapshotParse` parser',
  'This slice does not migrate tmux capture, worker lifecycle, state, task/report/PlanRun, UI, or package/release runtime code yet.',
  'New active ADR: `docs/decisions/0003-go-control-plane-expansion.md`.',
  'ADR 0003 supersedes the future-only “Go must not own control plane” boundary in ADR 0001/0002 for work after v0.6.49.',
  'The TypeScript/pi facade remains the public product entry',
  'main-package embedded Go control-plane core behind TypeScript adapters',
  '`tmuxSnapshotCapture`',
  '`workerLifecycle`',
  '`stateRepository`',
  '`taskReportPlanRun`',
  '`teamPanelViewModel`',
  '`packageReleaseVerify`',
  'visible teammate work remains in tmux panes',
  'leader-gated task governance remains authoritative',
  'non-leader `report_done` and `report_blocked` remain report-only until leader review',
  '`agentteam_receive` remains the mailbox full-text/read boundary',
  '`agentteam_task action=report` remains the TaskReport full-text boundary',
  'workers do not spawn workers',
  'peer reports do not auto-create downstream tasks',
  'PlanRun remains explicit and does not gain a hidden scheduler/autopilot',
  'legacy `teams/-` stays compatible and non-destructive',
  'The first implementation slice after this gate should be `tmuxSnapshotCapture`.',
  'TypeScript caller -> Go tmux list-panes execution -> Go snapshot parse -> compact snapshot result',
  'no state writes',
  'no pane lifecycle mutations',
  'no task/report/PlanRun mutations',
  'parity with `TMUX_PANE_SNAPSHOT_FORMAT`',
  'compact no-leak diagnostics',
  'rollback/default-disable behavior that does not reintroduce hidden TypeScript parser fallback ambiguity',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0649/goControlPlaneExpansionGate.cjs`',
  '`tests/suites/go-kernel-v0649-go-control-plane-expansion-gate.cjs`',
]
const REQUIRED_ADR = [
  '# Decision Record 0003: Go Control-Plane Expansion Gate',
  'Status: accepted for staged implementation after explicit user authorization.',
  'Supersedes: the future-only boundaries in `docs/decisions/0001-replaceable-go-kernel.md` and `docs/decisions/0002-module-owned-go-kernel-cutover.md` for work after v0.6.49.',
  'TypeScript/pi facade backed by a main-package embedded Go control-plane core',
  'tmux capture execution and snapshot parse as one Go-owned adapter',
  'worker pane lifecycle operations behind explicit TypeScript tool/service calls',
  'state read/write and compact read models behind a compatibility-preserving repository port',
  'task/report/PlanRun state transitions while preserving leader-gated governance semantics',
  '`/team` panel view-model generation and render data shaping',
  'release/package verification and package-surface checks',
  'visible teammate work remains in tmux panes',
  'leader-gated task governance remains authoritative',
  'Go must not bypass the registered pi tools, commands, or leader action boundaries by running hidden background automation.',
  'single embedded Go binary with a stable JSON-RPC protocol',
  '`tmuxSnapshotCapture`',
  'The first control-plane expansion slice should be `tmuxSnapshotCapture`',
  'no state writes from the tmux capture path',
  'no pane lifecycle mutations from the capture path',
  'do not leak raw stdout/stderr, cwd, stack traces, mailbox bodies, report bodies, or worker transcripts',
  'Any step may stop and remain partially migrated if validation fails.',
  'This decision does not authorize:',
  '`npm version`',
  '`npm publish`',
  'creating or pushing tags',
  'GitHub releases or release assets',
]
const REQUIRED_ROADMAP = [
  'v0.6.49 Go control-plane expansion gate',
  'docs/perf/v0.6.49-go-control-plane-expansion-gate.md',
  'docs/decisions/0003-go-control-plane-expansion.md',
  'user-authorized architecture direction to expand Go beyond the `tmuxSnapshotParse` parser',
  'TypeScript/pi facade remains public product entry',
  'first implementation slice is `tmuxSnapshotCapture`',
  'tmux capture → worker lifecycle → state repository → task/report/PlanRun → team panel view-model → package/release verification',
  '仍不授权 `npm version`、`npm publish`、tag、GitHub release、second-platform、signing 或 package-manager native delivery',
  '**v0.6.49 Go control-plane expansion gate**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'v0.7 is release ready',
  'package release approved: true',
  'packageReleaseApproved: true',
  'tagReleaseApproved: true',
  'secondPlatformSupportApproved: true',
  'signing approved: true',
]
const RAW_EVIDENCE = /(?:^|\/)(?:.*v0649.*raw.*|.*go-control-plane.*\.json|.*raw-tmux.*|.*tmux.*stdout.*|.*tmux.*stderr.*|.*state-archive.*|.*raw-state.*|.*mailbox.*body.*|.*report.*body.*|.*worker.*transcript.*|.*terminal.*raw.*log.*)$/i
const FORBIDDEN_ARTIFACT = /(?:^|\/)(?:pi-agentteam-.*\.tgz|.*\.(?:tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig))$/i
const ROOT_FORBIDDEN_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
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

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertNoReleaseOverclaims(source, label) {
  for (const forbidden of RELEASE_OVERCLAIMS) assert.equal(source.includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goControlPlaneExpansionGate)), goControlPlaneExpansionGate, 'fixture should be deterministic plain data')
  assert.equal(goControlPlaneExpansionGate.schemaVersion, GO_CONTROL_PLANE_EXPANSION_SCHEMA_VERSION)
  assert.equal(goControlPlaneExpansionGate.theme, GO_CONTROL_PLANE_EXPANSION_THEME)
  assert.equal(goControlPlaneExpansionGate.packageVersion, PACKAGE_VERSION)
  assert.equal(goControlPlaneExpansionGate.activeAdr, ACTIVE_ADR)
  assert.deepEqual(goControlPlaneExpansionGate.supersededAdrs, [...SUPERSEDED_ADRS])
  assert.equal(goControlPlaneExpansionGate.status, EXPANSION_STATUS)
  assert.equal(goControlPlaneExpansionGate.targetArchitecture, TARGET_ARCHITECTURE)
  assert.equal(goControlPlaneExpansionGate.firstImplementationSlice, FIRST_IMPLEMENTATION_SLICE)
  assert.deepEqual(goControlPlaneExpansionGate.facadeResponsibilities, [...FACADE_RESPONSIBILITIES])
  assert.deepEqual(goControlPlaneExpansionGate.allowedFutureGoCapabilities, [...ALLOWED_FUTURE_GO_CAPABILITIES])
  assert.deepEqual(goControlPlaneExpansionGate.preservedProductSemantics, [...PRESERVED_PRODUCT_SEMANTICS])
  assert.deepEqual(goControlPlaneExpansionGate.tmuxCaptureEntryCriteria, [...TMUX_CAPTURE_ENTRY_CRITERIA])
  assert.deepEqual(goControlPlaneExpansionGate.migrationOrder, [...MIGRATION_ORDER])
  assert.deepEqual(goControlPlaneExpansionGate.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.equal(goControlPlaneExpansionGate.runtimeControlPlaneMigratedInThisSlice, false)
  assert.equal(goControlPlaneExpansionGate.packageReleaseApproved, false)
  assert.equal(goControlPlaneExpansionGate.packageVersionChanged, false)
  assert.equal(goControlPlaneExpansionGate.tagReleaseApproved, false)
}

function assertDocs(root) {
  assert.equal(exists(root, ACTIVE_ADR), true, `${ACTIVE_ADR} should exist`)
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  assert.equal(exists(root, ROADMAP), true, `${ROADMAP} should exist`)
  assertIncludes(read(root, '.gitignore'), `!${ACTIVE_ADR}`, '.gitignore')
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const adr = read(root, ACTIVE_ADR)
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  for (const expected of REQUIRED_ADR) assertIncludes(adr, expected, ACTIVE_ADR)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoReleaseOverclaims(adr, ACTIVE_ADR)
  assertNoReleaseOverclaims(doc, DOC)
  assertNoReleaseOverclaims(roadmap, ROADMAP)
}

function assertPackageGuards(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must stay unchanged')
  assert.equal(packageJson.bin, undefined, 'package must not add bin surface in v0.6.49')
  assert.equal(packageJson.optionalDependencies, undefined, 'package must not add optional native packages in v0.6.49')
  assert.equal(packageJson.bundleDependencies, undefined, 'package must not bundle dependencies in v0.6.49')
  assert.equal(packageJson.bundledDependencies, undefined, 'package must not bundle dependencies in v0.6.49')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
}

function assertFirstSliceContract(root) {
  const adr = read(root, ACTIVE_ADR)
  const doc = read(root, DOC)
  assert.equal(FIRST_IMPLEMENTATION_SLICE, 'tmuxSnapshotCapture')
  for (const capability of ALLOWED_FUTURE_GO_CAPABILITIES) assertIncludes(`${adr}\n${doc}`, capability, capability)
  for (const semantic of PRESERVED_PRODUCT_SEMANTICS) assert.equal(goControlPlaneExpansionGate.preservedProductSemantics.includes(semantic), true)
  for (const criterion of TMUX_CAPTURE_ENTRY_CRITERIA) assert.equal(goControlPlaneExpansionGate.tmuxCaptureEntryCriteria.includes(criterion), true)
  assert.equal(goControlPlaneExpansionGate.migrationOrder[0], 'architecture gate')
  assert.equal(goControlPlaneExpansionGate.migrationOrder[1], 'tmux snapshot capture')
}

function assertRuntimeNotMigratedYet(root) {
  const snapshotSource = read(root, 'tmux/snapshot.ts')
  const clientSource = read(root, 'tmux/client.ts')
  const goSource = read(root, 'kernel/go/agentteam-kernel/main.go')
  assert.match(snapshotSource, /createAgentTeamKernelAdapter\(\)\.captureTmuxSnapshot/, 'post-v0.6.49 first slice should migrate tmux capture through the kernel adapter')
  assert.match(clientSource, /execFileSync\(TMUX/, 'TypeScript tmux client should remain for non-capture lifecycle operations')
  assert.match(goSource, /case "tmuxSnapshotCapture"/, 'post-v0.6.49 first slice should add Go tmux capture runtime')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat\)/, 'Go tmux capture must retain list-panes snapshot capture')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "display-message", "-p", workerLifecycleCurrentPaneBindingFormat\)/, 'later v0.6.60 permits only narrow current-pane binding display-message')
  assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "kill-pane", "-t", paneID\)/, 'later v0.6.86 permits only exact argv killPane')
  const goSourceWithoutAllowedKillPane = goSource.replace(/exec\.CommandContext\(ctx, "tmux", "kill-pane", "-t", paneID\)/g, '')
  assert.equal(/kill-pane|send-keys|PI_AGENTTEAM_HOME|team\.json|os\.ReadFile|os\.WriteFile|os\.Create/.test(goSourceWithoutAllowedKillPane), false, 'post-v0.6.49 slices must not migrate mutating lifecycle/state/task/UI runtime beyond exact killPane')
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "display-message", "-p", "-t"/.test(goSource), false, 'Go must not add target-based display-message')
}

function assertRepositoryArtifacts(root) {
  const forbidden = []
  const raw = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (FORBIDDEN_ARTIFACT.test(rel)) forbidden.push(rel)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/') && RAW_EVIDENCE.test(rel)) raw.push(rel)
  }
  assert.deepEqual(forbidden.sort(), [], 'repo must not contain v0.6.49 archive/signing/release artifacts')
  assert.deepEqual(raw.sort(), [], 'repo must not contain raw v0.6.49 evidence files')
}

module.exports = {
  name: 'Go kernel v0.6.49 Go control-plane expansion gate',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertPackageGuards(root)
    assertFirstSliceContract(root)
    assertRuntimeNotMigratedYet(root)
    assertRepositoryArtifacts(root)
  },
}
