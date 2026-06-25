import {
  AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS,
  AGENTTEAM_KERNEL_CUTOVER_MODULE,
  type AgentTeamKernelCutoverFailureKind,
} from './kernel.js'

export type AgentTeamKernelCompactDiagnosticStatus = 'unknown'
export type AgentTeamKernelCompactDiagnosticResultMarker = 'stale'

export type AgentTeamKernelCompactFailureDiagnostic = {
  module: typeof AGENTTEAM_KERNEL_CUTOVER_MODULE
  capability: typeof AGENTTEAM_KERNEL_CUTOVER_MODULE
  status: AgentTeamKernelCompactDiagnosticStatus
  resultMarker: AgentTeamKernelCompactDiagnosticResultMarker
  failureKind: AgentTeamKernelCutoverFailureKind
  remediation: string
  platformHint?: string
  freshnessHint?: string
  releaseDecision: 'docs/perf/v0.4.23-compact-native-failure-diagnostics.md'
}

export type AgentTeamKernelCompactDiagnosticReadinessSummary = {
  module: typeof AGENTTEAM_KERNEL_CUTOVER_MODULE
  capability: typeof AGENTTEAM_KERNEL_CUTOVER_MODULE
  status: AgentTeamKernelCompactDiagnosticStatus
  resultMarker: AgentTeamKernelCompactDiagnosticResultMarker
  failureKind: AgentTeamKernelCutoverFailureKind
  summary: string
  remediation: string
  hint?: string
  releaseDecision: 'docs/perf/v0.4.23-compact-native-failure-diagnostics.md'
}

type DiagnosticMapping = Omit<AgentTeamKernelCompactFailureDiagnostic, 'module' | 'capability' | 'status' | 'resultMarker' | 'failureKind' | 'releaseDecision'>

const RELEASE_DECISION_DOC = 'docs/perf/v0.4.23-compact-native-failure-diagnostics.md' as const

const DIAGNOSTIC_MAPPINGS: Record<AgentTeamKernelCutoverFailureKind, DiagnosticMapping> = {
  'missing-helper': {
    remediation: 'Use TypeScript mode, reinstall the extension, or disable packaged preview until a supported helper is available.',
    platformHint: 'Helper unavailable for the current explicit cutover or packaged preview request.',
  },
  'disabled-helper': {
    remediation: 'Use TypeScript mode or re-enable the helper only after the explicit cutover prerequisites pass.',
    freshnessHint: 'Helper was disabled before parser ownership could be confirmed.',
  },
  'helper-unsupported-protocol': {
    remediation: 'Update the helper and extension together, or roll back to a matching version.',
    freshnessHint: 'Helper protocol is not compatible with this extension build.',
  },
  'helper-unsupported-version': {
    remediation: 'Update the helper and extension together, or roll back to a matching version.',
    freshnessHint: 'Helper version is stale or newer than the extension contract.',
  },
  'helper-unsupported-capability': {
    remediation: 'Use TypeScript mode until a helper advertising tmuxSnapshotParse is available.',
    freshnessHint: 'Helper does not advertise the required parser capability.',
  },
  'helper-timeout': {
    remediation: 'Retry in TypeScript mode or roll back if the helper repeatedly times out.',
    freshnessHint: 'Helper did not answer within the parser timeout.',
  },
  'helper-spawn-error': {
    remediation: 'Use TypeScript mode and reinstall or roll back before retrying helper preview.',
    platformHint: 'Helper could not be started on this platform or installation.',
  },
  'helper-crash': {
    remediation: 'Use TypeScript mode and roll back or reinstall before retrying helper preview.',
    freshnessHint: 'Helper exited before returning a valid parser response.',
  },
  'helper-nonzero-exit': {
    remediation: 'Use TypeScript mode and roll back or reinstall before retrying helper preview.',
    freshnessHint: 'Helper returned a failed process result.',
  },
  'helper-empty-response': {
    remediation: 'Use TypeScript mode and retry only after helper health is proven.',
    freshnessHint: 'Helper returned no parser payload.',
  },
  'helper-malformed-json': {
    remediation: 'Use TypeScript mode and update or roll back to a helper with a valid protocol response.',
    freshnessHint: 'Helper response was not valid JSON-RPC payload data.',
  },
  'helper-jsonrpc-error': {
    remediation: 'Use TypeScript mode and retry only after helper health and capability checks pass.',
    freshnessHint: 'Helper reported a compact protocol error for the parser request.',
  },
  'helper-incompatible-response': {
    remediation: 'Use TypeScript mode and update or roll back to a compatible helper.',
    freshnessHint: 'Helper response shape did not match the parser contract.',
  },
  'helper-unsafe-response-shape': {
    remediation: 'Use TypeScript mode and update or roll back before trusting helper parser output.',
    freshnessHint: 'Helper parser output was rejected by safety checks.',
  },
  'previous-helper-failure': {
    remediation: 'Use TypeScript mode or restart after resolving the earlier helper failure.',
    freshnessHint: 'Helper stayed disabled after a previous fail-closed parser error.',
  },
  'tmux-command-timeout': {
    remediation: 'Retry after tmux responds, or use rollback/default-disable mode before relying on snapshot capture.',
    freshnessHint: 'Go tmux snapshot capture timed out before returning pane data.',
  },
  'tmux-command-failed': {
    remediation: 'Verify tmux availability/session state, or use rollback/default-disable mode before relying on snapshot capture.',
    platformHint: 'The tmux list-panes snapshot command failed without exposing raw stdout or stderr.',
  },
  'tmux-unavailable': {
    remediation: 'Install tmux or run inside a tmux-capable environment before relying on Go snapshot capture.',
    platformHint: 'The tmux executable was unavailable to the embedded Go helper.',
  },
}

