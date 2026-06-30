const assert = require('node:assert/strict')
const {
  assertIncludes,
  assertNoOverclaims,
  existsRel,
  readRel,
} = require('../helpers/fsAssertions.cjs')
const { assertPackageNoReleaseGuards } = require('../helpers/packageGuards.cjs')
const { assertNativeArtifactSnapshot } = require('../helpers/nativeGuards.cjs')
const {
  assertNoBridgeTerminalTransport,
  escapeRegExp,
  functionBody,
  parseGoCapabilities,
  parseGoWorkerLifecycleCases,
  sourceWithoutLineComments,
} = require('../helpers/goKernelGuards.cjs')
const {
  ACTIVE_CAPABILITIES,
  ACTIVE_WORKER_LIFECYCLE_OPERATIONS,
  BRIDGE_DELIVERY_FILE,
  BRIDGE_DELIVERY_PUMP_FILE,
  BRIDGE_REQUEST_FILE,
  CONFIG_FILE,
  CONFIG_POLICY_SURFACE,
  DELIVERY_FLOW_PRODUCERS,
  DELIVERY_FLOW_ROUTING,
  DELIVERY_POLICY_FILE,
  DELIVERY_POLICY_SURFACE,
  DELIVERY_REQUEST_SERVICE_FILE,
  DELIVERY_STORE_FILE,
  DELIVERY_TYPES_FILE,
  FORBIDDEN_GO_TMUX_COMMANDS,
  FUTURE_TERMINAL_WAKE_DESIGN_GATE_REQUIREMENTS,
  GO_SOURCE_FILE,
  GO_WORKER_DELIVERY_BOUNDARY_GATE_SCHEMA_VERSION,
  GO_WORKER_DELIVERY_BOUNDARY_GATE_THEME,
  HELPER_VERSION,
  KERNEL_CONTRACT_FILE,
  KERNEL_FILE,
  MESSAGE_APPLICATION_FILE,
  MESSAGE_POLICY_FILE,
  NATIVE_ARTIFACT_SNAPSHOT,
  NATIVE_ROOT,
  OUTBOX_EFFECT_HANDLERS_FILE,
  OUTBOX_FILE,
  OUTBOX_MODEL_FILE,
  OUTBOX_WORKER_DELIVERY_KIND,
  PACKAGE_VERSION,
  PRESERVED_RUNTIME_SURFACES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  TASK_SIDE_EFFECTS_FILE,
  TMUX_LABELS_FILE,
  TMUX_PANES_FILE,
  TMUX_WINDOWS_FILE,
  WORKER_SPAWN_FILE,
  goWorkerDeliveryBoundaryGate,
} = require('../fixtures/kernel/v0689/goWorkerDeliveryBoundaryGate.cjs')

