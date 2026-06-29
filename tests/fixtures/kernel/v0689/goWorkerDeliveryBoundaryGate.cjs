const GO_WORKER_DELIVERY_BOUNDARY_GATE_SCHEMA_VERSION = 1
const GO_WORKER_DELIVERY_BOUNDARY_GATE_THEME = 'v0.6.89-go-worker-delivery-boundary-gate'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const DELIVERY_POLICY_FILE = 'deliveryPolicy.ts'
const CONFIG_FILE = 'config.ts'
const MESSAGE_APPLICATION_FILE = 'app/messageApplication.ts'
const TASK_SIDE_EFFECTS_FILE = 'app/taskSideEffects.ts'
const WORKER_SPAWN_FILE = 'tools/workerSpawnService.ts'
const OUTBOX_FILE = 'app/outbox.ts'
const OUTBOX_MODEL_FILE = 'core/outboxModel.ts'
const OUTBOX_EFFECT_HANDLERS_FILE = 'adapters/runtime/outboxEffectHandlers.ts'
const MESSAGE_POLICY_FILE = 'core/messagePolicy.ts'
const BRIDGE_DELIVERY_FILE = 'adapters/bridge/delivery.ts'
const BRIDGE_REQUEST_FILE = 'runtime/bridgeRequest.ts'
const BRIDGE_DELIVERY_PUMP_FILE = 'runtime/bridgeDeliveryPump.ts'
const DELIVERY_REQUEST_SERVICE_FILE = 'runtime/deliveryRequestService.ts'
const DELIVERY_STORE_FILE = 'state/deliveryStore.ts'
const DELIVERY_TYPES_FILE = 'app/deliveryTypes.ts'
const KERNEL_FILE = 'core/kernel.ts'
const KERNEL_CONTRACT_FILE = 'core/kernelContract.ts'
const GO_SOURCE_FILE = 'kernel/go/agentteam-kernel/main.go'
const TMUX_PANES_FILE = 'tmux/panes.ts'
const TMUX_WINDOWS_FILE = 'tmux/windows.ts'
const TMUX_LABELS_FILE = 'tmux/labels.ts'
const NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const DELIVERY_POLICY_SURFACE = Object.freeze({
  typeExport: "export type AgentTeamDeliveryPolicyName = 'bridge-only'",
  bridgeOnlyConst: "export const BRIDGE_ONLY_DELIVERY_POLICY: AgentTeamDeliveryPolicyName = 'bridge-only'",
  defaultConst: 'export const DEFAULT_DELIVERY_POLICY: AgentTeamDeliveryPolicyName = BRIDGE_ONLY_DELIVERY_POLICY',
  comment: 'they do not reintroduce legacy terminal/tmux delivery modes',
  allowedPolicyNames: Object.freeze(['bridge-only']),
  forbiddenLegacyPolicyNames: Object.freeze(['terminal', 'tmux', 'legacy-terminal', 'send-keys', 'paste-buffer', 'pane-injection', 'runtimeWake']),
})
const CONFIG_POLICY_SURFACE = Object.freeze({
  unsupportedKey: 'deliveryMode_unsupported',
  bridgeOnlyMessage: 'AgentTeam delivery is bridge-only',
  rollbackMessage: 'remove deliveryMode or roll back by pinning npm pi-agentteam@0.5.0 instead of selecting legacy terminal transport',
})
const OUTBOX_WORKER_DELIVERY_KIND = 'worker_delivery_requested'
const DELIVERY_FLOW_PRODUCERS = Object.freeze([
  Object.freeze({
    file: MESSAGE_APPLICATION_FILE,
    source: 'message recipient attention / worker delivery',
    idempotencyPrefix: 'send-worker-delivery',
    requiredPayloadFields: Object.freeze(['teamName', 'memberName', 'options.messageIds', 'options.requestedBy', 'options.reason', 'options.wakeHint']),
  }),
  Object.freeze({
    file: TASK_SIDE_EFFECTS_FILE,
    source: 'task owner nudge delivery',
    idempotencyPrefix: 'task-owner-nudge-delivery',
    requiredPayloadFields: Object.freeze(['teamName', 'memberName', 'explicitTask', 'options.messageIds', 'options.requestedBy', 'options.reason', 'options.wakeHint']),
  }),
  Object.freeze({
    file: WORKER_SPAWN_FILE,
    source: 'initial spawn delivery',
    idempotencyPrefix: 'spawn-initial-worker-delivery',
    requiredPayloadFields: Object.freeze(['teamName', 'memberName', 'explicitTask', 'options.requestedBy', 'options.reason', 'options.wakeHint']),
  }),
])
const DELIVERY_FLOW_ROUTING = Object.freeze({
  outboxWarningName: 'requestWorkerDelivery',
  runtimeHandler: 'deps.requestWorkerDelivery(team, payload.memberName, payload.explicitTask, payload.options)',
  deliveryMethod: 'bridge_requested',
  policyIntent: 'worker_delivery',
  policyReason: 'assignment routes to worker delivery',
})
const BRIDGE_RUNTIME_MODULES = Object.freeze([
  Object.freeze({ file: BRIDGE_DELIVERY_FILE, owns: 'bridge delivery request construction and bridge-fresh decision' }),
  Object.freeze({ file: BRIDGE_REQUEST_FILE, owns: 'create/refresh delivery request and mark bridge work requested' }),
  Object.freeze({ file: BRIDGE_DELIVERY_PUMP_FILE, owns: 'bridge/native prompt submission through pi bridge APIs' }),
  Object.freeze({ file: DELIVERY_REQUEST_SERVICE_FILE, owns: 'guarded delivery request lifecycle transitions' }),
  Object.freeze({ file: DELIVERY_STORE_FILE, owns: 'low-level delivery request persistence/normalization' }),
  Object.freeze({ file: DELIVERY_TYPES_FILE, owns: 'bridge/projection delivery result method vocabulary' }),
])
const FUTURE_TERMINAL_WAKE_DESIGN_GATE_REQUIREMENTS = Object.freeze([
  'separate explicit design gate before any terminal/tmux wake/send-keys work',
  'exact command surface, including whether any future command is tmux send-keys -t <paneId> ... and its argv shape',
  'message and worker prompt redaction policy plus raw body leakage policy',
  'state side effects, idempotency semantics, and rollback/retry policy',
  'interaction with bridge-only delivery policy and rollback to bridge-only behavior',
  'security model for opaque prompt text and untrusted message bodies',
  'tests plus manual/operator evidence before runtime cutover',
])
const ACTIVE_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const ACTIVE_WORKER_LIFECYCLE_OPERATIONS = Object.freeze([
  'inspectPane',
  'listAgentTeamPanes',
  'captureCurrentPaneBinding',
  'listPanesInWindow',
  'findAgentTeamWindowTarget',
  'findWindowTargetByName',
  'sessionExists',
  'createDetachedSwarmSession',
  'createDetachedSwarmWindow',
  'markWindowAsAgentTeam',
  'refreshWindowPaneLabels',
  'setPaneLabel',
  'clearPaneLabel',
  'killPane',
  'createTeammatePane',
])
const FORBIDDEN_GO_TMUX_COMMANDS = Object.freeze(['send-keys', 'paste-buffer', 'set-buffer', 'kill-window', 'kill-session', 'respawn-pane'])
const FORBIDDEN_RUNTIME_CUTOVER_TOKENS = Object.freeze(['workerLifecycleWakePane', 'clearPaneLabelSyncChanged: true', 'wakePaneMigrated: true', 'nativeHelperRebuilt: true', 'packageVersionChanged: true'])
const PRESERVED_RUNTIME_SURFACES = Object.freeze([
  'tmux/panes.ts clearPaneLabelSync delegates to createAgentTeamKernelAdapter().clearPaneLabel(paneId)',
  'tmux/panes.ts killPane delegates to createAgentTeamKernelAdapter().killPane(paneId)',
  'tmux/panes.ts createTeammatePane delegates to createAgentTeamKernelAdapter().createTeammatePaneAsync(...)',
  'tmux/windows.ts detached new-session delegates to createDetachedSwarmSessionAsync',
  'tmux/windows.ts detached new-window delegates to createDetachedSwarmWindowAsync',
  'tmux/labels.ts async set/clear/mark/refresh helpers remain Go-backed',
  'worker delivery remains TypeScript-owned outbox/bridge orchestration',
])
const RELEASE_PACKAGE_GUARDS = Object.freeze([
  'package.json remains 0.6.8',
  'no npm version',
  'no npm publish',
  'no release tag or GitHub release asset',
  'no package lockfiles',
  'no go.mod or go.sum',
  'no lifecycle hooks or postinstall downloads',
  'no package-manager native dependency/download flow',
  'no native artifact rebuild',
  'no native artifact rename',
])
const NATIVE_ARTIFACT_SNAPSHOT = Object.freeze({
  root: NATIVE_ROOT,
  helperPath: 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/agentteam-tmuxSnapshotParse',
  helperSha256: 'a654e58ff5a2c61b6c03d2fa5e05bc3d888243c49eecdd745f10c24d82f4f2a9',
  helperSize: 3521170,
  manifestSha256: '1eb45fb80806940f164a7c4e0a54cd063018fd943856a640897fa3dc11b90b6d',
  provenanceSha256: '69598eff59490feb76d48c325ebc6ee9022951832ee52935cd3f12cd5fb594b1',
  attestationSha256: 'c00b8ad0c65a66957609c6a2449d162a0eb447239ca8f9a5b3406f2ff3d71a83',
  checksumsSha256: '7879455dfc22823b86185c19d829d33e3bdb8651f75320f5d4b65421a3aabdbd',
  sourceRevision: '6603982e9c0130b9298a43b8214fd6887d7a125b',
  forbiddenSmokeKeys: Object.freeze(['workerLifecycleWakePane']),
})
const goWorkerDeliveryBoundaryGate = Object.freeze({
  schemaVersion: GO_WORKER_DELIVERY_BOUNDARY_GATE_SCHEMA_VERSION,
  theme: GO_WORKER_DELIVERY_BOUNDARY_GATE_THEME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  deliveryPolicyFile: DELIVERY_POLICY_FILE,
  configFile: CONFIG_FILE,
  messageApplicationFile: MESSAGE_APPLICATION_FILE,
  taskSideEffectsFile: TASK_SIDE_EFFECTS_FILE,
  workerSpawnFile: WORKER_SPAWN_FILE,
  outboxFile: OUTBOX_FILE,
  outboxModelFile: OUTBOX_MODEL_FILE,
  outboxEffectHandlersFile: OUTBOX_EFFECT_HANDLERS_FILE,
  messagePolicyFile: MESSAGE_POLICY_FILE,
  bridgeRuntimeModules: BRIDGE_RUNTIME_MODULES,
  kernelFile: KERNEL_FILE,
  kernelContractFile: KERNEL_CONTRACT_FILE,
  goSourceFile: GO_SOURCE_FILE,
  tmuxPanesFile: TMUX_PANES_FILE,
  tmuxWindowsFile: TMUX_WINDOWS_FILE,
  tmuxLabelsFile: TMUX_LABELS_FILE,
  nativeRoot: NATIVE_ROOT,
  deliveryPolicySurface: DELIVERY_POLICY_SURFACE,
  configPolicySurface: CONFIG_POLICY_SURFACE,
  outboxWorkerDeliveryKind: OUTBOX_WORKER_DELIVERY_KIND,
  deliveryFlowProducers: DELIVERY_FLOW_PRODUCERS,
  deliveryFlowRouting: DELIVERY_FLOW_ROUTING,
  futureTerminalWakeDesignGateRequirements: FUTURE_TERMINAL_WAKE_DESIGN_GATE_REQUIREMENTS,
  activeCapabilities: ACTIVE_CAPABILITIES,
  activeWorkerLifecycleOperations: ACTIVE_WORKER_LIFECYCLE_OPERATIONS,
  forbiddenGoTmuxCommands: FORBIDDEN_GO_TMUX_COMMANDS,
  forbiddenRuntimeCutoverTokens: FORBIDDEN_RUNTIME_CUTOVER_TOKENS,
  preservedRuntimeSurfaces: PRESERVED_RUNTIME_SURFACES,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
  nativeArtifactSnapshot: NATIVE_ARTIFACT_SNAPSHOT,
  gateOnly: true,
  bridgeOnlyDeliveryPolicy: true,
  terminalDeliveryModeAuthorized: false,
  goSendKeysAuthorized: false,
  goWakePaneOperationAdded: false,
  goWakePaneAdapterMethodAdded: false,
  goWakePaneNativeSmokeAdded: false,
  runtimeDeliveryChanged: false,
  stateTaskMailboxGovernanceMigrated: false,
  teamPanelMigrated: false,
  goSourceChanged: false,
  nativeHelperRebuilt: false,
  packageVersionChanged: false,
  packageReleaseApproved: false,
})

module.exports = {
  ACTIVE_CAPABILITIES,
  ACTIVE_WORKER_LIFECYCLE_OPERATIONS,
  BRIDGE_DELIVERY_FILE,
  BRIDGE_DELIVERY_PUMP_FILE,
  BRIDGE_REQUEST_FILE,
  BRIDGE_RUNTIME_MODULES,
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
  FORBIDDEN_RUNTIME_CUTOVER_TOKENS,
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
}
