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


function compactHistoricalVersion(version) {
  return String(version).replace(/\./g, '')
}

function historicalPerfDoc(version, slug) {
  return `docs/perf/${version}-${slug}.md`
}

function historicalGoKernelSuite(version, slug) {
  return `tests/suites/go-kernel-${compactHistoricalVersion(version)}-${slug}.cjs`
}

function historicalGoKernelFamily({ version, slug, title, requiredThemes, continuityTargets = [], suiteSlug = slug }) {
  const doc = historicalPerfDoc(version, slug)
  const continuityLinks = continuityTargets.length > 0 ? [{ from: doc, to: continuityTargets }] : []

  return {
    id: `${compactHistoricalVersion(version)}-${slug}`,
    version,
    checkpointLabel: title.replace(`${version} `, ''),
    checkpointDoc: doc,
    docs: [doc],
    planBacklinks: [doc],
    continuityLinks,
    requiredThemes: [title, ...requiredThemes],
    replacementCandidateSuites: [],
    nonCandidateSuites: [historicalGoKernelSuite(version, suiteSlug)],
  }
}

const HISTORICAL_CHECKPOINT_FAMILIES_V0644_V0688 = [
  historicalGoKernelFamily({
    version: "v0.6.44",
    slug: "go-cutover-candidate-selection",
    title: "v0.6.44 Go Cutover Candidate Selection",
    requiredThemes: [
      "Result: v0.6.44 selects `tmuxSnapshotParse` / tmux snapshot parser as the first bounded candidate for a future Go-owned runtime cutover.",
      "> Scope: v0.6.44 planning/evidence checkpoint for selecting the first future Go-owned runtime cutover candidate. This does not change runtime behavior, enable default Go, enable any default resolver, delete TypeScript fallback, publish/package native artifacts, create tags/releases, or claim v0.7 readiness.",
    ],
  }),
  historicalGoKernelFamily({
    version: "v0.6.45",
    slug: "tmux-snapshot-cutover-gate-prep",
    title: "v0.6.45 tmuxSnapshotParse Cutover Gate Prep",
    requiredThemes: [
      "Result: v0.6.45 prepares the future `tmuxSnapshotParse` module cutover gate with docs, deterministic fixture data, and guard coverage only.",
      "Final result remains `ready:false`. This checkpoint is GO for a later reviewer-owned cutover gate review and STOP for runtime/default/fallback/package/release changes. It is implementation-prep evidence only. No runtime behavior changes are made.",
    ],
    continuityTargets: ["v0.6.44"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.46",
    slug: "default-go-readiness-approval-gate",
    title: "v0.6.46 Default-Go Readiness Approval Gate",
    requiredThemes: [
      "Result: v0.6.46 starts the true default-Go readiness approval gate for `tmuxSnapshotParse` and returns GO for a later non-mutating default-Go dry-run implementation slice.",
      "> Scope: v0.6.46 approval-gate evidence only for the selected `tmuxSnapshotParse` module. This checkpoint evaluates whether a later slice may implement a non-mutating default-Go dry-run path. It does not enable default Go, does not enable a default resolver, does not delete TypeScript fallback, does not change package/release/native behavior, and does not create tags, releases, npm versions, or npm publishes.",
    ],
    continuityTargets: ["v0.6.45"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.47",
    slug: "non-mutating-default-go-dry-run",
    title: "v0.6.47 Non-Mutating Default-Go Dry-Run",
    requiredThemes: [
      "Result: v0.6.47 implements a real non-mutating default-Go dry-run runtime/verifier path for `tmuxSnapshotParse`.",
      "> Scope: real reviewer-only default-Go dry-run runtime/verifier path for the selected `tmuxSnapshotParse` module. This does not enable default Go, does not enable the production default resolver, does not delete the TypeScript fallback, and does not approve package/native/release work.",
    ],
  }),
  historicalGoKernelFamily({
    version: "v0.6.48",
    slug: "default-go-cutover-tmux-snapshot",
    title: "v0.6.48 Default-Go Cutover For tmuxSnapshotParse",
    requiredThemes: [
      "Result: v0.6.48 enables the approved actual default-Go cutover for `tmuxSnapshotParse` only.",
      "This slice changes the runtime default for the bounded parser module after explicit leader/user approval of the main-package embedded helper layout. It does not make AgentTeam a Go control plane, a native package product, or a release-ready artifact.",
    ],
  }),
  historicalGoKernelFamily({
    version: "v0.6.49",
    slug: "go-control-plane-expansion-gate",
    title: "v0.6.49 Go Control-Plane Expansion Gate",
    requiredThemes: [
      "Result: v0.6.49 accepts the user-authorized architecture direction to expand Go beyond the `tmuxSnapshotParse` parser, but only as a staged control-plane migration behind the TypeScript/pi facade.",
      "This slice does not migrate tmux capture, worker lifecycle, state, task/report/PlanRun, UI, or package/release runtime code yet. It creates the guardable architecture gate for those later slices.",
    ],
    continuityTargets: ["v0.6.48"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.50",
    slug: "go-tmux-snapshot-capture-cutover",
    title: "v0.6.50 Go tmuxSnapshotCapture Cutover",
    requiredThemes: [
      "Result: v0.6.50 implements the first post-v0.6.49 control-plane expansion slice: Go now owns the narrow tmux snapshot capture adapter.",
      "This slice does not move these responsibilities into Go:",
    ],
    continuityTargets: ["v0.6.49"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.51",
    slug: "contract-constants-artifact-naming-gate",
    title: "v0.6.51 Contract Constants And Artifact Naming Gate",
    suiteSlug: "contract-artifact-naming-gate",
    requiredThemes: [
      "Result: v0.6.51 adds a non-runtime structural gate for shared kernel/helper/native artifact contract constants.",
      "This slice reduces drift before the next Go-owned runtime slices. It does not change runtime behavior from v0.6.50.",
    ],
    continuityTargets: ["v0.6.50"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.52",
    slug: "worker-lifecycle-contract-gate",
    title: "v0.6.52 Worker Lifecycle Contract Gate",
    requiredThemes: [
      "Result: v0.6.52 defines the future Go worker lifecycle JSON-RPC boundary and helper connection model as a non-runtime gate.",
      "Runtime behavior stays unchanged from v0.6.51. This slice prepares the next migration boundary without moving worker lifecycle primitives into Go.",
    ],
    continuityTargets: ["v0.6.51"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.53",
    slug: "go-inspect-pane-worker-lifecycle",
    title: "v0.6.53 Go inspectPane Worker Lifecycle Slice",
    requiredThemes: [
      "Result: v0.6.53 activates the first narrow worker lifecycle runtime slice: Go-owned read-only `inspectPane` only.",
      "This slice follows the v0.6.52 worker lifecycle contract gate. It does not migrate broad worker lifecycle ownership.",
    ],
    continuityTargets: ["v0.6.52"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.54",
    slug: "go-list-agentteam-panes-worker-lifecycle",
    title: "v0.6.54 Go listAgentTeamPanes Worker Lifecycle Slice",
    requiredThemes: [
      "Result: v0.6.54 activates the next narrow worker lifecycle runtime slice: Go-owned read-only `listAgentTeamPanes` alongside the existing read-only `inspectPane`.",
      "This slice follows v0.6.53. It does not migrate broad worker lifecycle ownership.",
    ],
    continuityTargets: ["v0.6.53"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.55",
    slug: "go-list-agentteam-panes-facade-cutover",
    title: "v0.6.55 Go listAgentTeamPanes Facade Cutover",
    requiredThemes: [
      "Result: v0.6.55 cuts over the TypeScript `listAgentTeamPanes()` facade/default path to the existing Go `workerLifecycle.listAgentTeamPanes` adapter.",
      "- No `wakePane`, `syncPaneLabels`, `createTeammatePane`, `killPane`, `clearPaneLabel`, `targetForPaneId`, `captureCurrentPaneBinding`, or non-inspect `display-message` path is migrated in this slice.",
    ],
    continuityTargets: ["v0.6.54"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.56",
    slug: "go-inspect-pane-facade-cutover",
    title: "v0.6.56 Go inspectPane Facade Cutover",
    requiredThemes: [
      "Result: v0.6.56 cuts over the TypeScript `inspectPane(paneId)` facade/default path to the existing Go `workerLifecycle.inspectPane` adapter.",
      "- State repository, task/report/PlanRun governance, team panel view-model, release/package verification, and package/native ownership remain unmigrated.",
    ],
  }),
  historicalGoKernelFamily({
    version: "v0.6.57",
    slug: "go-pane-exists-facade-cutover",
    title: "v0.6.57 Go paneExists Facade Cutover",
    requiredThemes: [
      "Result: v0.6.57 cuts over the TypeScript `paneExists(paneId)` facade/default path to the already Go-backed `inspectPane(paneId)` facade.",
      "- State repository, task/report/PlanRun governance, team panel view-model, release/package verification, and package/native ownership remain unmigrated.",
    ],
  }),
  historicalGoKernelFamily({
    version: "v0.6.58",
    slug: "go-resolve-pane-binding-facade-cutover",
    title: "v0.6.58 Go resolvePaneBinding Facade Cutover",
    requiredThemes: [
      "Result: v0.6.58 cuts over the TypeScript `resolvePaneBinding(paneId)` facade/default path to the Go-backed `workerLifecycle.inspectPane` adapter after extending that compact inspect result with `target`.",
      "The target field belongs on the universal read-only `inspectPane` operation, not on `listAgentTeamPanes()` lookup behavior. `resolvePaneBinding()` must support arbitrary tmux pane ids, including panes without `@agentteam-name`; `listAgentTeamPanes()` remains intentionally filtered to labeled agentteam panes only.",
    ],
  }),
  historicalGoKernelFamily({
    version: "v0.6.59",
    slug: "go-target-for-pane-facade-cutover",
    title: "v0.6.59 Go targetForPaneId Facade Cutover",
    requiredThemes: [
      "Result: v0.6.59 cuts over the TypeScript `targetForPaneId(paneId)` facade/default path to the existing Go-backed `resolvePaneBinding(paneId)` / `workerLifecycle.inspectPane` path.",
      "- State repository, task/report/PlanRun governance, team panel view-model, release/package verification, and package/native ownership remain unmigrated.",
    ],
  }),
  historicalGoKernelFamily({
    version: "v0.6.60",
    slug: "go-current-pane-binding-facade-cutover",
    title: "v0.6.60 Go captureCurrentPaneBinding Facade Cutover",
    requiredThemes: [
      "Result: v0.6.60 cuts over the TypeScript `captureCurrentPaneBinding()` facade/default path to a narrow Go-backed `workerLifecycle.captureCurrentPaneBinding` operation.",
      "- State repository, task/report/PlanRun governance, team panel view-model, release/package verification, and package/native ownership remain unmigrated.",
    ],
  }),
  historicalGoKernelFamily({
    version: "v0.6.61",
    slug: "go-async-pane-binding-facade-cutover",
    title: "v0.6.61 Go resolvePaneBindingAsync Facade Cutover",
    requiredThemes: [
      "Result: v0.6.61 cuts over the TypeScript `resolvePaneBindingAsync(paneId, signal)` facade/default path to the existing Go-backed `workerLifecycle.inspectPane` operation through a cancellable async kernel adapter seam.",
      "This slice closes the deferred async binding gap from v0.6.59/v0.6.60 without wrapping the synchronous `resolvePaneBinding()` facade:",
    ],
    continuityTargets: ["v0.6.60"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.62",
    slug: "go-window-pane-lookup-facade-cutover",
    title: "v0.6.62 Go Window Pane Lookup Facade Cutover",
    requiredThemes: [
      "Result: v0.6.62 cuts over the TypeScript `windowExists(target, signal)` and `firstPaneInWindow(target, signal)` facades to a narrow Go-backed `workerLifecycle.listPanesInWindow` operation through the cancellable async kernel adapter seam.",
      "This slice closes the remaining read-only async window helper gap in `tmux/core.ts` without migrating any window creation, labels, or mutating lifecycle code:",
    ],
    continuityTargets: ["v0.6.61"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.63",
    slug: "go-tmux-availability-facade-cutover",
    title: "v0.6.63 Go Tmux Availability Facade Cutover",
    requiredThemes: [
      "Result: v0.6.63 cuts over `tmux/core.ts` `ensureTmuxAvailable(signal)` from direct TypeScript `tmux -V` execution to a narrow Go-backed `tmuxAvailability` operation through the cancellable async kernel adapter seam.",
      "This slice closes the simple tmux availability/version probe gap in `tmux/core.ts` without migrating window creation, labels, mutating lifecycle, state/task/UI, or package/release behavior:",
    ],
    continuityTargets: ["v0.6.62"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.64",
    slug: "go-pane-app-start-wait-cutover",
    title: "v0.6.64 Go Pane App-Start Wait Cutover",
    requiredThemes: [
      "Result: v0.6.64 cuts over `tmux/process.ts` `waitForPaneAppStart(paneId, timeoutMs, signal)` from direct TypeScript target-based `display-message` polling to the existing Go-backed `workerLifecycle.inspectPane` async adapter path.",
      "This slice removes the last direct pane-current-command polling call from `tmux/process.ts` without changing worker spawn semantics or adding Go/native surface:",
    ],
  }),
  historicalGoKernelFamily({
    version: "v0.6.65",
    slug: "go-agentteam-window-discovery-cutover",
    title: "v0.6.65 Go AgentTeam Window Discovery Cutover",
    requiredThemes: [
      "Result: v0.6.65 cuts over `tmux/windows.ts` internal `findAgentTeamWindowTarget(sessionName, signal)` from direct TypeScript `list-windows` parsing to a narrow Go-backed `workerLifecycle.findAgentTeamWindowTarget` operation through the cancellable async kernel adapter seam.",
      "This slice removes only the read-only marked-window discovery call. It does not move session/window creation, marking, labels, pane setup, or any mutating lifecycle behavior into Go:",
    ],
    continuityTargets: ["v0.6.64"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.66",
    slug: "go-session-existence-cutover",
    title: "v0.6.66 Go Session Existence Cutover",
    requiredThemes: [
      "Result: v0.6.66 cuts over the `tmux/windows.ts` `ensureSwarmWindow()` session existence check from direct TypeScript `has-session` probing to a narrow Go-backed `workerLifecycle.sessionExists` operation through the cancellable async kernel adapter seam.",
      "This slice removes only the read-only session-existence check. It does not move session/window creation, post-creation lookup, pane setup, marking, labels, or mutating lifecycle behavior into Go:",
    ],
    continuityTargets: ["v0.6.65"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.67",
    slug: "go-current-binding-window-fallback-cutover",
    title: "v0.6.67 Go Current Binding Window Fallback Cutover",
    requiredThemes: [
      "Result: v0.6.67 cuts over the `tmux/windows.ts` `ensureSwarmWindow()` inside-tmux current target/current pane fallbacks from direct TypeScript `display-message` calls to the existing Go-backed `captureCurrentPaneBinding()` seam.",
      "This slice removes only the same-purpose current-pane/current-window fallback calls from the inside-tmux branch. It does not move detached setup, window/session creation, pane setup, labels, mutating lifecycle, state, task/report/PlanRun, UI, or release/package behavior into Go:",
    ],
    continuityTargets: ["v0.6.66"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.68",
    slug: "go-detached-leader-binding-cutover",
    title: "v0.6.68 Go Detached Leader Binding Cutover",
    requiredThemes: [
      "Result: v0.6.68 cuts over the `tmux/windows.ts` detached `ensureSwarmWindow()` leader target fallback from direct TypeScript target-based `display-message` to the existing Go-backed `resolvePaneBindingAsync(leaderPaneId, signal)` path.",
      "This slice removes only the final target-based leader-pane window id fallback after pane setup. The direct pane setup `list-panes` step is superseded by v0.6.69; post-creation window lookup, session/window creation, labels, mutating lifecycle, state, task/report/PlanRun, UI, and release/package behavior remain out of scope:",
    ],
    continuityTargets: ["v0.6.67"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.69",
    slug: "go-detached-first-pane-cutover",
    title: "v0.6.69 Go Detached First Pane Cutover",
    requiredThemes: [
      "Result: v0.6.69 cuts over the `tmux/windows.ts` detached `ensureSwarmWindow()` leader pane selection from direct TypeScript `list-panes` parsing to existing Go-backed `firstPaneInWindow(initialTarget, signal)`.",
      "This slice removes only the detached first-pane selection fallback after `initialTarget` is known. It does not move post-creation window lookup, session/window creation, labels, mutating lifecycle, state, task/report/PlanRun, UI, or release/package behavior into Go:",
    ],
    continuityTargets: ["v0.6.68"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.70",
    slug: "go-window-name-lookup-cutover",
    title: "v0.6.70 Go Window Name Lookup Cutover",
    requiredThemes: [
      "Result: v0.6.70 cuts over the `tmux/windows.ts` detached `ensureSwarmWindow()` post-creation window name lookup from direct TypeScript `list-windows` parsing to a narrow Go-backed `workerLifecycle.findWindowTargetByName` operation.",
      "- `new-session`, `new-window`, marking, labels, kill, state/task/UI/release/package remain TypeScript-owned.",
    ],
    continuityTargets: ["v0.6.69"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.71",
    slug: "go-mutating-window-marking-gate",
    title: "v0.6.71 Go Mutating Window Marking Gate",
    requiredThemes: [
      "Result: v0.6.71 defines the first explicit mutating tmux Go cutover gate without implementing runtime mutation.",
      "Result: v0.6.71 defines the first explicit mutating tmux Go cutover gate without implementing runtime mutation.",
    ],
    continuityTargets: ["v0.6.70"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.72",
    slug: "go-window-marking-cutover",
    title: "v0.6.72 Go Window Marking Cutover",
    requiredThemes: [
      "Result: v0.6.72 cuts over `tmux/labels.ts markWindowAsAgentTeam(target, signal)` from direct TypeScript window `set-option` calls to the Go-backed `workerLifecycle.markWindowAsAgentTeam` operation.",
      "No other Go mutating tmux commands are introduced by this slice.",
    ],
    continuityTargets: ["v0.6.71"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.73",
    slug: "go-refresh-window-pane-labels-gate",
    title: "v0.6.73 Go Refresh Window Pane Labels Gate",
    requiredThemes: [
      "Result: v0.6.73 defines the second explicit mutating tmux Go cutover gate without implementing runtime mutation.",
      "Result: v0.6.73 defines the second explicit mutating tmux Go cutover gate without implementing runtime mutation.",
    ],
    continuityTargets: ["v0.6.72"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.74",
    slug: "go-refresh-window-pane-labels-cutover",
    title: "v0.6.74 Go Refresh Window Pane Labels Cutover",
    requiredThemes: [
      "Result: v0.6.74 cuts over `tmux/labels.ts refreshWindowPaneLabels(target, signal)` from direct TypeScript pane-border window `set-option` calls to the Go-backed `workerLifecycle.refreshWindowPaneLabels` operation.",
      "No other Go mutating tmux commands are introduced by this slice.",
    ],
    continuityTargets: ["v0.6.73"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.75",
    slug: "go-pane-label-setting-gate",
    title: "v0.6.75 Go Pane Label Setting Gate",
    requiredThemes: [
      "Result: v0.6.75 defines the next narrow mutating tmux Go cutover gate without implementing runtime mutation.",
      "Result: v0.6.75 defines the next narrow mutating tmux Go cutover gate without implementing runtime mutation.",
    ],
    continuityTargets: ["v0.6.74"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.76",
    slug: "go-pane-label-setting-cutover",
    title: "v0.6.76 Go Pane Label Setting Cutover",
    requiredThemes: [
      "Result: v0.6.76 cuts over private `tmux/labels.ts setPaneLabel(paneId, label, signal)` from direct TypeScript pane label/title tmux calls to Go-backed `workerLifecycle.setPaneLabel`.",
      "No other Go mutating tmux commands are introduced by this slice.",
    ],
    continuityTargets: ["v0.6.75"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.77",
    slug: "go-pane-label-clearing-gate",
    title: "v0.6.77 Go Pane Label Clearing Gate",
    requiredThemes: [
      "Result: v0.6.77 defines the next narrow mutating tmux Go cutover gate without implementing runtime mutation.",
      "Result: v0.6.77 defines the next narrow mutating tmux Go cutover gate without implementing runtime mutation.",
    ],
    continuityTargets: ["v0.6.76"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.78",
    slug: "go-pane-label-clearing-cutover",
    title: "v0.6.78 Go Pane Label Clearing Cutover",
    requiredThemes: [
      "Result: v0.6.78 cuts over private `tmux/labels.ts clearPaneLabel(paneId, signal)` from direct TypeScript pane label/title clearing tmux calls to Go-backed `workerLifecycle.clearPaneLabel`.",
      "No other Go mutating tmux commands are introduced by this slice.",
    ],
    continuityTargets: ["v0.6.77"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.79",
    slug: "go-create-teammate-pane-gate",
    title: "v0.6.79 Go Create Teammate Pane Gate",
    requiredThemes: [
      "Result: v0.6.79 defines the high-risk `tmux/panes.ts createTeammatePane(...)` Go cutover gate without implementing runtime mutation.",
      "Result: v0.6.79 defines the high-risk `tmux/panes.ts createTeammatePane(...)` Go cutover gate without implementing runtime mutation.",
    ],
    continuityTargets: ["v0.6.78"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.80",
    slug: "go-create-teammate-pane-cutover",
    title: "v0.6.80 Go Create Teammate Pane Cutover",
    requiredThemes: [
      "Result: v0.6.80 cuts over only `tmux/panes.ts createTeammatePane(...)` pane discovery/creation/layout/resize behavior to Go-backed `workerLifecycle.createTeammatePane` behind the TypeScript facade.",
      "On compact helper failure, the TypeScript facade throws a compact `Error` from the validated helper failure reason, preserving the prior throwing create/layout failure shape without exposing raw tmux/helper output.",
    ],
    continuityTargets: ["v0.6.79"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.81",
    slug: "go-detached-new-session-gate",
    title: "v0.6.81 Go Detached New-Session Gate",
    requiredThemes: [
      "Result: v0.6.81 defines the detached-branch `tmux/windows.ts ensureSwarmWindow(...)` `new-session` Go cutover gate without implementing runtime mutation.",
      "Result: v0.6.81 defines the detached-branch `tmux/windows.ts ensureSwarmWindow(...)` `new-session` Go cutover gate without implementing runtime mutation.",
    ],
    continuityTargets: ["v0.6.80"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.82",
    slug: "go-detached-new-session-cutover",
    title: "v0.6.82 Go Detached New-Session Cutover",
    requiredThemes: [
      "Result: v0.6.82 cuts over only the detached missing-session `tmux/windows.ts ensureSwarmWindow(...)` `new-session` command to Go-backed `workerLifecycle.createDetachedSwarmSession` behind the TypeScript facade.",
      "On compact helper failure, the TypeScript facade throws a compact `Error` from the validated helper failure reason, preserving the prior throwing create failure behavior without exposing raw tmux/helper output.",
    ],
    continuityTargets: ["v0.6.81"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.83",
    slug: "go-detached-new-window-gate",
    title: "v0.6.83 Go Detached New-Window Gate",
    requiredThemes: [
      "Result: v0.6.83 defines the detached-branch `tmux/windows.ts ensureSwarmWindow(...)` `new-window` Go cutover gate without implementing runtime mutation.",
      "Result: v0.6.83 defines the detached-branch `tmux/windows.ts ensureSwarmWindow(...)` `new-window` Go cutover gate without implementing runtime mutation.",
    ],
    continuityTargets: ["v0.6.82"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.84",
    slug: "go-detached-new-window-cutover",
    title: "v0.6.84 Go Detached New-Window Cutover",
    requiredThemes: [
      "Result: v0.6.84 cuts over only the detached missing-agentteam-window `tmux/windows.ts ensureSwarmWindow(...)` `new-window` command to Go-backed `workerLifecycle.createDetachedSwarmWindow` behind the TypeScript facade.",
      "On compact helper failure, the TypeScript facade throws a compact `Error` from the validated helper failure reason, preserving the prior throwing create failure behavior without exposing raw tmux/helper output.",
    ],
    continuityTargets: ["v0.6.83"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.85",
    slug: "go-kill-pane-gate",
    title: "v0.6.85 Go Kill-Pane Gate",
    requiredThemes: [
      "Result: v0.6.85 defines the destructive `tmux/panes.ts killPane(paneId)` Go cutover gate without implementing runtime mutation.",
      "Result: v0.6.85 defines the destructive `tmux/panes.ts killPane(paneId)` Go cutover gate without implementing runtime mutation.",
    ],
    continuityTargets: ["v0.6.84"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.86",
    slug: "go-kill-pane-cutover",
    title: "v0.6.86 Go Kill-Pane Cutover",
    requiredThemes: [
      "Result: v0.6.86 cuts over only `tmux/panes.ts killPane(paneId)` from the direct TypeScript `runTmuxNoThrow(['kill-pane', '-t', paneId])` behavior to a Go-backed `workerLifecycle.killPane` operation behind the TypeScript facade.",
      "- State repository, task/report/PlanRun/mailbox governance, team panel/UI, release/package controls, normal-user native delivery, or package publishing.",
    ],
  }),
  historicalGoKernelFamily({
    version: "v0.6.87",
    slug: "go-clear-pane-label-sync-gate",
    title: "v0.6.87 Go clearPaneLabelSync Gate",
    requiredThemes: [
      "Result: v0.6.87 defines the gate-only contract for future `tmux/panes.ts clearPaneLabelSync(paneId)` Go reuse without changing runtime behavior.",
      "Result: v0.6.87 defines the gate-only contract for future `tmux/panes.ts clearPaneLabelSync(paneId)` Go reuse without changing runtime behavior.",
    ],
    continuityTargets: ["v0.6.86"],
  }),
  historicalGoKernelFamily({
    version: "v0.6.88",
    slug: "go-clear-pane-label-sync-cutover",
    title: "v0.6.88 Go clearPaneLabelSync Cutover",
    requiredThemes: [
      "Result: v0.6.88 cuts over only `tmux/panes.ts clearPaneLabelSync(paneId)` from direct TypeScript tmux calls to the existing Go-backed `workerLifecycle.clearPaneLabel` operation.",
      "No new Go operation, sync-specific Go handler, native helper rebuild, or new native smoke key is introduced.",
    ],
    continuityTargets: ["v0.6.87"],
  }),
]


const HISTORICAL_CHECKPOINT_FAMILIES = [
  ...HISTORICAL_CHECKPOINT_FAMILIES_V0419_V0427,
  ...HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643,
  ...HISTORICAL_CHECKPOINT_FAMILIES_V0644_V0688,
]

const HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0419_V0427 = HISTORICAL_CHECKPOINT_FAMILIES_V0419_V0427
  .flatMap(family => family.replacementCandidateSuites)

const HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643 = HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643
  .flatMap(family => family.replacementCandidateSuites)

const HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688 = HISTORICAL_CHECKPOINT_FAMILIES_V0644_V0688
  .flatMap(family => family.replacementCandidateSuites)

const HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES = HISTORICAL_CHECKPOINT_FAMILIES
  .flatMap(family => family.replacementCandidateSuites)

const HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0628_V0643 = HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643
  .flatMap(family => family.nonCandidateSuites || [])

const HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0644_V0688 = HISTORICAL_CHECKPOINT_FAMILIES_V0644_V0688
  .flatMap(family => family.nonCandidateSuites || [])

const HISTORICAL_CHECKPOINT_DOCS_V0419_V0427 = HISTORICAL_CHECKPOINT_FAMILIES_V0419_V0427
  .flatMap(family => family.docs)

const HISTORICAL_CHECKPOINT_DOCS_V0628_V0643 = HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643
  .flatMap(family => family.docs)

const HISTORICAL_CHECKPOINT_DOCS_V0644_V0688 = HISTORICAL_CHECKPOINT_FAMILIES_V0644_V0688
  .flatMap(family => family.docs)

const HISTORICAL_CHECKPOINT_DOCS = HISTORICAL_CHECKPOINT_FAMILIES
  .flatMap(family => family.docs)

module.exports = {
  COMMON_NO_RELEASE_OVERCLAIMS,
  CURRENT_ROADMAP_EXPECTATIONS,
  HISTORICAL_CHECKPOINT_FAMILIES,
  HISTORICAL_CHECKPOINT_FAMILIES_V0419_V0427,
  HISTORICAL_CHECKPOINT_FAMILIES_V0628_V0643,
  HISTORICAL_CHECKPOINT_FAMILIES_V0644_V0688,
  HISTORICAL_CHECKPOINT_DOCS,
  HISTORICAL_CHECKPOINT_DOCS_V0419_V0427,
  HISTORICAL_CHECKPOINT_DOCS_V0628_V0643,
  HISTORICAL_CHECKPOINT_DOCS_V0644_V0688,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0419_V0427,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0628_V0643,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES_V0644_V0688,
  HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0628_V0643,
  HISTORICAL_CHECKPOINT_NON_CANDIDATE_SUITES_V0644_V0688,
}