const DOC = 'docs/perf/v0.6.89-go-worker-delivery-boundary-gate.md'
const ROADMAP = 'docs/agentteam方案书.md'
const FIXTURE = 'tests/fixtures/kernel/v0689/goWorkerDeliveryBoundaryGate.cjs'
const SUITE = 'tests/suites/go-kernel-v0689-go-worker-delivery-boundary-gate.cjs'
const ROOT_FORBIDDEN_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']
const REQUIRED_DOC = [
  '# v0.6.89 Go Worker Delivery Boundary Gate',
  'Result: v0.6.89 is gate-only evidence for the worker delivery/wake boundary.',
  'AgentTeam worker delivery is bridge-only TypeScript-owned outbox/bridge orchestration, not legacy terminal/tmux `send-keys` delivery.',
  'This gate does not authorize Go `send-keys`, Go `wakePane`, terminal transport revival, or a runtime cutover.',
  '`deliveryPolicy.ts` still exposes only `export type AgentTeamDeliveryPolicyName = \'bridge-only\'`',
  '`DEFAULT_DELIVERY_POLICY = BRIDGE_ONLY_DELIVERY_POLICY`',
  '`config.ts` rejects `deliveryMode` with `deliveryMode_unsupported`',
  '`app/messageApplication.ts` enqueues `kind: \'worker_delivery_requested\'`',
  '`app/taskSideEffects.ts` enqueues `kind: \'worker_delivery_requested\'`',
  '`tools/workerSpawnService.ts` enqueues `kind: \'worker_delivery_requested\'`',
  '`app/outbox.ts` maps `worker_delivery_requested` to `requestWorkerDelivery`',
  '`adapters/runtime/outboxEffectHandlers.ts` invokes `requestWorkerDelivery(...)`',
  '`core/messagePolicy.ts` may classify assignment/question attention as `worker_delivery`, but that means bridge delivery, not tmux send-keys.',
  'Bridge/runtime delivery request modules remain TypeScript-owned',
  '`runtime/bridgeDeliveryPump.ts` submits through pi bridge APIs (`sendUserMessage` / `sendMessage`), not tmux.',
  'Current Go source has no `send-keys` command and no active `wakePane` worker lifecycle operation/case.',
  'Current native manifest has no `workerLifecycleWakePane` smoke key.',
  'Future terminal/tmux wake/send-keys is NOT authorized by this gate.',
  'a separate explicit design gate defining the exact command surface',
  'message/worker prompt redaction and raw body leakage policy',
  'state side effects and idempotency semantics',
  'interaction with bridge-only delivery policy and rollback',
  'security model for opaque prompt text',
  'tests and manual/operator evidence',
  '`package.json` remains `0.6.8`',
  '`tests/fixtures/kernel/v0689/goWorkerDeliveryBoundaryGate.cjs`',
  '`tests/suites/go-kernel-v0689-go-worker-delivery-boundary-gate.cjs`',
]
const REQUIRED_ROADMAP = [
  'v0.6.89 Go worker delivery boundary gate',
  'docs/perf/v0.6.89-go-worker-delivery-boundary-gate.md',
  'AgentTeam worker delivery is bridge-only TypeScript-owned outbox/bridge orchestration',
  'not legacy terminal/tmux `send-keys` delivery',
  'does not authorize Go `send-keys`, Go `wakePane`, terminal transport revival, or runtime cutover',
  'future terminal/tmux wake/send-keys requires a separate explicit design gate',
  '**v0.6.89 Go worker delivery boundary gate**',
]
const RELEASE_OVERCLAIMS = [
  'npm publish completed',
  'npm version completed',
  'tag was created',
  'tag was pushed',
  'GitHub release created',
  'release can ship',
  'v0.7 is release-ready',
  'Go send-keys authorized',
  'Go wakePane implemented',
  'workerLifecycleWakePane smoke added',
  'terminal delivery mode revived',
  'runtime delivery cutover completed',
  'native helper rebuilt',
  'packageVersionChanged: true',
]
function assertFixtureShape(root) {
  assert.equal(existsRel(root, FIXTURE), true, `${FIXTURE} should exist`)
  assert.equal(existsRel(root, SUITE), true, `${SUITE} should exist`)
  assert.deepEqual(JSON.parse(JSON.stringify(goWorkerDeliveryBoundaryGate)), goWorkerDeliveryBoundaryGate)
  assert.equal(goWorkerDeliveryBoundaryGate.schemaVersion, GO_WORKER_DELIVERY_BOUNDARY_GATE_SCHEMA_VERSION)
  assert.equal(goWorkerDeliveryBoundaryGate.theme, GO_WORKER_DELIVERY_BOUNDARY_GATE_THEME)
  assert.equal(goWorkerDeliveryBoundaryGate.packageVersion, PACKAGE_VERSION)
  assert.equal(goWorkerDeliveryBoundaryGate.helperVersion, HELPER_VERSION)
  assert.equal(goWorkerDeliveryBoundaryGate.protocolVersion, PROTOCOL_VERSION)
  assert.equal(goWorkerDeliveryBoundaryGate.deliveryPolicyFile, DELIVERY_POLICY_FILE)
  assert.equal(goWorkerDeliveryBoundaryGate.configFile, CONFIG_FILE)
  assert.equal(goWorkerDeliveryBoundaryGate.outboxWorkerDeliveryKind, OUTBOX_WORKER_DELIVERY_KIND)
  assert.deepEqual(goWorkerDeliveryBoundaryGate.deliveryPolicySurface, DELIVERY_POLICY_SURFACE)
  assert.deepEqual(goWorkerDeliveryBoundaryGate.configPolicySurface, CONFIG_POLICY_SURFACE)
  assert.deepEqual(goWorkerDeliveryBoundaryGate.deliveryFlowProducers, [...DELIVERY_FLOW_PRODUCERS])
  assert.deepEqual(goWorkerDeliveryBoundaryGate.deliveryFlowRouting, DELIVERY_FLOW_ROUTING)
  assert.deepEqual(goWorkerDeliveryBoundaryGate.futureTerminalWakeDesignGateRequirements, [...FUTURE_TERMINAL_WAKE_DESIGN_GATE_REQUIREMENTS])
  assert.deepEqual(goWorkerDeliveryBoundaryGate.activeCapabilities, [...ACTIVE_CAPABILITIES])
  assert.deepEqual(goWorkerDeliveryBoundaryGate.activeWorkerLifecycleOperations, [...ACTIVE_WORKER_LIFECYCLE_OPERATIONS])
  assert.deepEqual(goWorkerDeliveryBoundaryGate.releasePackageGuards, [...RELEASE_PACKAGE_GUARDS])
  assert.deepEqual(goWorkerDeliveryBoundaryGate.preservedRuntimeSurfaces, [...PRESERVED_RUNTIME_SURFACES])
  assert.deepEqual(goWorkerDeliveryBoundaryGate.nativeArtifactSnapshot, NATIVE_ARTIFACT_SNAPSHOT)
  assert.equal(ACTIVE_WORKER_LIFECYCLE_OPERATIONS.includes('wakePane'), false)
  assert.equal(ACTIVE_WORKER_LIFECYCLE_OPERATIONS.includes('send-keys'), false)
  assert.equal(FUTURE_TERMINAL_WAKE_DESIGN_GATE_REQUIREMENTS.length, 7)
  assert.equal(goWorkerDeliveryBoundaryGate.gateOnly, true)
  assert.equal(goWorkerDeliveryBoundaryGate.bridgeOnlyDeliveryPolicy, true)
  assert.equal(goWorkerDeliveryBoundaryGate.terminalDeliveryModeAuthorized, false)
  assert.equal(goWorkerDeliveryBoundaryGate.goSendKeysAuthorized, false)
  assert.equal(goWorkerDeliveryBoundaryGate.goWakePaneOperationAdded, false)
  assert.equal(goWorkerDeliveryBoundaryGate.goWakePaneAdapterMethodAdded, false)
  assert.equal(goWorkerDeliveryBoundaryGate.goWakePaneNativeSmokeAdded, false)
  assert.equal(goWorkerDeliveryBoundaryGate.runtimeDeliveryChanged, false)
  assert.equal(goWorkerDeliveryBoundaryGate.stateTaskMailboxGovernanceMigrated, false)
  assert.equal(goWorkerDeliveryBoundaryGate.teamPanelMigrated, false)
  assert.equal(goWorkerDeliveryBoundaryGate.goSourceChanged, false)
  assert.equal(goWorkerDeliveryBoundaryGate.nativeHelperRebuilt, false)
  assert.equal(goWorkerDeliveryBoundaryGate.packageVersionChanged, false)
  assert.equal(goWorkerDeliveryBoundaryGate.packageReleaseApproved, false)
}

