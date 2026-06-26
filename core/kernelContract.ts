export const AGENTTEAM_KERNEL_CONTRACT_SCHEMA_VERSION = 1 as const
export const AGENTTEAM_KERNEL_PACKAGE_NAME = 'pi-agentteam' as const
export const AGENTTEAM_KERNEL_PACKAGE_VERSION = '0.6.8' as const
export const AGENTTEAM_KERNEL_PROTOCOL_VERSION = 1 as const
export const AGENTTEAM_KERNEL_ADAPTER_VERSION = '0.3.0-read-model-shadow' as const
export const AGENTTEAM_KERNEL_HELPER_VERSION = '0.3.0-read-model-shadow' as const
export const AGENTTEAM_KERNEL_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint'] as const
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
})
