const COMMON_NO_RELEASE_OVERCLAIMS = [
  'npm publish is approved',
  'npm version is approved',
  'npm/default/native cutover is approved',
  'native/default cutover is approved',
  'native packaging is approved',
  'native package publication is approved',
  'package metadata is approved',
  'package version change is approved',
  'default Go is approved',
  'Go is default',
  'Go remains default',
  'fallback deletion is approved',
  'TypeScript parser fallback deletion is approved',
  'this checkpoint proves normal-user native availability',
  'normal-user native availability is proven by this checkpoint',
  'release artifacts are generated',
  'GitHub release assets are approved',
  'main package inclusion is approved',
  'checked-in binary is allowed',
  'postinstall download is allowed',
  'commit/tag/push as part of this checkpoint',
]

const CURRENT_ROADMAP_EXPECTATIONS = {
  path: 'docs/agentteam方案书.md',
  requiredPhrases: [
    '## 10. 历史 checkpoint ledger（审计附录）',
    '历史条目不覆盖上文当前 Go-owned core 主计划',
    'v0.6.97+ Go-core 路线为准',
    'architectureComplete != releaseActionAuthorized',
    'package remains `0.6.8` unless later explicitly authorized',
  ],
  forbiddenPhrases: [
    '历史条目覆盖上文当前 Go-owned core 主计划',
    '历史 checkpoint 覆盖当前 Go-owned core 主计划',
    'v0.4.19-v0.4.27 覆盖 v0.6.97+ Go-core 路线',
  ],
}