function assertDocs(root) {
  assert.equal(existsRel(root, DOC), true, `${DOC} should exist`)
  assertIncludes(readRel(root, '.gitignore'), `!${DOC}`, '.gitignore')
  const doc = readRel(root, DOC)
  const roadmap = readRel(root, ROADMAP)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const expected of REQUIRED_ROADMAP) assertIncludes(roadmap, expected, ROADMAP)
  assertNoOverclaims(doc, RELEASE_OVERCLAIMS, DOC)
  assertNoOverclaims(roadmap, RELEASE_OVERCLAIMS, ROADMAP)
}

function assertDeliveryPolicyAndConfig(root) {
  const deliveryPolicy = readRel(root, DELIVERY_POLICY_FILE)
  const deliveryPolicyCode = sourceWithoutLineComments(deliveryPolicy)
  const config = readRel(root, CONFIG_FILE)
  assertIncludes(deliveryPolicy, DELIVERY_POLICY_SURFACE.comment, DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, DELIVERY_POLICY_SURFACE.typeExport, DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, DELIVERY_POLICY_SURFACE.bridgeOnlyConst, DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, DELIVERY_POLICY_SURFACE.defaultConst, DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, "if (!normalized || normalized === BRIDGE_ONLY_DELIVERY_POLICY) return BRIDGE_ONLY_DELIVERY_POLICY", DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, 'return null', DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, 'return DEFAULT_DELIVERY_POLICY', DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, "label: 'bridge-only'", DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, 'workerBridgeAutoStart: true', DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, 'workerBridgeAutoPump: true', DELIVERY_POLICY_FILE)
  assertIncludes(deliveryPolicy, 'bridgeRetryUsesSameChannel: true', DELIVERY_POLICY_FILE)
  assert.equal([...deliveryPolicyCode.matchAll(/export type AgentTeamDeliveryPolicyName\s*=\s*'bridge-only'/g)].length, 1, `${DELIVERY_POLICY_FILE} should expose one bridge-only policy union`)
  for (const alias of DELIVERY_POLICY_SURFACE.forbiddenLegacyPolicyNames) {
    const literal = new RegExp(`['\"]${escapeRegExp(alias)}['\"]`)
    assert.equal(literal.test(deliveryPolicyCode), false, `${DELIVERY_POLICY_FILE} must not expose legacy policy literal ${alias}`)
  }

  assertIncludes(config, "const knownTopLevel = new Set(['version', 'agents', 'agentModels', 'automation', 'ui', 'deliveryMode'])", CONFIG_FILE)
  assertIncludes(config, 'if (parsed.deliveryMode !== undefined)', CONFIG_FILE)
  assertIncludes(config, CONFIG_POLICY_SURFACE.unsupportedKey, CONFIG_FILE)
  assertIncludes(config, CONFIG_POLICY_SURFACE.bridgeOnlyMessage, CONFIG_FILE)
  assertIncludes(config, CONFIG_POLICY_SURFACE.rollbackMessage, CONFIG_FILE)
}

