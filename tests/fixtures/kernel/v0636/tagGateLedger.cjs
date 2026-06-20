const TAG_GATE_LEDGER_SCHEMA_VERSION = 1
const TAG_GATE_LEDGER_THEME = 'v0.6.36 release/tag debt governance'
const GATED = 'gated'
const UNRESOLVED = 'unresolved'
const COMMON_DOES_NOT_PROVE = Object.freeze([
  'tag created',
  'tag pushed',
  'release created',
  'npm version completed',
  'npm publish completed',
  'release asset availability',
  'hosted workflow approval',
  'raw hosted evidence checked in',
  'native helper delivery',
  'package-manager native delivery',
  'normal-user native availability',
  'default Go approval or enablement',
  'default resolver approval or enablement',
  'TypeScript fallback deletion approval',
  'install source approval',
  'signing/cosign/SLSA/security attestation approval',
  'second-platform support or platform matrix',
])

const TAG_GATE_VERSIONS = Object.freeze([
  'v0.6.31',
  'v0.6.32',
  'v0.6.33',
  'v0.6.34',
  'v0.6.35',
  'v0.6.36',
])

function tagGateEntry(input) {
  return Object.freeze({
    version: input.version,
    status: GATED,
    resolution: UNRESOLVED,
    requiresLeaderDecision: true,
    requiresHostedEvidenceOrWaiver: input.requiresHostedEvidenceOrWaiver,
    releaseWorkPerformed: false,
    tagCreated: false,
    tagPushed: false,
    pushPerformed: false,
    hostedWorkflowQueried: false,
    ghUsed: false,
    npmPublish: false,
    npmVersion: false,
    rawHostedRecordsCheckedIn: false,
    releaseAssetsCreated: false,
    waiverInvented: false,
    tagWouldMeanAvailability: false,
    policy: input.policy,
    blockedBy: Object.freeze(input.blockedBy || []),
    allowedFutureResolution: input.allowedFutureResolution,
    doesNotProve: Object.freeze([...COMMON_DOES_NOT_PROVE, ...(input.doesNotProve || [])]),
    references: Object.freeze(input.references),
  })
}

const tagGateEntries = Object.freeze([
  tagGateEntry({
    version: 'v0.6.31',
    requiresHostedEvidenceOrWaiver: true,
    policy: 'v0.6.31 remains gated by exact hosted workflow observation for the pushed implementation commit or a later explicit leader/user waiver.',
    allowedFutureResolution: 'Leader supplies exact hosted run evidence or explicitly changes/waives the release rule.',
    references: [
      'docs/perf/v0.6.31-ci-review-artifact-verifier-hardening.md',
      'docs/perf/v0.6.31-ci-review-artifact-verifier-hardening-checkpoint.md',
      'docs/perf/v0.6.32-ci-review-provenance-build-context.md',
      'docs/perf/v0.6.32-ci-review-provenance-build-context-checkpoint.md',
    ],
  }),
  tagGateEntry({
    version: 'v0.6.32',
    requiresHostedEvidenceOrWaiver: true,
    policy: 'v0.6.32 tag remains gated by the v0.6.31 tag policy and hosted evidence, or by a later explicit leader/user waiver.',
    blockedBy: ['v0.6.31'],
    allowedFutureResolution: 'Complete or waive the v0.6.31 tag gate, then leader supplies exact hosted evidence or an explicit waiver for v0.6.32.',
    references: [
      'docs/perf/v0.6.32-ci-review-provenance-build-context.md',
      'docs/perf/v0.6.32-ci-review-provenance-build-context-checkpoint.md',
    ],
  }),
  tagGateEntry({
    version: 'v0.6.33',
    requiresHostedEvidenceOrWaiver: true,
    policy: 'v0.6.33 tag remains gated by unresolved prior tag gates unless the leader/user supplies an explicit waiver.',
    blockedBy: ['v0.6.31', 'v0.6.32'],
    allowedFutureResolution: 'Leader resolves or waives prior tag gates and explicitly authorizes any v0.6.33 tag.',
    references: [
      'docs/perf/v0.6.33-clean-install-native-helper-consumption.md',
      'docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md',
    ],
  }),
  tagGateEntry({
    version: 'v0.6.34',
    requiresHostedEvidenceOrWaiver: true,
    policy: 'v0.6.34 tag remains gated by prior unresolved tag gates unless exact hosted evidence or explicit leader/user waiver is supplied.',
    blockedBy: ['v0.6.31', 'v0.6.32', 'v0.6.33'],
    allowedFutureResolution: 'Leader resolves or waives prior tag gates and explicitly authorizes any v0.6.34 tag.',
    references: [
      'docs/perf/v0.6.34-package-release-install-layout-decision.md',
      'docs/perf/v0.6.34-package-release-install-layout-decision-checkpoint.md',
    ],
  }),
  tagGateEntry({
    version: 'v0.6.35',
    requiresHostedEvidenceOrWaiver: true,
    policy: 'v0.6.35 tag remains gated by prior unresolved tag gates unless exact hosted evidence or explicit leader/user waiver is supplied.',
    blockedBy: ['v0.6.31', 'v0.6.32', 'v0.6.33', 'v0.6.34'],
    allowedFutureResolution: 'Leader resolves or waives prior tag gates and explicitly authorizes any v0.6.35 tag.',
    references: [
      'docs/perf/v0.6.35-pi-extension-compliance-package-surface.md',
      'docs/perf/v0.6.35-pi-extension-compliance-package-surface-checkpoint.md',
    ],
  }),
  tagGateEntry({
    version: 'v0.6.36',
    requiresHostedEvidenceOrWaiver: true,
    policy: 'v0.6.36 tag is gated; if ever tagged, it would identify docs/tests dry-run governance only and not default/native/release availability.',
    blockedBy: ['v0.6.31', 'v0.6.32', 'v0.6.33', 'v0.6.34', 'v0.6.35'],
    allowedFutureResolution: 'Leader resolves or waives prior tag gates, reviews the final v0.6.36 checkpoint, and explicitly authorizes any v0.6.36 tag as governance-only.',
    doesNotProve: [
      'default-Go readiness',
      'native/default/release availability',
      'package release readiness',
    ],
    references: [
      'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md',
    ],
  }),
])

const tagGateLedger = Object.freeze({
  schemaVersion: TAG_GATE_LEDGER_SCHEMA_VERSION,
  theme: TAG_GATE_LEDGER_THEME,
  releaseWorkPerformed: false,
  tagCreated: false,
  pushPerformed: false,
  hostedWorkflowQueried: false,
  ghUsed: false,
  npmPublish: false,
  npmVersion: false,
  rawHostedRecordsCheckedIn: false,
  releaseAssetsCreated: false,
  waiverInvented: false,
  entries: tagGateEntries,
})

module.exports = {
  COMMON_DOES_NOT_PROVE,
  GATED,
  TAG_GATE_LEDGER_SCHEMA_VERSION,
  TAG_GATE_LEDGER_THEME,
  TAG_GATE_VERSIONS,
  UNRESOLVED,
  tagGateEntries,
  tagGateLedger,
}