export function createTmuxSnapshotParseFailureDiagnostic(
  failureKind: AgentTeamKernelCutoverFailureKind,
): AgentTeamKernelCompactFailureDiagnostic {
  const mapping = DIAGNOSTIC_MAPPINGS[failureKind]
  return {
    module: AGENTTEAM_KERNEL_CUTOVER_MODULE,
    capability: AGENTTEAM_KERNEL_CUTOVER_MODULE,
    status: 'unknown',
    resultMarker: 'stale',
    failureKind,
    remediation: mapping.remediation,
    ...(mapping.platformHint ? { platformHint: mapping.platformHint } : {}),
    ...(mapping.freshnessHint ? { freshnessHint: mapping.freshnessHint } : {}),
    releaseDecision: RELEASE_DECISION_DOC,
  }
}

export function listTmuxSnapshotParseFailureDiagnostics(): AgentTeamKernelCompactFailureDiagnostic[] {
  return AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS.map(failureKind => createTmuxSnapshotParseFailureDiagnostic(failureKind))
}

export function summarizeTmuxSnapshotParseFailureDiagnostic(
  diagnostic: AgentTeamKernelCompactFailureDiagnostic,
): AgentTeamKernelCompactDiagnosticReadinessSummary {
  const hint = diagnostic.platformHint ?? diagnostic.freshnessHint
  return {
    module: diagnostic.module,
    capability: diagnostic.capability,
    status: diagnostic.status,
    resultMarker: diagnostic.resultMarker,
    failureKind: diagnostic.failureKind,
    summary: `${diagnostic.module} ${diagnostic.status}/${diagnostic.resultMarker}: ${diagnostic.failureKind}`,
    remediation: diagnostic.remediation,
    ...(hint ? { hint } : {}),
    releaseDecision: diagnostic.releaseDecision,
  }
}

export function formatTmuxSnapshotParseFailureReadiness(
  diagnostic: AgentTeamKernelCompactFailureDiagnostic,
): string {
  const summary = summarizeTmuxSnapshotParseFailureDiagnostic(diagnostic)
  const hint = summary.hint ? ` hint=${summary.hint}` : ''
  return `module=${summary.module} capability=${summary.capability} status=${summary.status} resultMarker=${summary.resultMarker} failureKind=${summary.failureKind} remediation=${summary.remediation}${hint} releaseDecision=${summary.releaseDecision}`
}