function assertOutboxAndMessageFlow(root) {
  const outboxModel = readRel(root, OUTBOX_MODEL_FILE)
  const outbox = readRel(root, OUTBOX_FILE)
  const handlers = readRel(root, OUTBOX_EFFECT_HANDLERS_FILE)
  const messageApplication = readRel(root, MESSAGE_APPLICATION_FILE)
  const taskSideEffects = readRel(root, TASK_SIDE_EFFECTS_FILE)
  const workerSpawn = readRel(root, WORKER_SPAWN_FILE)
  const messagePolicy = readRel(root, MESSAGE_POLICY_FILE)
  const messageDeliveryBody = functionBody(messageApplication, 'deliverMessageToRecipient')
  const spawnDeliveryBody = functionBody(workerSpawn, 'requestInitialSpawnDeliveryThroughOutbox')

  assertIncludes(outboxModel, `'${OUTBOX_WORKER_DELIVERY_KIND}'`, OUTBOX_MODEL_FILE)
  assertIncludes(outboxModel, `${OUTBOX_WORKER_DELIVERY_KIND}: {`, OUTBOX_MODEL_FILE)
  assertIncludes(outboxModel, 'explicitTask?: string', OUTBOX_MODEL_FILE)
  assertIncludes(outboxModel, 'messageIds?: string[]', OUTBOX_MODEL_FILE)
  assertIncludes(outboxModel, 'wakeHint?: OutboxMessageWakeHint', OUTBOX_MODEL_FILE)
  assertIncludes(outbox, `case '${OUTBOX_WORKER_DELIVERY_KIND}':`, OUTBOX_FILE)
  assertIncludes(outbox, `return '${DELIVERY_FLOW_ROUTING.outboxWarningName}'`, OUTBOX_FILE)
  assertIncludes(handlers, `${OUTBOX_WORKER_DELIVERY_KIND}: async effect => {`, OUTBOX_EFFECT_HANDLERS_FILE)
  assertIncludes(handlers, DELIVERY_FLOW_ROUTING.runtimeHandler, OUTBOX_EFFECT_HANDLERS_FILE)

  assert.equal([...messageApplication.matchAll(/kind: 'worker_delivery_requested'/g)].length, 1, `${MESSAGE_APPLICATION_FILE} should enqueue one worker delivery effect`)
  assertIncludes(messageDeliveryBody, "idempotencyKey: ['send-worker-delivery', team.name, recipient, sentMessage.id, policy.intent].join(':')", MESSAGE_APPLICATION_FILE)
  assertIncludes(messageDeliveryBody, 'messageIds: [sentMessage.id]', MESSAGE_APPLICATION_FILE)
  assertIncludes(messageDeliveryBody, 'requestedBy: sender', MESSAGE_APPLICATION_FILE)
  assertIncludes(messageDeliveryBody, 'reason: policy.reason', MESSAGE_APPLICATION_FILE)
  assertIncludes(messageDeliveryBody, 'wakeHint,', MESSAGE_APPLICATION_FILE)
  assertIncludes(messageDeliveryBody, "method: 'bridge_requested' as const", MESSAGE_APPLICATION_FILE)

  assert.equal([...taskSideEffects.matchAll(/kind: 'worker_delivery_requested'/g)].length, 1, `${TASK_SIDE_EFFECTS_FILE} should enqueue one worker delivery effect`)
  assertIncludes(taskSideEffects, "idempotencyKey: ['task-owner-nudge-delivery', result.wakeTeam.name, result.ownerNudge.recipient, deterministicMailboxId].join(':')", TASK_SIDE_EFFECTS_FILE)
  assertIncludes(taskSideEffects, 'explicitTask: pushed.taskId', TASK_SIDE_EFFECTS_FILE)
  assertIncludes(taskSideEffects, 'messageIds: [deterministicMailboxId]', TASK_SIDE_EFFECTS_FILE)
  assertIncludes(taskSideEffects, 'requestedBy: pushed.from', TASK_SIDE_EFFECTS_FILE)
  assertIncludes(taskSideEffects, "reason: 'report watchdog nudge'", TASK_SIDE_EFFECTS_FILE)
  assertIncludes(taskSideEffects, 'wakeHint: pushed.wakeHint', TASK_SIDE_EFFECTS_FILE)

  assert.equal([...workerSpawn.matchAll(/kind: 'worker_delivery_requested'/g)].length, 1, `${WORKER_SPAWN_FILE} should enqueue one initial worker delivery effect`)
  assertIncludes(spawnDeliveryBody, "idempotencyKey: ['spawn-initial-worker-delivery', teamName, workerName].join(':')", WORKER_SPAWN_FILE)
  assertIncludes(spawnDeliveryBody, 'explicitTask: initialInstruction', WORKER_SPAWN_FILE)
  assertIncludes(spawnDeliveryBody, 'requestedBy: TEAM_LEAD', WORKER_SPAWN_FILE)
  assertIncludes(spawnDeliveryBody, "reason: 'initial spawn task'", WORKER_SPAWN_FILE)
  assertIncludes(spawnDeliveryBody, "wakeHint: 'hard'", WORKER_SPAWN_FILE)
  assert.equal(workerSpawn.includes('createBridgeDeliveryRequest'), false, `${WORKER_SPAWN_FILE} must not bypass durable outbox delivery`)

  assertIncludes(messagePolicy, "'worker_delivery'", MESSAGE_POLICY_FILE)
  assertIncludes(messagePolicy, "'assignment routes to worker delivery'", MESSAGE_POLICY_FILE)
  assertIncludes(messagePolicy, "if (intent === 'worker_delivery') return 'hard'", MESSAGE_POLICY_FILE)
  assert.equal(messagePolicy.includes('send-keys'), false, `${MESSAGE_POLICY_FILE} worker_delivery intent must not mean tmux send-keys`)
}

