const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_OPERATIONS,
  ADAPTER_DELEGATION,
  AUTHORIZED_TMUX_COMMANDS,
  CAPABILITY,
  FACADE_NAME,
  FORBIDDEN_GO_TMUX_COMMANDS,
  GO_WINDOW_MARKING_CUTOVER_SCHEMA_VERSION,
  GO_WINDOW_MARKING_CUTOVER_THEME,
  HELPER_VERSION,
  OPERATION,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  RUNTIME_FILE,
  WINDOW_EXISTENCE_GUARD,
  goWindowMarkingCutover,
} = require('../fixtures/kernel/v0672/goWindowMarkingCutover.cjs')

const DOC = 'docs/perf/v0.6.72-go-window-marking-cutover.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0672/goWindowMarkingCutover.cjs'
const SUITE = 'tests/suites/go-kernel-v0672-go-window-marking-cutover.cjs'
const TMUX_LABELS = 'tmux/labels.ts'
const KERNEL = 'core/kernel.ts'
const GO_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const BUILDER = 'scripts/lib/go-helper-artifact-builder.cjs'
const VERIFIER = 'scripts/lib/go-helper-artifact-verifier.cjs'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const DIRECT_TS_MARKING_CALLS = [
  "runTmuxNoThrowAsync(['set-option', '-w', '-t', target, 'automatic-rename', 'off'], undefined, signal)",
  "runTmuxNoThrowAsync(['set-option', '-w', '-t', target, 'allow-rename', 'off'], undefined, signal)",
  "runTmuxNoThrowAsync(['set-option', '-w', '-t', target, '@agentteam-window', '1'], undefined, signal)",
]
const REQUIRED_DOC = [
  '# v0.6.72 Go Window Marking Cutover',
  'Result: v0.6.72 cuts over `tmux/labels.ts markWindowAsAgentTeam(target, signal)` from direct TypeScript window `set-option` calls to the Go-backed `workerLifecycle.markWindowAsAgentTeam` operation.',
  '`tmux/labels.ts` keeps the explicit `windowExists(target, signal)` authority guard and then delegates to `createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)`.',
  'The direct TypeScript `runTmuxNoThrowAsync([\'set-option\', \'-w\'...])` fallback for the same marking behavior is removed.',
  '`tmux set-option -w -t <target> automatic-rename off`',
  '`tmux set-option -w -t <target> allow-rename off`',
  '`tmux set-option -w -t <target> @agentteam-window 1`',
  'No other Go mutating tmux commands are introduced by this slice.',
  '`refreshWindowPaneLabels(target, signal)` remains TypeScript-owned.',
  'pane labels, pane titles, new-session/new-window, pane creation/layout, wake/kill, state/task/UI/release/package remain TypeScript-owned.',
  'The public facade remains no-throw `Promise<void>`.',
  'helper failure, invalid target, and abort resolve without throwing at the public facade and expose only compact internal diagnostics.',
  'Because Go source changes, the existing embedded helper is rebuilt in the same approved `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc` path with refreshed manifest, checksums, provenance, and placeholder attestation.',
  '`package.json` remains `0.6.8`.',
  '`tests/fixtures/kernel/v0672/goWindowMarkingCutover.cjs`',
  '`tests/suites/go-kernel-v0672-go-window-marking-cutover.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.72 Go window marking cutover',
  'docs/perf/v0.6.72-go-window-marking-cutover.md',
  '`tmux/labels.ts markWindowAsAgentTeam(target, signal)` keeps `windowExists(target, signal)` and delegates to `createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)`',
  'Go `workerLifecycle.markWindowAsAgentTeam` uses only `tmux set-option -w -t <target> automatic-rename off`, `tmux set-option -w -t <target> allow-rename off`, and `tmux set-option -w -t <target> @agentteam-window 1`',
  'direct TypeScript `runTmuxNoThrowAsync([\'set-option\', \'-w\'...])` fallback is removed for the same marking behavior',
  'public facade remains no-throw `Promise<void>`',
  'refreshWindowPaneLabels/pane labels/pane titles/new-session/new-window/pane creation/layout/wake/kill/state/task/UI/release/package remain TypeScript-owned',
  '**v0.6.72 Go window marking cutover**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'refreshWindowPaneLabelsMigrated: true',
  'newSessionMigrated: true',
  'newWindowMigrated: true',
  'createTeammatePaneMigrated: true',
  'wakePaneMigrated: true',
  'killPaneMigrated: true',
  'stateRepositoryMigrated: true',
  'taskReportPlanRunMigrated: true',
  'teamPanelViewModelMigrated: true',
  'releasePackageVerificationMigrated: true',
  'nativeArtifactRenamed: true',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertNoReleaseOverclaims(source, label) {
  for (const forbidden of RELEASE_OVERCLAIMS) assert.equal(source.includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
}

function functionBody(source, name) {
  let start = source.indexOf(`export function ${name}(`)
  if (start === -1) start = source.indexOf(`export async function ${name}(`)
  if (start === -1) start = source.indexOf(`async function ${name}(`)
  assert.notEqual(start, -1, `${name} should exist`)
  const parameterEnd = source.indexOf(')', start)
  assert.notEqual(parameterEnd, -1, `${name} should have parameters`)
  const signatureEnd = source.indexOf('\n', parameterEnd)
  const brace = source.lastIndexOf('{', signatureEnd === -1 ? source.length : signatureEnd)
  assert.ok(brace > parameterEnd, `${name} should have a body`)
  let depth = 0
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  throw new Error(`${name} body should close`)
}

function parseGoCapabilities(source) {
  const body = source.match(/var\s+capabilities\s*=\s*\[\]string\{([^}]+)\}/s)?.[1] || ''
  return [...body.matchAll(/"([^"]+)"/g)].map(match => match[1])
}

function assertFixtureShape(root) {
  assert.equal(exists(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(exists(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goWindowMarkingCutover)), goWindowMarkingCutover)
  assert.equal(goWindowMarkingCutover.schemaVersion, GO_WINDOW_MARKING_CUTOVER_SCHEMA_VERSION)
  assert.equal(goWindowMarkingCutover.theme, GO_WINDOW_MARKING_CUTOVER_THEME)
  assert.equal(goWindowMarkingCutover.packageVersion, PACKAGE_VERSION)
  assert.equal(goWindowMarkingCutover.helperVersion, HELPER_VERSION)
  assert.equal(goWindowMarkingCutover.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goWindowMarkingCutover.capability, CAPABILITY)
  assert.equal(goWindowMarkingCutover.operation, OPERATION)
  assert.equal(goWindowMarkingCutover.facadeName, FACADE_NAME)
  assert.equal(goWindowMarkingCutover.runtimeFile, RUNTIME_FILE)
  assert.equal(goWindowMarkingCutover.windowExistenceGuard, WINDOW_EXISTENCE_GUARD)
  assert.equal(goWindowMarkingCutover.adapterDelegation, ADAPTER_DELEGATION)
  assert.deepEqual(goWindowMarkingCutover.activeOperations, [...ACTIVE_OPERATIONS])
  assert.deepEqual(goWindowMarkingCutover.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(goWindowMarkingCutover.authorizedTmuxCommands, [...AUTHORIZED_TMUX_COMMANDS])
  assert.deepEqual(goWindowMarkingCutover.forbiddenGoTmuxCommands, [...FORBIDDEN_GO_TMUX_COMMANDS])
  assert.deepEqual(goWindowMarkingCutover.preservedBoundaries, [...PRESERVED_BOUNDARIES])
  assert.deepEqual(goWindowMarkingCutover.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.equal(goWindowMarkingCutover.facadeCutoverMigrated, true)
  assert.equal(goWindowMarkingCutover.markWindowAsAgentTeamMigrated, true)
  assert.equal(goWindowMarkingCutover.typescriptSetOptionFallbackRemoved, true)
  assert.equal(goWindowMarkingCutover.windowExistsGuardPreserved, true)
  assert.equal(goWindowMarkingCutover.noThrowVoidFacadePreserved, true)
  assert.equal(goWindowMarkingCutover.rawOutputLeakageAllowed, false)
  assert.equal(goWindowMarkingCutover.helperFailureThrowsPublicly, false)
  assert.equal(goWindowMarkingCutover.invalidTargetThrowsPublicly, false)
  assert.equal(goWindowMarkingCutover.abortThrowsPublicly, false)
  assert.equal(goWindowMarkingCutover.futureCandidateDestructive, false)
  assert.equal(goWindowMarkingCutover.refreshWindowPaneLabelsMigrated, false)
  assert.equal(goWindowMarkingCutover.paneLabelsMigrated, false)
  assert.equal(goWindowMarkingCutover.paneTitlesMigrated, false)
  assert.equal(goWindowMarkingCutover.newSessionMigrated, false)
  assert.equal(goWindowMarkingCutover.newWindowMigrated, false)
  assert.equal(goWindowMarkingCutover.createTeammatePaneMigrated, false)
  assert.equal(goWindowMarkingCutover.wakePaneMigrated, false)
  assert.equal(goWindowMarkingCutover.syncPaneLabelsMigrated, false)
  assert.equal(goWindowMarkingCutover.killPaneMigrated, false)
  assert.equal(goWindowMarkingCutover.stateRepositoryMigrated, false)
  assert.equal(goWindowMarkingCutover.taskReportPlanRunMigrated, false)
  assert.equal(goWindowMarkingCutover.teamPanelViewModelMigrated, false)
  assert.equal(goWindowMarkingCutover.releasePackageVerificationMigrated, false)
  assert.equal(goWindowMarkingCutover.nativeArtifactRenamed, false)
  assert.equal(goWindowMarkingCutover.nativeHelperRebuilt, true)
  assert.equal(goWindowMarkingCutover.goSourceChanged, true)
  assert.equal(goWindowMarkingCutover.packageVersionChanged, false)
  assert.equal(goWindowMarkingCutover.packageReleaseApproved, false)
  assert.equal(goWindowMarkingCutover.npmVersionChanged, false)
  assert.equal(goWindowMarkingCutover.npmPublished, false)
  assert.equal(goWindowMarkingCutover.tagReleaseCreated, false)
  assert.deepEqual(AUTHORIZED_TMUX_COMMANDS.map(command => command.rendered), [
    'tmux set-option -w -t <target> automatic-rename off',
    'tmux set-option -w -t <target> allow-rename off',
    'tmux set-option -w -t <target> @agentteam-window 1',
  ])
}

function assertDocs(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  assertIncludes(read(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoReleaseOverclaims(doc, DOC)
  assertNoReleaseOverclaims(roadmap, ROADMAP)
}

function assertFacadeAndAdapter(root) {
  const labelsSource = read(root, TMUX_LABELS)
  const kernelSource = read(root, KERNEL)
  const markBody = functionBody(labelsSource, FACADE_NAME)
  const refreshBody = functionBody(labelsSource, 'refreshWindowPaneLabels')

  assertIncludes(markBody, `if (!await ${WINDOW_EXISTENCE_GUARD}) return`, `${TMUX_LABELS} window guard`)
  assertIncludes(markBody, ADAPTER_DELEGATION, `${TMUX_LABELS} Go adapter delegation`)
  for (const forbidden of DIRECT_TS_MARKING_CALLS) assert.equal(markBody.includes(forbidden), false, `${TMUX_LABELS} must remove direct TS marking fallback ${forbidden}`)
  assert.equal(markBody.includes('automatic-rename'), false, `${TMUX_LABELS} mark body should not keep automatic-rename implementation`)
  assert.equal(markBody.includes('allow-rename'), false, `${TMUX_LABELS} mark body should not keep allow-rename implementation`)
  assert.equal(markBody.includes('@agentteam-window'), false, `${TMUX_LABELS} mark body should not keep marker implementation`)

  assertIncludes(refreshBody, 'if (!await windowExists(target, signal)) return', 'refreshWindowPaneLabels keeps window guard after v0.6.74')
  assertIncludes(refreshBody, 'createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)', 'refreshWindowPaneLabels is superseded by v0.6.74 Go cutover')
  assert.equal(refreshBody.includes("runTmuxNoThrowAsync(['set-option', '-w', '-t', target, 'pane-border-status', 'top']"), false, 'refreshWindowPaneLabels direct TS pane-border-status fallback removed by v0.6.74')
  assert.equal(refreshBody.includes("runTmuxNoThrowAsync(['set-option', '-w', '-t', target, 'pane-border-format'"), false, 'refreshWindowPaneLabels direct TS pane-border-format fallback removed by v0.6.74')

  assertIncludes(kernelSource, 'export type AgentTeamKernelWindowMarking', KERNEL)
  assertIncludes(kernelSource, 'markWindowAsAgentTeamAsync(target: string, signal?: AbortSignal): Promise<AgentTeamKernelWindowMarking>', KERNEL)
  assertIncludes(kernelSource, "operation: 'markWindowAsAgentTeam'", KERNEL)
  assertIncludes(kernelSource, "callHelperAsync<unknown>('workerLifecycle', { operation: 'markWindowAsAgentTeam', target: requestedTarget }, signal)", KERNEL)
  assertIncludes(kernelSource, 'workerLifecycleMarkWindowAsAgentTeamConnected', KERNEL)
  assertIncludes(kernelSource, 'readOnly: false', KERNEL)
  assertIncludes(kernelSource, 'tmuxMutation: true', KERNEL)
}

function assertGoRuntime(root) {
  const goSource = read(root, GO_SOURCE)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  for (const operation of ACTIVE_OPERATIONS) assert.match(goSource, new RegExp(`case "${operation}"`), `${GO_SOURCE} should include workerLifecycle ${operation}`)
  assertIncludes(goSource, 'type workerWindowMarkingResult struct', GO_SOURCE)
  assertIncludes(goSource, 'func markWindowAsAgentTeam(params map[string]any) workerWindowMarkingResult', GO_SOURCE)
  assertIncludes(goSource, 'func runWindowMarkingSetOption(target string, option string, value string) string', GO_SOURCE)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-w", "-t", target, option, value)', GO_SOURCE)
  for (const command of AUTHORIZED_TMUX_COMMANDS) {
    assertIncludes(goSource, `runWindowMarkingSetOption(target, "${command.option}", "${command.value}")`, `${GO_SOURCE} authorized ${command.option}`)
  }
  assertIncludes(goSource, 'func refreshWindowPaneLabels(params map[string]any) workerWindowPaneLabelsRefreshResult', `${GO_SOURCE} v0.6.74 refresh runtime implementation`)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-status", "top")', `${GO_SOURCE} v0.6.74 authorized pane-border-status`)
  assertIncludes(goSource, 'runWindowPaneLabelsSetOption(target, "pane-border-format", "#{?@agentteam-name,#{@agentteam-name},#{pane_title}}")', `${GO_SOURCE} v0.6.74 authorized pane-border-format`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS.filter(command => command !== 'select-pane')) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE} must not add forbidden command ${command}`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", label)', `${GO_SOURCE} later v0.6.76 authorized pane-title command`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "set-option", "-up", "-t", paneID, "@agentteam-name")', `${GO_SOURCE} later v0.6.78 authorized pane label clearing`)
  assertIncludes(goSource, 'exec.CommandContext(ctx, "tmux", "select-pane", "-t", paneID, "-T", "")', `${GO_SOURCE} later v0.6.78 authorized pane title clearing`)
}

function assertArtifactPipeline(root) {
  const builder = read(root, BUILDER)
  const verifier = read(root, VERIFIER)
  const manifest = JSON.parse(read(root, `${NATIVE_ROOT}/manifest.json`))
  const provenance = JSON.parse(read(root, `${NATIVE_ROOT}/provenance.json`))
  const checksums = read(root, `${NATIVE_ROOT}/SHA256SUMS`)

  assertIncludes(builder, 'runWorkerLifecycleMarkWindowAsAgentTeamSmoke', BUILDER)
  assertIncludes(builder, 'workerLifecycleMarkWindowAsAgentTeam', BUILDER)
  assertIncludes(verifier, 'workerLifecycleMarkWindowAsAgentTeam', VERIFIER)
  assert.equal(manifest.packageVersion, PACKAGE_VERSION)
  assert.equal(manifest.helperVersion, HELPER_VERSION)
  assert.equal(manifest.protocolVersion, PROTOCOL_VERSION)
  assert.deepEqual(manifest.capabilities, [...ACTIVE_CAPABILITIES])
  assert.equal(manifest.module, 'tmuxSnapshotParse')
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse')
  assert.equal(manifest.smoke.health, true)
  assert.equal(manifest.smoke.workerLifecycleMarkWindowAsAgentTeam.ok, false)
  assert.deepEqual(manifest.smoke.workerLifecycleMarkWindowAsAgentTeam.acceptedFailureKinds, ['invalid-target'])
  assert.equal(provenance.smoke.workerLifecycleMarkWindowAsAgentTeam.ok, false)
  assertIncludes(checksums, `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`, 'native checksums')
  assertIncludes(checksums, `${NATIVE_ROOT}/manifest.json`, 'native checksums')
  assertIncludes(checksums, `${NATIVE_ROOT}/provenance.json`, 'native checksums')
}

function assertPackageGuards(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.optionalDependencies, undefined)
  assert.equal(packageJson.bundleDependencies, undefined)
  assert.equal(packageJson.bundledDependencies, undefined)
  assert.equal(packageJson.bin, undefined)
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  assert.equal(exists(root, `${NATIVE_ROOT}/agentteam-tmuxSnapshotParse`), true, 'existing native helper should remain present')
  assert.equal(exists(root, `${NATIVE_ROOT}/manifest.json`), true, 'existing native manifest should remain present')
  assert.equal(exists(root, `${NATIVE_ROOT}/SHA256SUMS`), true, 'existing native checksums should remain present')
}

module.exports = {
  name: 'Go kernel v0.6.72 Go window marking cutover',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertFacadeAndAdapter(root)
    assertGoRuntime(root)
    assertArtifactPipeline(root)
    assertPackageGuards(root)
  },
}
