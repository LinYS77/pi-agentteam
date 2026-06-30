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

const HISTORICAL_CHECKPOINT_FAMILIES = [
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

const HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES = HISTORICAL_CHECKPOINT_FAMILIES
  .flatMap(family => family.replacementCandidateSuites)

const HISTORICAL_CHECKPOINT_DOCS = HISTORICAL_CHECKPOINT_FAMILIES
  .flatMap(family => family.docs)

module.exports = {
  COMMON_NO_RELEASE_OVERCLAIMS,
  CURRENT_ROADMAP_EXPECTATIONS,
  HISTORICAL_CHECKPOINT_FAMILIES,
  HISTORICAL_CHECKPOINT_DOCS,
  HISTORICAL_CHECKPOINT_REPLACEMENT_SUITE_CANDIDATES,
}