const HISTORICAL_CHECKPOINT_FAMILIES_V0419_V0427 = [
  {
    id: 'v0419-readiness-prerequisites',
    version: 'v0.4.19',
    checkpointLabel: 'Go Kernel Readiness Checkpoint',
    checkpointDoc: 'docs/perf/v0.4.19-go-kernel-readiness-checkpoint.md',
    docs: [
      'docs/perf/v0.4.19-go-runtime-prerequisites.md',
      'docs/perf/v0.4.19-tmux-snapshot-fail-closed-readiness.md',
      'docs/perf/v0.4.19-team-refresh-parser-unavailable-safety.md',
      'docs/perf/v0.4.19-go-helper-smoke-readiness.md',
      'docs/perf/v0.4.19-go-kernel-readiness-checkpoint.md',
    ],
    planBacklinks: [
      'docs/perf/v0.4.19-go-runtime-prerequisites.md',
      'docs/perf/v0.4.19-go-kernel-readiness-checkpoint.md',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.4.19-go-kernel-readiness-checkpoint.md',
        to: [
          'docs/perf/v0.4.19-go-runtime-prerequisites.md',
          'docs/perf/v0.4.19-tmux-snapshot-fail-closed-readiness.md',
          'docs/perf/v0.4.19-team-refresh-parser-unavailable-safety.md',
          'docs/perf/v0.4.19-go-helper-smoke-readiness.md',
        ],
      },
    ],
    requiredThemes: [
      'v0.4.19 completed readiness planning',
      'It did not perform the cutover',
      'Model A',
      'Model B',
      'Model C',
      'fallback deletion is blocked until runtime prerequisite signoff',
      'No default Go runtime is approved by v0.4.19',
      'readiness-only',
      'package version 0.6.8',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0419-runtime-prereq-docs.cjs',
      'tests/suites/go-kernel-v0419-tmux-readiness-docs.cjs',
      'tests/suites/go-kernel-v0419-refresh-parser-unavailable-safety.cjs',
      'tests/suites/go-kernel-v0419-helper-smoke-docs.cjs',
      'tests/suites/go-kernel-v0419-readiness-checkpoint-docs.cjs',
    ],
  },
  {
    id: 'v0420-cutover-checkpoint',
    version: 'v0.4.20',
    checkpointLabel: 'Go Cutover Checkpoint',
    checkpointDoc: 'docs/perf/v0.4.20-go-cutover-checkpoint.md',
    docs: [
      'docs/perf/v0.4.20-go-cutover-helper-smoke.md',
      'docs/perf/v0.4.20-go-cutover-checkpoint.md',
    ],
    planBacklinks: [
      'docs/perf/v0.4.20-go-cutover-checkpoint.md',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.4.20-go-cutover-checkpoint.md',
        to: ['docs/perf/v0.4.20-go-cutover-helper-smoke.md'],
      },
      {
        from: 'docs/perf/v0.4.20-go-cutover-helper-smoke.md',
        to: ['docs/perf/v0.4.19-go-helper-smoke-readiness.md'],
      },
    ],
    requiredThemes: [
      'GO for a GitHub-only experimental checkpoint',
      'STOP for npm/default/native cutover',
      'explicit local/reviewer mode only',
      '`tmuxSnapshotParse` is the only Go-owned cutover module',
      'TypeScript/pi control plane remains authoritative',
      'Source-only helper smoke evidence',
      'package.json` version remains `0.6.8`',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0420-helper-smoke-docs.cjs',
      'tests/suites/go-kernel-v0420-checkpoint-docs.cjs',
    ],
  },
  {
    id: 'v0421-runtime-availability',
    version: 'v0.4.21',
    checkpointLabel: 'Go Runtime Availability Checkpoint',
    checkpointDoc: 'docs/perf/v0.4.21-go-runtime-availability-checkpoint.md',
    docs: [
      'docs/perf/v0.4.21-go-runtime-availability.md',
      'docs/perf/v0.4.21-go-native-artifact-contract.md',
      'docs/perf/v0.4.21-go-package-policy-guardrails.md',
      'docs/perf/v0.4.21-go-resolver-diagnostics-design.md',
      'docs/perf/v0.4.21-go-packaged-preview-resolver.md',
      'docs/perf/v0.4.21-go-artifact-prototype.md',
      'docs/perf/v0.4.21-go-runtime-availability-checkpoint.md',
    ],
    planBacklinks: [
      'docs/perf/v0.4.21-go-runtime-availability.md',
      'docs/perf/v0.4.21-go-runtime-availability-checkpoint.md',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.4.21-go-runtime-availability.md',
        to: ['docs/perf/v0.4.20-go-cutover-checkpoint.md'],
      },
      {
        from: 'docs/perf/v0.4.21-go-runtime-availability-checkpoint.md',
        to: [
          'docs/perf/v0.4.20-go-cutover-checkpoint.md',
          'docs/perf/v0.4.21-go-runtime-availability.md',
          'docs/perf/v0.4.21-go-native-artifact-contract.md',
          'docs/perf/v0.4.21-go-package-policy-guardrails.md',
          'docs/perf/v0.4.21-go-resolver-diagnostics-design.md',
          'docs/perf/v0.4.21-go-packaged-preview-resolver.md',
          'docs/perf/v0.4.21-go-artifact-prototype.md',
        ],
      },
    ],
    requiredThemes: [
      'Model C0',
      'Normal-user availability is still not proven',
      '`go-packaged-preview` is explicit-only, non-default, and not normal-user availability proof',
      'TypeScript/pi remains the control plane',
      'STOP for npm/default/native cutover',
      'STOP for TypeScript parser fallback deletion',
      'package version `0.6.8`',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0421-runtime-availability-docs.cjs',
      'tests/suites/go-kernel-v0421-native-artifact-contract-docs.cjs',
      'tests/suites/go-kernel-v0421-package-policy-guardrails.cjs',
      'tests/suites/go-kernel-v0421-resolver-diagnostics-docs.cjs',
      'tests/suites/go-kernel-v0421-runtime-availability-checkpoint-docs.cjs',
    ],
  },
  {
    id: 'v0422-package-metadata',
    version: 'v0.4.22',
    checkpointLabel: 'Native Helper Package Metadata Checkpoint',
    checkpointDoc: 'docs/perf/v0.4.22-native-helper-package-metadata-checkpoint.md',
    docs: [
      'docs/perf/v0.4.22-native-helper-package-metadata.md',
      'docs/perf/v0.4.22-native-helper-package-metadata-checkpoint.md',
    ],
    planBacklinks: [
      'docs/perf/v0.4.22-native-helper-package-metadata.md',
      'docs/perf/v0.4.22-native-helper-package-metadata-checkpoint.md',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.4.22-native-helper-package-metadata.md',
        to: ['docs/perf/v0.4.21-go-runtime-availability-checkpoint.md'],
      },
      {
        from: 'docs/perf/v0.4.22-native-helper-package-metadata-checkpoint.md',
        to: [
          'docs/perf/v0.4.21-go-runtime-availability-checkpoint.md',
          'docs/perf/v0.4.22-native-helper-package-metadata.md',
        ],
      },
    ],
    requiredThemes: [
      'metadata-owner dry-run',
      'STOP for npm/default/native cutover',
      'STOP for real package inclusion or native package publication',
      'STOP for `package.json` metadata or version changes',
      'normal-user availability proof',
      'TypeScript/pi remains the control plane',
      'package version `0.6.8`',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0422-native-package-metadata-docs.cjs',
      'tests/suites/go-kernel-v0422-native-package-metadata-checkpoint-docs.cjs',
    ],
  },
  {
    id: 'v0423-compact-diagnostics',
    version: 'v0.4.23',
    checkpointLabel: 'Compact Native Failure Diagnostics Checkpoint',
    checkpointDoc: 'docs/perf/v0.4.23-compact-native-failure-diagnostics-checkpoint.md',
    docs: [
      'docs/perf/v0.4.23-compact-native-failure-diagnostics.md',
      'docs/perf/v0.4.23-compact-native-failure-diagnostics-checkpoint.md',
    ],
    planBacklinks: [
      'docs/perf/v0.4.23-compact-native-failure-diagnostics.md',
      'docs/perf/v0.4.23-compact-native-failure-diagnostics-checkpoint.md',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.4.23-compact-native-failure-diagnostics.md',
        to: ['docs/perf/v0.4.22-native-helper-package-metadata-checkpoint.md'],
      },
      {
        from: 'docs/perf/v0.4.23-compact-native-failure-diagnostics-checkpoint.md',
        to: [
          'docs/perf/v0.4.22-native-helper-package-metadata-checkpoint.md',
          'docs/perf/v0.4.23-compact-native-failure-diagnostics.md',
        ],
      },
    ],
    requiredThemes: [
      'compact diagnostics',
      'release decision gate',
      'STOP for npm/default/native cutover',
      'diagnostics/readiness is not normal-user native availability proof',
      'runtime `/team` stays quiet',
      'parser-only stdin/stdout `tmuxSnapshotParse`',
      'TypeScript/pi remains the control plane',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0423-compact-diagnostics-docs.cjs',
      'tests/suites/go-kernel-v0423-compact-diagnostics-checkpoint-docs.cjs',
    ],
  },
  {
    id: 'v0424-readiness-command',
    version: 'v0.4.24',
    checkpointLabel: 'Explicit Readiness Command Integration Checkpoint',
    checkpointDoc: 'docs/perf/v0.4.24-explicit-readiness-command-integration-checkpoint.md',
    docs: [
      'docs/perf/v0.4.24-explicit-readiness-command-integration.md',
      'docs/perf/v0.4.24-explicit-readiness-command-integration-checkpoint.md',
    ],
    planBacklinks: [
      'docs/perf/v0.4.24-explicit-readiness-command-integration.md',
      'docs/perf/v0.4.24-explicit-readiness-command-integration-checkpoint.md',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.4.24-explicit-readiness-command-integration.md',
        to: ['docs/perf/v0.4.23-compact-native-failure-diagnostics-checkpoint.md'],
      },
      {
        from: 'docs/perf/v0.4.24-explicit-readiness-command-integration-checkpoint.md',
        to: [
          'docs/perf/v0.4.23-compact-native-failure-diagnostics-checkpoint.md',
          'docs/perf/v0.4.24-explicit-readiness-command-integration.md',
        ],
      },
    ],
    requiredThemes: [
      'transitional `/team readiness` reviewer command',
      'STOP for expanding `/team readiness`',
      'STOP for ambient `/team` UI/panel diagnostics',
      'STOP for npm/default/native cutover',
      'not normal-user native availability proof',
      'Go mainline remains core hot-path replacement',
      'TypeScript/pi remains the control plane',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0424-readiness-command-contract-docs.cjs',
      'tests/suites/go-kernel-v0424-readiness-command-seam-docs.cjs',
      'tests/suites/go-kernel-v0424-readiness-command-sunset-docs.cjs',
      'tests/suites/go-kernel-v0424-readiness-command-checkpoint-docs.cjs',
    ],
  },
  {
    id: 'v0425-native-availability',
    version: 'v0.4.25',
    checkpointLabel: 'Native Helper Availability Proof Checkpoint',
    checkpointDoc: 'docs/perf/v0.4.25-native-helper-availability-proof-checkpoint.md',
    docs: [
      'docs/perf/v0.4.25-native-helper-availability-proof.md',
      'docs/perf/v0.4.25-native-helper-availability-proof-checkpoint.md',
    ],
    planBacklinks: [
      'docs/perf/v0.4.25-native-helper-availability-proof.md',
      'docs/perf/v0.4.25-native-helper-availability-proof-checkpoint.md',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.4.25-native-helper-availability-proof.md',
        to: ['docs/perf/v0.4.24-explicit-readiness-command-integration-checkpoint.md'],
      },
      {
        from: 'docs/perf/v0.4.25-native-helper-availability-proof-checkpoint.md',
        to: [
          'docs/perf/v0.4.24-explicit-readiness-command-integration-checkpoint.md',
          'docs/perf/v0.4.25-native-helper-availability-proof.md',
        ],
      },
    ],
    requiredThemes: [
      'evidence only, not release/default approval',
      'v0.4.25 still does not prove normal-user native availability',
      'packaged/default/fallback deletion gate',
      'TS/pi control plane remains mandatory',
      'STOP for:',
      'npm version/publish',
      'TypeScript fallback deletion',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0425-native-availability-contract-docs.cjs',
      'tests/suites/go-kernel-v0425-native-availability-checkpoint-docs.cjs',
    ],
  },
  {
    id: 'v0426-artifact-pipeline',
    version: 'v0.4.26',
    checkpointLabel: 'Go Helper Artifact Generation Pipeline Prototype Checkpoint',
    checkpointDoc: 'docs/perf/v0.4.26-go-helper-artifact-pipeline-checkpoint.md',
    docs: [
      'docs/perf/v0.4.26-go-helper-artifact-pipeline.md',
      'docs/perf/v0.4.26-go-helper-artifact-pipeline-checkpoint.md',
    ],
    planBacklinks: [
      'docs/perf/v0.4.26-go-helper-artifact-pipeline.md',
      'docs/perf/v0.4.26-go-helper-artifact-pipeline-checkpoint.md',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.4.26-go-helper-artifact-pipeline.md',
        to: ['docs/perf/v0.4.25-native-helper-availability-proof-checkpoint.md'],
      },
      {
        from: 'docs/perf/v0.4.26-go-helper-artifact-pipeline-checkpoint.md',
        to: [
          'docs/perf/v0.4.25-native-helper-availability-proof-checkpoint.md',
          'docs/perf/v0.4.26-go-helper-artifact-pipeline.md',
        ],
      },
    ],
    requiredThemes: [
      'docs/tests only',
      'GO only for GitHub-only evidence planning',
      'STOP for helper build command implementation',
      'STOP for npm/package/default/native/fallback approval',
      'OS temp dirs',
      'not normal-user availability proof',
      'package.json version remains `0.6.8`',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0426-artifact-pipeline-contract-docs.cjs',
      'tests/suites/go-kernel-v0426-build-matrix-policy-docs.cjs',
      'tests/suites/go-kernel-v0426-storage-release-policy-docs.cjs',
      'tests/suites/go-kernel-v0426-artifact-pipeline-checkpoint-docs.cjs',
    ],
  },
  {
    id: 'v0427-clean-install-consumption',
    version: 'v0.4.27',
    checkpointLabel: 'Generated Artifact Clean-Install Consumption Gate Checkpoint',
    checkpointDoc: 'docs/perf/v0.4.27-generated-artifact-clean-install-consumption-checkpoint.md',
    docs: [
      'docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md',
      'docs/perf/v0.4.27-generated-artifact-clean-install-consumption-checkpoint.md',
    ],
    planBacklinks: [
      'docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md',
      'docs/perf/v0.4.27-generated-artifact-clean-install-consumption-checkpoint.md',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md',
        to: ['docs/perf/v0.4.26-go-helper-artifact-pipeline-checkpoint.md'],
      },
      {
        from: 'docs/perf/v0.4.27-generated-artifact-clean-install-consumption-checkpoint.md',
        to: [
          'docs/perf/v0.4.26-go-helper-artifact-pipeline-checkpoint.md',
          'docs/perf/v0.4.27-generated-artifact-clean-install-consumption.md',
        ],
      },
    ],
    requiredThemes: [
      'docs/tests only',
      'clean-install consumption',
      'does not prove normal-user native availability',
      'STOP for production clean-install consumption implementation',
      'STOP for generated artifacts/manifests/helpers checked into the repo',
      'STOP for CI workflow implementation',
      'GitHub-only evidence planning',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0427-clean-install-consumption-contract-docs.cjs',
      'tests/suites/go-kernel-v0427-install-layout-matrix-docs.cjs',
      'tests/suites/go-kernel-v0427-consumption-checkpoint-docs.cjs',
    ],
  },
]


const HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643 = [
  {
    id: 'v0628-final-prep-entry',
    version: 'v0.6.28',
    checkpointLabel: 'Final Prep and v0.6.29 Entry',
    checkpointDoc: 'docs/perf/v0.6.28-final-prep-and-v0.6.29-entry.md',
    docs: [
      'docs/perf/v0.6.28-final-prep-and-v0.6.29-entry.md',
    ],
    planBacklinks: [
      'docs/perf/v0.6.28-final-prep-and-v0.6.29-entry.md',
    ],
    continuityLinks: [],
    requiredThemes: [
      'short docs/tests-only final-prep checkpoint',
      'Version Namespace Correction',
      'v0.6.29 is GO for real local/reviewer-controlled Go helper artifact builder',
      'v0.6.28 STOP',
      '`package.json` remains `0.6.8`',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0628-final-prep-entry-guard.cjs',
    ],
    nonCandidateSuites: [],
  },
  {
    id: 'v0629-real-helper-artifact-entry',
    version: 'v0.6.29',
    checkpointLabel: 'Real Go Helper Artifact Entry Checkpoint',
    checkpointDoc: 'docs/perf/v0.6.29-real-go-helper-artifact-entry-checkpoint.md',
    docs: [
      'docs/perf/v0.6.29-real-go-helper-artifact-entry-checkpoint.md',
    ],
    planBacklinks: [
      'docs/perf/v0.6.29-real-go-helper-artifact-entry-checkpoint.md',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.6.29-real-go-helper-artifact-entry-checkpoint.md',
        to: ['docs/perf/v0.6.28-final-prep-and-v0.6.29-entry.md'],
      },
    ],
    requiredThemes: [
      'real local/reviewer-controlled Go helper artifact entry',
      'checkpoint docs/tests/guard consolidation only',
      'v0.6.29 does not approve package/native/default/fallback/readiness expansion',
      '`package.json` remains `0.6.8`',
      'v0.6.29 does not prove normal-user native availability',
      'TypeScript fallback is not deleted',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0629-real-implementation-checkpoint-docs.cjs',
    ],
    nonCandidateSuites: [
      'tests/suites/go-kernel-v0629-helper-artifact-builder.cjs',
      'tests/suites/go-kernel-v0629-real-helper-artifact-build.cjs',
      'tests/suites/go-kernel-v0629-packaged-manifest-resolver.cjs',
      'tests/suites/go-kernel-v0629-packaged-preview-manifest-integration.cjs',
      'tests/suites/go-kernel-v0629-real-artifact-clean-install-preview.cjs',
    ],
  },
  {
    id: 'v0630-ci-review-artifact-prototype',
    version: 'v0.6.30',
    checkpointLabel: 'CI Review Artifact Prototype Checkpoint',
    checkpointDoc: 'docs/perf/v0.6.30-ci-review-artifact-prototype-checkpoint.md',
    docs: [
      'docs/perf/v0.6.30-ci-review-artifact-prototype.md',
      'docs/perf/v0.6.30-ci-review-artifact-prototype-checkpoint.md',
    ],
    planBacklinks: [
      'v0.6.30` 已完成并 tag/push',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.6.30-ci-review-artifact-prototype.md',
        to: ['docs/perf/v0.6.30-ci-review-artifact-prototype-checkpoint.md'],
      },
      {
        from: 'docs/perf/v0.6.30-ci-review-artifact-prototype-checkpoint.md',
        to: ['docs/perf/v0.6.30-ci-review-artifact-prototype.md'],
      },
    ],
    requiredThemes: [
      'review-only CI evidence',
      'GO for checkpoint evidence only',
      'artifact-index.json` records `reviewOnly: true`',
      'normalUserAvailability: false',
      'STOP / Non-Approvals',
      '`package.json#files` changes',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0630-ci-review-artifact-checkpoint-docs.cjs',
    ],
    nonCandidateSuites: [
      'tests/suites/go-kernel-v0630-ci-artifact-index.cjs',
      'tests/suites/go-kernel-v0630-ci-artifact-reverify.cjs',
      'tests/suites/go-kernel-v0630-ci-matrix-policy.cjs',
      'tests/suites/go-kernel-v0630-ci-review-artifact-workflow.cjs',
      'tests/suites/go-kernel-v0630-packaged-preview-reviewer-usability.cjs',
    ],
  },
  {
    id: 'v0631-ci-review-verifier-hardening',
    version: 'v0.6.31',
    checkpointLabel: 'CI Review Artifact Verifier Hardening Checkpoint',
    checkpointDoc: 'docs/perf/v0.6.31-ci-review-artifact-verifier-hardening-checkpoint.md',
    docs: [
      'docs/perf/v0.6.31-ci-review-artifact-verifier-hardening.md',
      'docs/perf/v0.6.31-ci-review-artifact-verifier-hardening-checkpoint.md',
    ],
    planBacklinks: [
      'v0.6.31` 已完成并 push 到 `main`',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.6.31-ci-review-artifact-verifier-hardening.md',
        to: ['docs/perf/v0.6.31-ci-review-artifact-verifier-hardening-checkpoint.md'],
      },
      {
        from: 'docs/perf/v0.6.31-ci-review-artifact-verifier-hardening-checkpoint.md',
        to: ['docs/perf/v0.6.31-ci-review-artifact-verifier-hardening.md'],
      },
    ],
    requiredThemes: [
      'Route C — strict verifier/security hardening is the v0.6.31 main route',
      'Route B — second platform row is deferred',
      'Route D — package-manager clean-install proof is deferred',
      'hosted run status is `not observed locally`',
      'STOP for release assets',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0631-ci-review-artifact-hardening-checkpoint-docs.cjs',
    ],
    nonCandidateSuites: [
      'tests/suites/go-kernel-v0631-ci-artifact-bundle-surface.cjs',
      'tests/suites/go-kernel-v0631-ci-artifact-context.cjs',
      'tests/suites/go-kernel-v0631-ci-review-artifact-workflow-strict-context.cjs',
      'tests/suites/go-kernel-v0631-hosted-observation-docs.cjs',
    ],
  },
  {
    id: 'v0632-ci-review-provenance-build-context',
    version: 'v0.6.32',
    checkpointLabel: 'CI Review Provenance Build Context Checkpoint',
    checkpointDoc: 'docs/perf/v0.6.32-ci-review-provenance-build-context-checkpoint.md',
    docs: [
      'docs/perf/v0.6.32-ci-review-provenance-build-context.md',
      'docs/perf/v0.6.32-ci-review-provenance-build-context-checkpoint.md',
    ],
    planBacklinks: [
      'v0.6.32` 已完成并 push 到 `main`',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.6.32-ci-review-provenance-build-context.md',
        to: ['docs/perf/v0.6.32-ci-review-provenance-build-context-checkpoint.md'],
      },
      {
        from: 'docs/perf/v0.6.32-ci-review-provenance-build-context-checkpoint.md',
        to: ['docs/perf/v0.6.32-ci-review-provenance-build-context.md'],
      },
    ],
    requiredThemes: [
      'Route C — provenance/build-context consistency is the v0.6.32 main route',
      'hosted observation record support is supporting evidence only',
      'second platform row is deferred',
      'package-manager proof is deferred',
      'no package-manager clean install proof is claimed',
      'tag policy remains explicit',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0632-ci-review-provenance-checkpoint-docs.cjs',
    ],
    nonCandidateSuites: [
      'tests/suites/go-kernel-v0632-builder-provenance-consistency.cjs',
      'tests/suites/go-kernel-v0632-hosted-observation-record.cjs',
      'tests/suites/go-kernel-v0632-provenance-build-context.cjs',
      'tests/suites/go-kernel-v0632-workflow-context-binding.cjs',
    ],
  },
  {
    id: 'v0633-clean-install-consumption',
    version: 'v0.6.33',
    checkpointLabel: 'Clean-Install Native Helper Consumption Checkpoint',
    checkpointDoc: 'docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md',
    docs: [
      'docs/perf/v0.6.33-clean-install-native-helper-consumption.md',
      'docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md',
    ],
    planBacklinks: [
      'v0.6.33` — Package-manager clean-install proof prototype',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.6.33-clean-install-native-helper-consumption.md',
        to: ['docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md'],
      },
      {
        from: 'docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md',
        to: ['docs/perf/v0.6.33-clean-install-native-helper-consumption.md'],
      },
    ],
    requiredThemes: [
      'Clean-Install Native Helper Consumption Prototype',
      'docs/tests-only contract',
      'normal-user native helper availability claim remains 0%',
      'v0.6.33 is still not real native package delivery',
      'does not change production runtime',
      'package/repo invariants: `package.json` remains `0.6.8`',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0633-clean-install-proof-contract-docs.cjs',
      'tests/suites/go-kernel-v0633-clean-install-checkpoint-docs.cjs',
    ],
    nonCandidateSuites: [
      'tests/suites/go-kernel-v0633-package-manager-clean-install-baseline.cjs',
      'tests/suites/go-kernel-v0633-installed-layout-consumption.cjs',
      'tests/suites/go-kernel-v0633-installed-layout-fail-closed.cjs',
      'tests/suites/go-kernel-v0633-package-runtime-guardrails.cjs',
    ],
  },
  {
    id: 'v0634-package-release-install-layout',
    version: 'v0.6.34',
    checkpointLabel: 'Package/Release Ownership & Install Layout Decision Checkpoint',
    checkpointDoc: 'docs/perf/v0.6.34-package-release-install-layout-decision-checkpoint.md',
    docs: [
      'docs/perf/v0.6.34-package-release-install-layout-decision.md',
      'docs/perf/v0.6.34-package-release-install-layout-decision-checkpoint.md',
    ],
    planBacklinks: [
      'v0.6.34` — Package/release ownership and install layout decision',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.6.34-package-release-install-layout-decision.md',
        to: ['docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md'],
      },
      {
        from: 'docs/perf/v0.6.34-package-release-install-layout-decision.md',
        to: ['docs/perf/v0.6.34-package-release-install-layout-decision-checkpoint.md'],
      },
      {
        from: 'docs/perf/v0.6.34-package-release-install-layout-decision-checkpoint.md',
        to: ['docs/perf/v0.6.34-package-release-install-layout-decision.md'],
      },
    ],
    requiredThemes: [
      'Package / Release Ownership and Install-Layout Decision Contract',
      'Main Route A completed',
      'Normal-user native helper availability remains 0%',
      'does not ship a normal-user native helper path',
      '`npm version`, `npm publish`, package release, or package source approval',
      'no package metadata is applied',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0634-ownership-install-layout-contract-docs.cjs',
      'tests/suites/go-kernel-v0634-distribution-option-matrix-docs.cjs',
      'tests/suites/go-kernel-v0634-rollback-default-disable-policy-docs.cjs',
      'tests/suites/go-kernel-v0634-security-signing-ownership-docs.cjs',
      'tests/suites/go-kernel-v0634-package-release-decision-checkpoint-docs.cjs',
    ],
    nonCandidateSuites: [
      'tests/suites/go-kernel-v0634-install-layout-contract.cjs',
      'tests/suites/go-kernel-v0634-non-applied-package-layout-fixtures.cjs',
    ],
  },
  {
    id: 'v0635-pi-extension-compliance',
    version: 'v0.6.35',
    checkpointLabel: 'Pi Extension Compliance & Package Surface Checkpoint',
    checkpointDoc: 'docs/perf/v0.6.35-pi-extension-compliance-package-surface-checkpoint.md',
    docs: [
      'docs/perf/v0.6.35-pi-extension-compliance-package-surface.md',
      'docs/perf/v0.6.35-pi-extension-compliance-package-surface-checkpoint.md',
    ],
    planBacklinks: [
      'v0.6.35` — Pi Extension Compliance & Package Surface Checkpoint',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.6.35-pi-extension-compliance-package-surface.md',
        to: [
          'docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md',
          'docs/perf/v0.6.34-package-release-install-layout-decision-checkpoint.md',
        ],
      },
      {
        from: 'docs/perf/v0.6.35-pi-extension-compliance-package-surface.md',
        to: ['docs/perf/v0.6.35-pi-extension-compliance-package-surface-checkpoint.md'],
      },
    ],
    requiredThemes: [
      'Pi Extension Compliance & Package Surface Checkpoint',
      'docs/tests-only checkpoint completed locally',
      'AgentTeam is first a pi TypeScript extension package',
      'STOP for native/default/release/package availability claims',
      'TypeScript/pi facade',
      'Go helper remains a bounded helper behind the TypeScript adapter',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0635-pi-extension-compliance-contract-docs.cjs',
      'tests/suites/go-kernel-v0635-pi-extension-compliance-checkpoint-docs.cjs',
    ],
    nonCandidateSuites: [
      'tests/suites/go-kernel-v0635-pi-extension-install-load-smoke.cjs',
      'tests/suites/go-kernel-v0635-command-tool-surface-contract.cjs',
      'tests/suites/go-kernel-v0635-package-surface-minimization.cjs',
      'tests/suites/go-kernel-v0635-runtime-mode-boundaries.cjs',
    ],
  },
  {
    id: 'v0636-default-go-dry-run-readiness',
    version: 'v0.6.36',
    checkpointLabel: 'Default Go Dry-Run Readiness & Rollback/Disable Policy Checkpoint',
    checkpointDoc: 'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy-checkpoint.md',
    docs: [
      'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md',
      'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy-checkpoint.md',
    ],
    planBacklinks: [
      'v0.6.36` — Default Go Dry-Run Readiness & Rollback/Disable Policy Checkpoint',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy-checkpoint.md',
        to: ['docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy.md'],
      },
    ],
    requiredThemes: [
      'Default Go Dry-Run Readiness & Rollback/Disable Policy',
      'docs/tests-only governance work',
      'ready:false',
      'STOP for default Go',
      'v0.6.36 does not approve or enable default Go',
      'v0.6.36 does not prove normal-user native helper availability',
      '`package.json` remains version `0.6.8`',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0636-default-go-dry-run-contract-docs.cjs',
      'tests/suites/go-kernel-v0636-final-readiness-checkpoint-docs.cjs',
    ],
    nonCandidateSuites: [
      'tests/suites/go-kernel-v0636-default-go-readiness-dry-run.cjs',
      'tests/suites/go-kernel-v0636-default-go-readiness-ledger.cjs',
      'tests/suites/go-kernel-v0636-install-load-evidence-registry.cjs',
      'tests/suites/go-kernel-v0636-release-tag-debt-governance.cjs',
      'tests/suites/go-kernel-v0636-rollback-disable-policy.cjs',
      'tests/suites/go-kernel-v0636-ts-pi-default-go-authority-boundary.cjs',
    ],
  },
  {
    id: 'v0637-v05-release-readiness-burndown',
    version: 'v0.6.37',
    checkpointLabel: 'v0.5 Release Readiness Burn-down Checkpoint',
    checkpointDoc: 'docs/perf/v0.6.37-v0.5-release-readiness-burndown-checkpoint.md',
    docs: [
      'docs/perf/v0.6.37-v0.5-release-readiness-burndown.md',
      'docs/perf/v0.6.37-v0.5-release-readiness-burndown-checkpoint.md',
    ],
    planBacklinks: [
      'v0.6.37 readiness burn-down map',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.6.37-v0.5-release-readiness-burndown.md',
        to: ['docs/perf/v0.6.36-default-go-dry-run-readiness-rollback-policy-checkpoint.md'],
      },
      {
        from: 'docs/perf/v0.6.37-v0.5-release-readiness-burndown-checkpoint.md',
        to: ['docs/perf/v0.6.37-v0.5-release-readiness-burndown.md'],
      },
    ],
    requiredThemes: [
      'v0.5 Release Readiness Burn-down',
      'docs/tests/fixtures release-readiness burn-down checkpoint',
      'ready:false',
      'STOP for v0.5 release-ready approval',
      'v0.6.37 does not approve v0.5 release readiness',
      '`package.json` remains version `0.6.8`',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0637-v05-final-readiness-checkpoint-docs.cjs',
    ],
    nonCandidateSuites: [
      'tests/suites/go-kernel-v0637-v05-p0-readiness-ledger.cjs',
      'tests/suites/go-kernel-v0637-v05-performance-baseline-inventory.cjs',
      'tests/suites/go-kernel-v0637-v05-p95-release-gates.cjs',
      'tests/suites/go-kernel-v0637-v05-hot-path-burndown-candidates.cjs',
      'tests/suites/go-kernel-v0637-v05-manual-rc-smoke-checklist.cjs',
      'tests/suites/go-kernel-v0637-v05-validation-strategy.cjs',
      'tests/suites/go-kernel-v0637-v05-task-report-planrun-reliability.cjs',
    ],
  },
  {
    id: 'v0638-p95-manual-rc-evidence',
    version: 'v0.6.38',
    checkpointLabel: 'p95 and True Operator Manual RC Evidence',
    checkpointDoc: 'docs/perf/v0.6.38-p95-evidence.md',
    docs: [
      'docs/perf/v0.6.38-temp-home-bound-rc-harness.md',
      'docs/perf/v0.6.38-p95-evidence.md',
      'docs/perf/v0.6.38-true-operator-manual-rc-pass-evidence.md',
    ],
    planBacklinks: [
      'docs/perf/v0.6.38-p95-evidence.md',
      'docs/perf/v0.6.38-true-operator-manual-rc-pass-evidence.md',
    ],
    continuityLinks: [],
    requiredThemes: [
      'evidence-only reconciliation',
      'Temp-Home-Bound RC Harness',
      'True Operator Manual RC Pass Evidence',
      'Final result remains `ready:false`',
      'STOP for release/tag/git push/npm version/npm publish',
      'pass with one optional limitation',
      'optional not-covered item, not a blocker',
    ],
    replacementCandidateSuites: [
      'tests/suites/go-kernel-v0638-manual-rc-evidence.cjs',
    ],
    nonCandidateSuites: [
      'tests/suites/go-kernel-v0638-p95-evidence.cjs',
      'tests/suites/go-kernel-v0638-temp-home-rc-harness.cjs',
    ],
  },
  {
    id: 'v0639-v0640-task-message-report-p95',
    version: 'v0.6.39',
    checkpointLabel: 'Task/Message/Report p95 Evidence',
    checkpointDoc: 'docs/perf/v0.6.39-task-message-report-p95.md',
    docs: [
      'docs/perf/v0.6.39-task-message-report-p95.md',
    ],
    planBacklinks: [
      'docs/perf/v0.6.39-task-message-report-p95.md',
    ],
    continuityLinks: [],
    requiredThemes: [
      'Task/Message/Report p95 Evidence',
      'v0.6.40 optimizes the large-mailbox action path',
      'Final result remains `ready:false`',
      'GO for reviewer inspection of the focused harness',
      'STOP for release/tag/git push/npm version/npm publish',
      'Do not claim v0.7 release readiness from this artifact',
    ],
    replacementCandidateSuites: [],
    nonCandidateSuites: [
      'tests/suites/go-kernel-v0639-task-message-report-p95.cjs',
    ],
  },
  {
    id: 'v0641-fsstore-lock-wait-p95',
    version: 'v0.6.41',
    checkpointLabel: 'fsStore Lock-Wait p95 Evidence',
    checkpointDoc: 'docs/perf/v0.6.41-fsstore-lock-wait-p95.md',
    docs: [
      'docs/perf/v0.6.41-fsstore-lock-wait-p95.md',
    ],
    planBacklinks: [
      'docs/perf/v0.6.41-fsstore-lock-wait-p95.md',
      'T129 true operator PlanRun cancel follow-up 已在任务板验收为 pass',
    ],
    continuityLinks: [],
    requiredThemes: [
      'fsStore Lock-Wait p95 Evidence',
      'focused fsStore lock-wait p95 coverage',
      'Final result remains `ready:false`',
      'minimal retry-granularity optimization',
      'STOP for release/tag/git push/npm version/npm publish',
      'Do not claim v0.7 release readiness from this artifact',
    ],
    replacementCandidateSuites: [],
    nonCandidateSuites: [
      'tests/suites/go-kernel-v0641-fsstore-lock-wait-p95.cjs',
    ],
  },
  {
    id: 'v0642-render-spawn-p95',
    version: 'v0.6.42',
    checkpointLabel: 'Data-Change Render Debounce and Spawn Bookkeeping p95 Evidence',
    checkpointDoc: 'docs/perf/v0.6.42-data-change-render-debounce.md',
    docs: [
      'docs/perf/v0.6.42-data-change-render-debounce.md',
      'docs/perf/v0.6.42-spawn-bookkeeping-p95.md',
    ],
    planBacklinks: [
      'docs/perf/v0.6.42-data-change-render-debounce.md',
      'docs/perf/v0.6.42-spawn-bookkeeping-p95.md',
    ],
    continuityLinks: [],
    requiredThemes: [
      'Data-Change Render Debounce p95 Evidence',
      'Spawn Bookkeeping p95 Evidence',
      'Final result remains `ready:false`',
      'focused mounted `/team` semantic data-change render debounce coverage',
      'focused worker spawn bookkeeping p95 coverage',
      'STOP for release/tag/git push/npm version/npm publish',
    ],
    replacementCandidateSuites: [],
    nonCandidateSuites: [
      'tests/suites/go-kernel-v0642-data-change-render-debounce.cjs',
      'tests/suites/go-kernel-v0642-spawn-bookkeeping-p95.cjs',
    ],
  },
  {
    id: 'v0643-readiness-evidence-reconciliation',
    version: 'v0.6.43',
    checkpointLabel: 'Readiness Evidence Reconciliation',
    checkpointDoc: 'docs/perf/v0.6.43-readiness-evidence-reconciliation.md',
    docs: [
      'docs/perf/v0.6.43-readiness-evidence-reconciliation.md',
    ],
    planBacklinks: [
      'docs/perf/v0.6.43-readiness-evidence-reconciliation.md',
      'v0.6.43 evidence reconciliation',
    ],
    continuityLinks: [
      {
        from: 'docs/perf/v0.6.43-readiness-evidence-reconciliation.md',
        to: [
          'docs/perf/v0.6.38-true-operator-manual-rc-pass-evidence.md',
          'docs/perf/v0.6.39-task-message-report-p95.md',
          'docs/perf/v0.6.41-fsstore-lock-wait-p95.md',
          'docs/perf/v0.6.42-data-change-render-debounce.md',
          'docs/perf/v0.6.42-spawn-bookkeeping-p95.md',
        ],
      },
    ],
    requiredThemes: [
      'Readiness Evidence Reconciliation',
      'Final result remains `ready:false`',
      'current evidence map',
      'Historical docs may still contain old fail/not-covered rows because they are audit records for the earlier checkpoint',
      'v0.6.43 is docs/tests reconciliation only',
      'Use v0.6.43 as the current readiness evidence reconciliation checkpoint only',
    ],
    replacementCandidateSuites: [],
    nonCandidateSuites: [
      'tests/suites/go-kernel-v0643-readiness-evidence-reconciliation.cjs',
    ],
  },
]