function assertBridgeRuntimeBoundary(root) {
  const bridgeDelivery = readRel(root, BRIDGE_DELIVERY_FILE)
  const bridgeRequest = readRel(root, BRIDGE_REQUEST_FILE)
  const bridgePump = readRel(root, BRIDGE_DELIVERY_PUMP_FILE)
  const deliveryService = readRel(root, DELIVERY_REQUEST_SERVICE_FILE)
  const deliveryStore = readRel(root, DELIVERY_STORE_FILE)
  const deliveryTypes = readRel(root, DELIVERY_TYPES_FILE)

  assertIncludes(bridgeDelivery, 'createBridgeDeliveryRequest(team.name, memberName, {', BRIDGE_DELIVERY_FILE)
  assertIncludes(bridgeDelivery, "? 'bridge unavailable in bridge-only delivery mode'", BRIDGE_DELIVERY_FILE)
  assertIncludes(bridgeDelivery, "method: 'bridge_requested'", BRIDGE_DELIVERY_FILE)
  assertIncludes(bridgeDelivery, 'notifyBridgeWork(team.name, memberName)', BRIDGE_DELIVERY_FILE)
  assertIncludes(bridgeRequest, 'requestOrRefreshDelivery({', BRIDGE_REQUEST_FILE)
  assertIncludes(bridgeRequest, 'markBridgeWorkRequested(teamName, memberName, {', BRIDGE_REQUEST_FILE)
  assertIncludes(bridgePump, 'await ctx.sendUserMessage(prompt)', BRIDGE_DELIVERY_PUMP_FILE)
  assertIncludes(bridgePump, "customType: 'agentteam-bridge-delivery'", BRIDGE_DELIVERY_PUMP_FILE)
  assertIncludes(bridgePump, 'markDeliverySubmitted(team.name, claimed.requestId', BRIDGE_DELIVERY_PUMP_FILE)
  assertIncludes(deliveryService, "pending: ['claimed', 'cancelled', 'expired']", DELIVERY_REQUEST_SERVICE_FILE)
  assertIncludes(deliveryService, 'claimNextDelivery(input: ClaimNextDeliveryInput)', DELIVERY_REQUEST_SERVICE_FILE)
  assertIncludes(deliveryService, 'markDeliveryCompleted(', DELIVERY_REQUEST_SERVICE_FILE)
  assertIncludes(deliveryStore, 'export function promptHashForParts(messageIds: string[], prompt: string): string', DELIVERY_STORE_FILE)
  assertIncludes(deliveryStore, 'export function createOrRefreshDeliveryRequest(input: DeliveryRequestInput): DeliveryRequestState', DELIVERY_STORE_FILE)
  assertIncludes(deliveryTypes, "method?: 'bridge' | 'bridge_requested' | 'projection_requested' | 'leader_attention_requested'", DELIVERY_TYPES_FILE)
  assert.equal(/'terminal'|"terminal"|'tmux'|"tmux"|'send-keys'|"send-keys"/.test(deliveryTypes), false, `${DELIVERY_TYPES_FILE} must not expose terminal/tmux delivery methods`)

  for (const [label, source] of [
    [BRIDGE_DELIVERY_FILE, bridgeDelivery],
    [BRIDGE_REQUEST_FILE, bridgeRequest],
    [BRIDGE_DELIVERY_PUMP_FILE, bridgePump],
    [DELIVERY_REQUEST_SERVICE_FILE, deliveryService],
    [DELIVERY_STORE_FILE, deliveryStore],
  ]) {
    assertNoBridgeTerminalTransport(source, label)
  }
}

