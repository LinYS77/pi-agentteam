const READINESS_EVIDENCE_REGISTRY_SCHEMA_VERSION = 1
const READINESS_EVIDENCE_REGISTRY_THEME = 'v0.6.36 install/load evidence registry'
const ACCEPTED_LOCAL_EVIDENCE = 'accepted-local-evidence'
const COMMON_DOES_NOT_PROVE = Object.freeze([
  'native helper delivery',
  'package-manager native delivery',
  'normal-user native availability',
  'default Go approval or enablement',
  'default resolver approval or enablement',
  'TypeScript fallback deletion approval',
  'package release approval',
  'install source approval',
  'release asset approval',
  'signing/cosign/SLSA/security attestation approval',
  'second-platform support or platform matrix',
  'hosted workflow approval or tag approval',
])

const READINESS_EVIDENCE_ENTRY_IDS = Object.freeze([
  'v0633-clean-install-native-helper-preview',
  'v0635-ts-pi-facade-install-load',
])

function evidenceEntry(input) {
  return Object.freeze({
    id: input.id,
    sourceVersion: input.sourceVersion,
    evidenceKind: input.evidenceKind,
    status: ACCEPTED_LOCAL_EVIDENCE,
    reviewOnly: true,
    prototype: true,
    explicitOnly: input.explicitOnly,
    localOnly: true,
    rerunByRegistry: false,
    availabilityClaim: false,
    defaultGoEvidence: false,
    defaultResolverEvidence: false,
    normalUserNativeAvailability: false,
    nativePackageDelivery: false,
    packageManagerNativeDelivery: false,
    packageReleaseEvidence: false,
    installSourceEvidence: false,
    releaseAssetEvidence: false,
    signingEvidence: false,
    fallbackDeletionEvidence: false,
    secondPlatformSupport: false,
    doesProve: Object.freeze(input.doesProve),
    doesNotProve: Object.freeze([...COMMON_DOES_NOT_PROVE, ...(input.doesNotProve || [])]),
    references: Object.freeze(input.references),
  })
}

const readinessEvidenceEntries = Object.freeze([
  evidenceEntry({
    id: 'v0633-clean-install-native-helper-preview',
    sourceVersion: 'v0.6.33',
    evidenceKind: 'explicit installed-layout go-packaged-preview consumption / clean-install native helper prototype',
    explicitOnly: true,
    doesProve: Object.freeze([
      'review-only clean-install package baseline shape',
      'verified review artifact can be copied into a temp installed package layout',
      'explicit go-packaged-preview can consume the injected installed layout',
      'installed-layout prototype failures are fail-closed and redacted',
      'default/unset, disabled, typescript, go, and auto modes ignore the injected installed layout',
    ]),
    doesNotProve: Object.freeze([
      'real package-manager native delivery',
      'real install source ownership',
      'normal package install native availability',
      'default packaged resolver discovery',
      'release asset availability',
    ]),
    references: Object.freeze([
      'docs/perf/v0.6.33-clean-install-native-helper-consumption.md',
      'docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md',
      'scripts/lib/go-helper-clean-install-proof.cjs',
      'scripts/verify-go-helper-clean-install-proof.cjs',
      'tests/suites/go-kernel-v0633-package-manager-clean-install-baseline.cjs',
      'tests/suites/go-kernel-v0633-installed-layout-consumption.cjs',
      'tests/suites/go-kernel-v0633-installed-layout-fail-closed.cjs',
      'tests/suites/go-kernel-v0633-package-runtime-guardrails.cjs',
      'tests/suites/go-kernel-v0633-clean-install-checkpoint-docs.cjs',
    ]),
  }),
  evidenceEntry({
    id: 'v0635-ts-pi-facade-install-load',
    sourceVersion: 'v0.6.35',
    evidenceKind: 'temp package install/load for TypeScript/pi extension facade with stubbed pi API',
    explicitOnly: false,
    doesProve: Object.freeze([
      'TypeScript/pi facade package root can load from a temp installed package shape',
      'package.json pi extension entry remains ./index.ts',
      'default extension factory is callable with stubbed pi API',
      '/team command and expected agentteam tools register during stubbed load',
      'temp install/load proof cleans redacted temp roots by default',
    ]),
    doesNotProve: Object.freeze([
      'native helper delivery through package manager',
      'real pi install availability',
      'normal-user native helper availability',
      'default packaged resolver discovery',
      'release asset availability',
    ]),
    references: Object.freeze([
      'docs/perf/v0.6.35-pi-extension-compliance-package-surface.md',
      'docs/perf/v0.6.35-pi-extension-compliance-package-surface-checkpoint.md',
      'scripts/lib/pi-extension-install-load-proof.cjs',
      'scripts/verify-pi-extension-install-load.cjs',
      'tests/suites/go-kernel-v0635-pi-extension-install-load-smoke.cjs',
      'tests/suites/go-kernel-v0635-command-tool-surface-contract.cjs',
      'tests/suites/go-kernel-v0635-package-surface-minimization.cjs',
      'tests/suites/go-kernel-v0635-runtime-mode-boundaries.cjs',
      'tests/suites/go-kernel-v0635-pi-extension-compliance-checkpoint-docs.cjs',
    ]),
  }),
])

const readinessEvidenceRegistry = Object.freeze({
  schemaVersion: READINESS_EVIDENCE_REGISTRY_SCHEMA_VERSION,
  theme: READINESS_EVIDENCE_REGISTRY_THEME,
  availabilityClaim: false,
  defaultGoEvidence: false,
  defaultResolverEvidence: false,
  normalUserNativeAvailability: false,
  nativePackageDelivery: false,
  packageManagerNativeDelivery: false,
  packageReleaseEvidence: false,
  installSourceEvidence: false,
  releaseAssetEvidence: false,
  signingEvidence: false,
  fallbackDeletionEvidence: false,
  secondPlatformSupport: false,
  rerunsProofs: false,
  generatesArtifacts: false,
  entries: readinessEvidenceEntries,
})

module.exports = {
  ACCEPTED_LOCAL_EVIDENCE,
  COMMON_DOES_NOT_PROVE,
  READINESS_EVIDENCE_ENTRY_IDS,
  READINESS_EVIDENCE_REGISTRY_SCHEMA_VERSION,
  READINESS_EVIDENCE_REGISTRY_THEME,
  readinessEvidenceEntries,
  readinessEvidenceRegistry,
}