const HISTORICAL_CHECKPOINT_FAMILIES = [
  ...HISTORICAL_CHECKPOINT_FAMILIES_V0419_V0427,
  ...HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643,
]

const HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0419_V0427 = HISTORICAL_CHECKPOINT_FAMILIES_V0419_V0427
  .flatMap(family => family.replacementCandidateSuites)

const HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643 = HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643
  .flatMap(family => family.replacementCandidateSuites)

const HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES = HISTORICAL_CHECKPOINT_FAMILIES
  .flatMap(family => family.replacementCandidateSuites)

const HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0628_V0643 = HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643
  .flatMap(family => family.nonCandidateSuites || [])

const HISTORICAL_CHECKPOINT_DOCS_V0419_V0427 = HISTORICAL_CHECKPOINT_FAMILIES_V0419_V0427
  .flatMap(family => family.docs)

const HISTORICAL_CHECKPOINT_DOCS_V0628_V0643 = HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643
  .flatMap(family => family.docs)

const HISTORICAL_CHECKPOINT_DOCS = HISTORICAL_CHECKPOINT_FAMILIES
  .flatMap(family => family.docs)

module.exports = {
  COMMON_NO_RELEASE_OVERCLAIMS,
  CURRENT_ROADMAP_EXPECTATIONS,
  HISTORICAL_CHECKPOINT_FAMILIES,
  HISTORICAL_CHECKPOINT_FAMILIES_V0419_V0427,
  HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643,
  HISTORICAL_CHECKPOINT_DOCS,
  HISTORICAL_CHECKPOINT_DOCS_V0419_V0427,
  HISTORICAL_CHECKPOINT_DOCS_V0628_V0643,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0419_V0427,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643,
  HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0628_V0643,
}