function assertGoWakeBoundary(root) {
  const goSource = readRel(root, GO_SOURCE_FILE)
  const kernelSource = readRel(root, KERNEL_FILE)
  const kernelContract = readRel(root, KERNEL_CONTRACT_FILE)
  assert.deepEqual(parseGoCapabilities(goSource), [...ACTIVE_CAPABILITIES])
  assert.deepEqual(parseGoWorkerLifecycleCases(goSource), [...ACTIVE_WORKER_LIFECYCLE_OPERATIONS])
  assert.equal(goSource.includes('wakePane'), false, `${GO_SOURCE_FILE} must not add active wakePane operation`)
  assert.equal(goSource.includes('workerLifecycleWakePane'), false, `${GO_SOURCE_FILE} must not add wakePane profile/smoke text`)
  assert.equal(goSource.includes('send-keys'), false, `${GO_SOURCE_FILE} must not add tmux send-keys`)
  for (const command of FORBIDDEN_GO_TMUX_COMMANDS) assert.equal(goSource.includes(`"${command}"`), false, `${GO_SOURCE_FILE} must not add forbidden command ${command}`)
  assert.equal(/case "wakePane"/.test(goSource), false, `${GO_SOURCE_FILE} must not add wakePane handler case`)
  assert.equal(/exec\.CommandContext\(ctx, "tmux", "send-keys"/.test(goSource), false, `${GO_SOURCE_FILE} must not execute send-keys`)
  assert.equal(/exec\.Command\s*\(/.test(goSource), false, `${GO_SOURCE_FILE} must not use shell-capable exec.Command`)
  assert.equal(/"(?:sh|bash|zsh|fish)"/.test(goSource), false, `${GO_SOURCE_FILE} must not invoke shells`)

  assert.equal(kernelSource.includes('wakePane'), false, `${KERNEL_FILE} must not add TypeScript adapter wakePane method`)
  assert.equal(kernelSource.includes('send-keys'), false, `${KERNEL_FILE} must not construct send-keys commands`)
  assertIncludes(kernelContract, "operation: 'wakePane'", `${KERNEL_CONTRACT_FILE} historical future contract`)
  assertIncludes(kernelContract, "phase: 'later-mutating'", `${KERNEL_CONTRACT_FILE} historical future contract remains non-active`)
}

function assertRuntimeSurfacesPreserved(root) {
  const panesSource = readRel(root, TMUX_PANES_FILE)
  const windowsSource = readRel(root, TMUX_WINDOWS_FILE)
  const labelsSource = readRel(root, TMUX_LABELS_FILE)
  const clearSyncBody = functionBody(panesSource, 'clearPaneLabelSync')
  const killBody = functionBody(panesSource, 'killPane')
  const createBody = functionBody(panesSource, 'createTeammatePane')
  const labelsClearBody = functionBody(labelsSource, 'clearPaneLabel')
  const labelsSetBody = functionBody(labelsSource, 'setPaneLabel')
  const labelsMarkBody = functionBody(labelsSource, 'markWindowAsAgentTeam')
  const labelsRefreshBody = functionBody(labelsSource, 'refreshWindowPaneLabels')
  const ensureBody = functionBody(windowsSource, 'ensureSwarmWindow')

  assertIncludes(clearSyncBody, 'createAgentTeamKernelAdapter().clearPaneLabel(paneId)', `${TMUX_PANES_FILE} v0.6.88 clearPaneLabelSync remains`)
  assert.equal(clearSyncBody.includes('runTmuxNoThrow'), false, `${TMUX_PANES_FILE} v0.6.88 clearPaneLabelSync direct fallback remains removed`)
  assertIncludes(killBody, 'createAgentTeamKernelAdapter().killPane(paneId)', `${TMUX_PANES_FILE} v0.6.86 killPane remains`)
  assert.equal(killBody.includes("runTmuxNoThrow(['kill-pane', '-t', paneId])"), false, `${TMUX_PANES_FILE} killPane direct fallback remains removed`)
  assertIncludes(createBody, 'createAgentTeamKernelAdapter().createTeammatePaneAsync({', `${TMUX_PANES_FILE} v0.6.80 createTeammatePane remains`)
  assertIncludes(createBody, 'await setPaneLabel(created.paneId, input.name, signal)', `${TMUX_PANES_FILE} post-create label remains`)
  assertIncludes(createBody, 'await refreshWindowPaneLabels(created.target, signal)', `${TMUX_PANES_FILE} post-create refresh remains`)
  assertIncludes(ensureBody, 'createAgentTeamKernelAdapter().createDetachedSwarmSessionAsync(SWARM_SESSION, SWARM_WINDOW, signal)', `${TMUX_WINDOWS_FILE} v0.6.82 detached session remains`)
  assertIncludes(ensureBody, 'createAgentTeamKernelAdapter().createDetachedSwarmWindowAsync(SWARM_SESSION, SWARM_WINDOW, signal)', `${TMUX_WINDOWS_FILE} v0.6.84 detached window remains`)
  assertIncludes(labelsSetBody, 'createAgentTeamKernelAdapter().setPaneLabelAsync(paneId, label, signal)', `${TMUX_LABELS_FILE} setPaneLabel remains`)
  assertIncludes(labelsClearBody, 'createAgentTeamKernelAdapter().clearPaneLabelAsync(paneId, signal)', `${TMUX_LABELS_FILE} async clearPaneLabel remains`)
  assertIncludes(labelsMarkBody, 'createAgentTeamKernelAdapter().markWindowAsAgentTeamAsync(target, signal)', `${TMUX_LABELS_FILE} markWindow remains`)
  assertIncludes(labelsRefreshBody, 'createAgentTeamKernelAdapter().refreshWindowPaneLabelsAsync(target, signal)', `${TMUX_LABELS_FILE} refresh labels remains`)
}

function assertArtifactPipelineAndNativeUnchanged(root) {
  assertNativeArtifactSnapshot(root, {
    nativeRoot: NATIVE_ROOT,
    packageVersion: PACKAGE_VERSION,
    helperVersion: HELPER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    capabilities: ACTIVE_CAPABILITIES,
    snapshot: NATIVE_ARTIFACT_SNAPSHOT,
  })
}

function assertPackageAndReleaseGuards(root) {
  assertPackageNoReleaseGuards(root, {
    expectedVersion: PACKAGE_VERSION,
    lifecycleScripts: ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish'],
    forbiddenRootFiles: ROOT_FORBIDDEN_FILES,
  })
}

module.exports = {
  name: 'Go kernel v0.6.89 worker delivery boundary gate',
  async run(env) {
    const root = env.helpers.extRoot
    assertFixtureShape(root)
    assertDocs(root)
    assertDeliveryPolicyAndConfig(root)
    assertOutboxAndMessageFlow(root)
    assertBridgeRuntimeBoundary(root)
    assertGoWakeBoundary(root)
    assertRuntimeSurfacesPreserved(root)
    assertArtifactPipelineAndNativeUnchanged(root)
    assertPackageAndReleaseGuards(root)
  },
}
