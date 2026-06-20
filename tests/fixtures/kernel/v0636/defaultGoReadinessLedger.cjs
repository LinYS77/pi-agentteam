const DEFAULT_GO_READINESS_LEDGER_SCHEMA_VERSION = 1
const DEFAULT_GO_READINESS_THEME = 'v0.6.36 default-go dry-run readiness'
const DEFAULT_GO_READINESS_MODULE = 'tmuxSnapshotParse'
const BLOCKED = 'blocked'
const COMMON_DOES_NOT_PROVE = Object.freeze([
  'normal-user native availability',
  'default Go approval or enablement',
  'default resolver approval or enablement',
  'TypeScript fallback deletion approval',
  'package release approval',
  'install source approval',
  'signing/cosign/SLSA/security attestation approval',
  'second-platform support or platform matrix',
])

const DEFAULT_GO_BLOCKER_IDS = Object.freeze([
  'package-manager-native-delivery',
  'install-source-approval',
  'default-resolver-policy',
  'rollback-default-disable-mechanism',
  'security-signing-policy',
  'platform-policy',
  'hosted-tag-gates',
  'explicit-leader-user-approval',
  'typescript-fallback-retention-deletion-gate',
  'go-authority-boundaries',
])

function blocker(id, category, currentEvidence, missingForApproval, stopIfMissing, extraDoesNotProve = []) {
  return Object.freeze({
    id,
    category,
    status: BLOCKED,
    requiredBeforeDefaultGo: true,
    currentEvidence,
    missingForApproval,
    stopIfMissing,
    doesNotProve: Object.freeze([...COMMON_DOES_NOT_PROVE, ...extraDoesNotProve]),
    waivableByRepoStateAlone: false,
  })
}

const defaultGoReadinessBlockers = Object.freeze([
  blocker(
    'package-manager-native-delivery',
    'package-manager native delivery',
    'v0.6.33/v0.6.35 prove review/temp consumption and TypeScript/pi facade package shape only; no package-manager native helper delivery is approved.',
    'Approved package-manager native helper delivery path, installed-layout ownership, package metadata, and normal-user install evidence.',
    'Default Go must remain disabled when package-manager native delivery is missing.',
    ['package-manager native delivery'],
  ),
  blocker(
    'install-source-approval',
    'install-source approval',
    'v0.6.34 records package/release/install-layout decision policy; no install source is approved.',
    'Explicit install source approval for any package/native/release source used by default resolver or default Go.',
    'Default Go must remain disabled when install source approval is missing.',
    ['approved install source'],
  ),
  blocker(
    'default-resolver-policy',
    'default resolver policy',
    'Existing runtime keeps go-packaged-preview explicit-only and does not discover package/native helpers by default.',
    'Approved default resolver policy, precedence, diagnostics, fail-closed behavior, and tests for normal package installs.',
    'Default Go must remain disabled when default resolver policy is missing.',
    ['default resolver readiness'],
  ),
  blocker(
    'rollback-default-disable-mechanism',
    'rollback/default-disable mechanism',
    'v0.6.34 documents rollback/default-disable ownership as future policy; no runtime default-disable mechanism exists.',
    'Approved rollback/default-disable mechanism and tests for bad package, bad helper, bad resolver, unsupported platform, and package deprecation/unpublish scenarios.',
    'Default Go must remain disabled when rollback/default-disable mechanism is missing.',
    ['rollback/default-disable implementation'],
  ),
  blocker(
    'security-signing-policy',
    'security/signing policy',
    'v0.6.34 records signing/security fields as placeholder/non-real and does not approve signing, cosign, SLSA, or attestation.',
    'Approved signing/security policy, provenance boundary, attestation semantics, verification ownership, and no-leak diagnostics.',
    'Default Go must remain disabled when security/signing policy is missing.',
    ['signing approval', 'security attestation approval'],
  ),
  blocker(
    'platform-policy',
    'platform policy',
    'v0.6.35 pivots away from second-platform matrix work; review artifact remains linux-x64-glibc only.',
    'Approved platform support policy, unsupported-platform behavior, and explicit statement that no second-platform work is required for this stage.',
    'Default Go must remain disabled when platform policy is missing.',
    ['platform expansion', 'second-platform support'],
  ),
  blocker(
    'hosted-tag-gates',
    'hosted/tag gates',
    'Prior checkpoints record no hosted workflow query/fetch/trigger, no commit, no tag, no push, no npm version, and no npm publish for worker slices.',
    'Leader-approved hosted evidence policy and tag/release policy, or explicit waiver recorded outside repo state alone.',
    'Default Go must remain disabled when hosted/tag gates are missing.',
    ['hosted workflow approval', 'tag/release approval'],
  ),
  blocker(
    'explicit-leader-user-approval',
    'explicit leader/user approval',
    'All prior slices preserve STOP language that default Go, default resolver, package release, install source, signing, and fallback deletion require later explicit approval.',
    'Explicit leader/user approval after all required evidence, policies, and rollback/default-disable gates are complete.',
    'Default Go must remain disabled when explicit leader/user approval is missing.',
    ['implicit approval from tests', 'implicit approval from current repo state'],
  ),
  blocker(
    'typescript-fallback-retention-deletion-gate',
    'TypeScript fallback retention / deletion gate',
    'Runtime keeps compactReadModelFingerprint on TypeScript fallback/non-cutover and fallback deletion remains blocked.',
    'Approved post-default-Go checkpoint proving fallback deletion readiness and rollback/default-disable alternatives without hidden runtime fallback after cutover.',
    'Default Go and fallback deletion must remain disabled when TypeScript fallback retention/deletion gate is missing.',
    ['fallback deletion', 'compactReadModelFingerprint cutover'],
  ),
  blocker(
    'go-authority-boundaries',
    'Go authority boundaries',
    'Current Go authority is bounded to tmuxSnapshotParse cutover experiments; /team readiness remains reviewer diagnostics and not normal-user availability proof.',
    'Approved Go authority boundary for default operation, including no control-plane expansion, no /team readiness expansion, and no broad Go-owned state/workflow authority.',
    'Default Go must remain disabled when Go authority boundaries are missing.',
    ['Go control-plane authority expansion', '/team readiness expansion'],
  ),
])

const defaultGoReadinessLedger = Object.freeze({
  schemaVersion: DEFAULT_GO_READINESS_LEDGER_SCHEMA_VERSION,
  theme: DEFAULT_GO_READINESS_THEME,
  module: DEFAULT_GO_READINESS_MODULE,
  ready: false,
  defaultGo: false,
  defaultResolver: false,
  normalUserNativeAvailability: false,
  fallbackDeletion: false,
  modeChange: false,
  packageReleaseApproved: false,
  secondPlatformSupport: false,
  signingApproved: false,
  noSilentWaiver: true,
  blockers: defaultGoReadinessBlockers,
})

module.exports = {
  BLOCKED,
  DEFAULT_GO_BLOCKER_IDS,
  DEFAULT_GO_READINESS_LEDGER_SCHEMA_VERSION,
  DEFAULT_GO_READINESS_MODULE,
  DEFAULT_GO_READINESS_THEME,
  defaultGoReadinessBlockers,
  defaultGoReadinessLedger,
}
