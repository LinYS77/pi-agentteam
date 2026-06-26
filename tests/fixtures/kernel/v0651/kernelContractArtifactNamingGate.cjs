const KERNEL_CONTRACT_ARTIFACT_NAMING_SCHEMA_VERSION = 1
const KERNEL_CONTRACT_ARTIFACT_NAMING_THEME = 'v0.6.51 contract constants and artifact naming gate'
const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const ADAPTER_VERSION = '0.3.0-read-model-shadow'
const CURRENT_NATIVE_MODULE = 'tmuxSnapshotParse'
const TMUX_SNAPSHOT_CAPTURE_MODULE = 'tmuxSnapshotCapture'
const CURRENT_NATIVE_BINARY = 'agentteam-tmuxSnapshotParse'
const CURRENT_NATIVE_TARGET = 'linux-x64-glibc'
const CURRENT_NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const EMBEDDED_HELPER_MANIFEST_PATH = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json'
const REQUIRED_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint'])
const APPROVED_EMBEDDED_NATIVE_FILES = Object.freeze([
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/agentteam-tmuxSnapshotParse',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/SHA256SUMS',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/provenance.json',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/LICENSE',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/license.json',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/attestation.intoto.jsonl',
])
const ARTIFACT_NAMING_DECISION_STATUS = 'deferred-current-path-guarded'
const ARTIFACT_NAMING_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'keep-tmuxSnapshotParse',
    module: 'tmuxSnapshotParse',
    pathTemplate: 'native/tmuxSnapshotParse/<helperVersion>/<target>',
    status: 'current-runtime-path',
  }),
  Object.freeze({
    id: 'agentteamKernel',
    module: 'agentteamKernel',
    pathTemplate: 'native/agentteamKernel/<helperVersion>/<target>',
    status: 'future-decision-option',
  }),
  Object.freeze({
    id: 'agentteamControlPlaneCore',
    module: 'agentteamControlPlaneCore',
    pathTemplate: 'native/agentteamControlPlaneCore/<helperVersion>/<target>',
    status: 'future-decision-option',
  }),
])
const PRESERVED_BOUNDARIES = Object.freeze([
  'TypeScript/pi facade remains public product entry',
  'index.ts remains TS-owned',
  'tool and command schemas remain TS-owned',
  'hooks and renderers remain TS-owned',
  'TUI shell remains TS-owned',
  'worker lifecycle remains unmigrated in this slice',
  'state repository remains unmigrated in this slice',
  'task/report/PlanRun remains unmigrated in this slice',
  'package/release remains unauthorized in this slice',
])
const RELEASE_PACKAGE_GUARDS = Object.freeze([
  'no npm version',
  'no npm publish',
  'no tag or release creation',
  'no GitHub release assets',
  'no package version bump',
  'no package lockfiles',
  'no go.mod or go.sum',
  'no lifecycle hooks or postinstall downloads',
  'no runtime go build',
  'no native path rename',
  'no binary rename',
])
const kernelContractArtifactNamingGate = Object.freeze({
  schemaVersion: KERNEL_CONTRACT_ARTIFACT_NAMING_SCHEMA_VERSION,
  theme: KERNEL_CONTRACT_ARTIFACT_NAMING_THEME,
  packageName: PACKAGE_NAME,
  packageVersion: PACKAGE_VERSION,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  adapterVersion: ADAPTER_VERSION,
  requiredCapabilities: REQUIRED_CAPABILITIES,
  businessPathsConnected: false,
  currentNativeModule: CURRENT_NATIVE_MODULE,
  tmuxSnapshotCaptureModule: TMUX_SNAPSHOT_CAPTURE_MODULE,
  currentNativeBinary: CURRENT_NATIVE_BINARY,
  currentNativeTarget: CURRENT_NATIVE_TARGET,
  currentNativeRoot: CURRENT_NATIVE_ROOT,
  embeddedHelperManifestPath: EMBEDDED_HELPER_MANIFEST_PATH,
  approvedEmbeddedNativeFiles: APPROVED_EMBEDDED_NATIVE_FILES,
  artifactNamingDecisionStatus: ARTIFACT_NAMING_DECISION_STATUS,
  artifactNamingOptions: ARTIFACT_NAMING_OPTIONS,
  runtimePathRenameApproved: false,
  binaryRenameApproved: false,
  runtimeBehaviorChangedFromV0650: false,
  packageVersionChanged: false,
  packageReleaseApproved: false,
  npmVersionChanged: false,
  npmPublished: false,
  tagReleaseCreated: false,
  workerLifecycleMigrated: false,
  stateRepositoryMigrated: false,
  taskReportPlanRunMigrated: false,
  teamPanelViewModelMigrated: false,
  preservedBoundaries: PRESERVED_BOUNDARIES,
  releasePackageGuards: RELEASE_PACKAGE_GUARDS,
})

module.exports = {
  ADAPTER_VERSION,
  APPROVED_EMBEDDED_NATIVE_FILES,
  ARTIFACT_NAMING_DECISION_STATUS,
  ARTIFACT_NAMING_OPTIONS,
  CURRENT_NATIVE_BINARY,
  CURRENT_NATIVE_MODULE,
  CURRENT_NATIVE_ROOT,
  CURRENT_NATIVE_TARGET,
  EMBEDDED_HELPER_MANIFEST_PATH,
  HELPER_VERSION,
  KERNEL_CONTRACT_ARTIFACT_NAMING_SCHEMA_VERSION,
  KERNEL_CONTRACT_ARTIFACT_NAMING_THEME,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  PRESERVED_BOUNDARIES,
  PROTOCOL_VERSION,
  RELEASE_PACKAGE_GUARDS,
  REQUIRED_CAPABILITIES,
  TMUX_SNAPSHOT_CAPTURE_MODULE,
  kernelContractArtifactNamingGate,
}
