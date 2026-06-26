export const AGENTTEAM_KERNEL_CONTRACT_SCHEMA_VERSION = 1 as const
export const AGENTTEAM_KERNEL_PACKAGE_NAME = 'pi-agentteam' as const
export const AGENTTEAM_KERNEL_PACKAGE_VERSION = '0.6.8' as const
export const AGENTTEAM_KERNEL_PROTOCOL_VERSION = 1 as const
export const AGENTTEAM_KERNEL_ADAPTER_VERSION = '0.3.0-read-model-shadow' as const
export const AGENTTEAM_KERNEL_HELPER_VERSION = '0.3.0-read-model-shadow' as const
export const AGENTTEAM_KERNEL_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle'] as const
export const AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED = false as const

export const AGENTTEAM_KERNEL_CURRENT_NATIVE_MODULE = 'tmuxSnapshotParse' as const
export const AGENTTEAM_KERNEL_TMUX_SNAPSHOT_CAPTURE_MODULE = 'tmuxSnapshotCapture' as const
export const AGENTTEAM_KERNEL_CURRENT_NATIVE_BINARY = 'agentteam-tmuxSnapshotParse' as const
export const AGENTTEAM_KERNEL_CURRENT_NATIVE_TARGET = 'linux-x64-glibc' as const
export const AGENTTEAM_KERNEL_CURRENT_NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc' as const
export const AGENTTEAM_KERNEL_EMBEDDED_HELPER_MANIFEST_PATH = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json' as const
export const AGENTTEAM_KERNEL_APPROVED_EMBEDDED_NATIVE_FILES = [
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/agentteam-tmuxSnapshotParse',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/SHA256SUMS',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/provenance.json',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/LICENSE',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/license.json',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/attestation.intoto.jsonl',
] as const

export const AGENTTEAM_KERNEL_ARTIFACT_NAMING_DECISION_STATUS = 'deferred-current-path-guarded' as const
export const AGENTTEAM_KERNEL_ARTIFACT_NAMING_OPTIONS = [
  {
    id: 'keep-tmuxSnapshotParse',
    module: 'tmuxSnapshotParse',
    pathTemplate: 'native/tmuxSnapshotParse/<helperVersion>/<target>',
    status: 'current-runtime-path',
  },
  {
    id: 'agentteamKernel',
    module: 'agentteamKernel',
    pathTemplate: 'native/agentteamKernel/<helperVersion>/<target>',
    status: 'future-decision-option',
  },
  {
    id: 'agentteamControlPlaneCore',
    module: 'agentteamControlPlaneCore',
    pathTemplate: 'native/agentteamControlPlaneCore/<helperVersion>/<target>',
    status: 'future-decision-option',
  },
] as const

export const AGENTTEAM_KERNEL_ARTIFACT_NAMING_DECISION = Object.freeze({
  status: AGENTTEAM_KERNEL_ARTIFACT_NAMING_DECISION_STATUS,
  runtimePathRenameApproved: false,
  binaryRenameApproved: false,
  currentModule: AGENTTEAM_KERNEL_CURRENT_NATIVE_MODULE,
  currentBinary: AGENTTEAM_KERNEL_CURRENT_NATIVE_BINARY,
  currentRoot: AGENTTEAM_KERNEL_CURRENT_NATIVE_ROOT,
  futureOptions: AGENTTEAM_KERNEL_ARTIFACT_NAMING_OPTIONS,
  rationale: 'v0.6.51 guards the existing embedded tmuxSnapshotParse artifact path while documenting broader future kernel/control-plane naming options.',
})

