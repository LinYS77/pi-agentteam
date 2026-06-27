const DEFAULT_GO_CUTOVER_SCHEMA_VERSION = 1
const DEFAULT_GO_CUTOVER_THEME = 'v0.6.48 default Go cutover for tmuxSnapshotParse'
const SELECTED_MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.3.0-read-model-shadow'
const PROTOCOL_VERSION = 1
const PACKAGE_VERSION = '0.6.8'
const APPROVED_EMBEDDED_NATIVE_PREFIX = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'
const APPROVED_EMBEDDED_NATIVE_FILES = Object.freeze([
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/agentteam-tmuxSnapshotParse',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/SHA256SUMS',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/provenance.json',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/LICENSE',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/license.json',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/attestation.intoto.jsonl',
])
const REQUIRED_CAPABILITIES = Object.freeze(['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability'])
const FAILURE_CLASSES = Object.freeze([
  'unsupported-platform',
  'integrity-failed',
  'missing-helper',
  'bad-manifest',
])
const ROLLBACK_MODES = Object.freeze(['disabled', 'typescript'])
const EXPLICIT_PREVIEW_MODE = 'go-packaged-preview'
const DEFAULT_MODES = Object.freeze(['unset', 'default', 'go'])
const GO_AUTHORITY = 'tmuxSnapshotParse-parser-only'
const TS_AUTHORITY = Object.freeze([
  'non-snapshot tmux execution and pane lifecycle commands',
  'pane/session/worker lifecycle',
  'state writes and repository ownership',
  'task/report/PlanRun governance',
  'mailbox/report full-text boundaries',
  'UI rendering and pi extension lifecycle',
  'package/release/npm/tag/signing governance',
  'compactReadModelFingerprint default/go behavior',
])
const PACKAGE_RELEASE_GUARDS = Object.freeze([
  'no npm version',
  'no npm publish',
  'no git tag or push',
  'no GitHub release',
  'no package lifecycle native installer',
  'no lockfiles or Go modules',
  'no native metadata fields beyond exact package files allowlist',
])
const defaultGoCutoverTmuxSnapshot = Object.freeze({
  schemaVersion: DEFAULT_GO_CUTOVER_SCHEMA_VERSION,
  theme: DEFAULT_GO_CUTOVER_THEME,
  packageVersion: PACKAGE_VERSION,
  selectedModule: SELECTED_MODULE,
  helperVersion: HELPER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  approvedEmbeddedNativePrefix: APPROVED_EMBEDDED_NATIVE_PREFIX,
  approvedEmbeddedNativeFiles: APPROVED_EMBEDDED_NATIVE_FILES,
  requiredCapabilities: REQUIRED_CAPABILITIES,
  defaultModes: DEFAULT_MODES,
  rollbackModes: ROLLBACK_MODES,
  explicitPreviewMode: EXPLICIT_PREVIEW_MODE,
  failureClasses: FAILURE_CLASSES,
  goAuthority: GO_AUTHORITY,
  tsAuthority: TS_AUTHORITY,
  packageReleaseGuards: PACKAGE_RELEASE_GUARDS,
  fallbackDeleted: true,
  defaultGoEnabled: true,
  defaultResolverEnabled: true,
  defaultResolverSource: 'main-package-embedded-helper-manifest',
  packageReleaseApproved: false,
  nativePackageManagerDeliveryApproved: false,
  signingApproved: false,
  secondPlatformSupportApproved: false,
})

module.exports = {
  APPROVED_EMBEDDED_NATIVE_FILES,
  APPROVED_EMBEDDED_NATIVE_PREFIX,
  DEFAULT_GO_CUTOVER_SCHEMA_VERSION,
  DEFAULT_GO_CUTOVER_THEME,
  EXPLICIT_PREVIEW_MODE,
  FAILURE_CLASSES,
  GO_AUTHORITY,
  HELPER_VERSION,
  PACKAGE_RELEASE_GUARDS,
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  REQUIRED_CAPABILITIES,
  ROLLBACK_MODES,
  SELECTED_MODULE,
  TS_AUTHORITY,
  defaultGoCutoverTmuxSnapshot,
}