export const AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CAPABILITY = 'workerLifecycle' as const
export const AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT_STATUS = 'runtime-inspect-pane-only' as const
export const AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_JSONRPC_METHOD = 'workerLifecycle' as const
export const AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_OPERATIONS = [
  {
    operation: 'inspectPane',
    phase: 'read-only-first',
    mutatesTmux: false,
    authority: 'typescript-governed-explicit-adapter-call',
  },
  {
    operation: 'listAgentTeamPanes',
    phase: 'read-only-first',
    mutatesTmux: false,
    authority: 'typescript-governed-explicit-adapter-call',
  },
  {
    operation: 'wakePane',
    phase: 'later-mutating',
    mutatesTmux: true,
    authority: 'typescript-governed-explicit-adapter-call',
  },
  {
    operation: 'syncPaneLabels',
    phase: 'later-mutating',
    mutatesTmux: true,
    authority: 'typescript-governed-explicit-adapter-call',
  },
  {
    operation: 'createTeammatePane',
    phase: 'later-high-risk',
    mutatesTmux: true,
    authority: 'typescript-governed-explicit-adapter-call',
  },
  {
    operation: 'killPane',
    phase: 'last-highest-risk',
    mutatesTmux: true,
    authority: 'typescript-governed-explicit-adapter-call',
  },
] as const

export const AGENTTEAM_KERNEL_WORKER_LIFECYCLE_HELPER_CONNECTION_DECISION = Object.freeze({
  status: 'per-call-helper-initially-accepted' as const,
  longLivedHelperStatus: 'deferred-until-state-panel-or-high-frequency-paths' as const,
  appliesToCapability: AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CAPABILITY,
  runtimeCapabilityActive: true,
  prerequisitesForLongLivedHelper: [
    'bounded request queue and backpressure policy',
    'timeout and cancellation propagation per request',
    'crash detection and restart budget',
    'health preflight and version/capability renegotiation',
    'no raw stdout/stderr/cwd/stack leakage in diagnostics',
  ] as const,
})

export const AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT = Object.freeze({
  status: AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT_STATUS,
  capability: AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CAPABILITY,
  jsonRpcMethod: AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_JSONRPC_METHOD,
  activeRuntimeCapability: true,
  operations: AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_OPERATIONS,
  helperConnectionDecision: AGENTTEAM_KERNEL_WORKER_LIFECYCLE_HELPER_CONNECTION_DECISION,
  activeOperations: ['inspectPane'] as const,
  unsupportedOperationsFailClosed: true,
  facadeAuthority: 'TypeScript/pi facade and leader/task governance stay authoritative; Go may only be called through an explicit TS adapter seam.',
})

export const AGENTTEAM_KERNEL_CONTRACT = Object.freeze({
  schemaVersion: AGENTTEAM_KERNEL_CONTRACT_SCHEMA_VERSION,
  packageName: AGENTTEAM_KERNEL_PACKAGE_NAME,
  packageVersion: AGENTTEAM_KERNEL_PACKAGE_VERSION,
  protocolVersion: AGENTTEAM_KERNEL_PROTOCOL_VERSION,
  adapterVersion: AGENTTEAM_KERNEL_ADAPTER_VERSION,
  helperVersion: AGENTTEAM_KERNEL_HELPER_VERSION,
  capabilities: AGENTTEAM_KERNEL_CAPABILITIES,
  businessPathsConnected: AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED,
  currentNativeModule: AGENTTEAM_KERNEL_CURRENT_NATIVE_MODULE,
  tmuxSnapshotCaptureModule: AGENTTEAM_KERNEL_TMUX_SNAPSHOT_CAPTURE_MODULE,
  currentNativeBinary: AGENTTEAM_KERNEL_CURRENT_NATIVE_BINARY,
  currentNativeTarget: AGENTTEAM_KERNEL_CURRENT_NATIVE_TARGET,
  currentNativeRoot: AGENTTEAM_KERNEL_CURRENT_NATIVE_ROOT,
  embeddedHelperManifestPath: AGENTTEAM_KERNEL_EMBEDDED_HELPER_MANIFEST_PATH,
  approvedEmbeddedNativeFiles: AGENTTEAM_KERNEL_APPROVED_EMBEDDED_NATIVE_FILES,
  artifactNamingDecision: AGENTTEAM_KERNEL_ARTIFACT_NAMING_DECISION,
  futureWorkerLifecycleContract: AGENTTEAM_KERNEL_FUTURE_WORKER_LIFECYCLE_CONTRACT,
})
