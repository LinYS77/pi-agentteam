import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import {
  formatTmuxSnapshotParseFailureReadiness,
  listTmuxSnapshotParseFailureDiagnostics,
} from '../core/kernelDiagnostics.js'

export type TeamReadinessCommandResult = {
  handled: boolean
  text?: string
  level?: 'info' | 'warning' | 'error'
}

function parseReadinessArgs(args: string): boolean {
  return args.trim().toLowerCase() === 'readiness'
}

function notify(ctx: ExtensionContext, result: TeamReadinessCommandResult): TeamReadinessCommandResult {
  if (result.text) ctx.ui.notify(result.text, result.level ?? 'info')
  return result
}

export function buildReadinessText(): { text: string; level: 'info' } {
  const diagnostics = listTmuxSnapshotParseFailureDiagnostics()
  const lines = [
    '[agentteam readiness] tmuxSnapshotParse compact diagnostics',
    'Explicit reviewer readiness summary; not normal-user native availability proof.',
    ...diagnostics.map(formatTmuxSnapshotParseFailureReadiness),
  ]
  return { text: lines.join('\n'), level: 'info' }
}

export function handleTeamReadinessCommand(args: string, ctx: ExtensionContext): TeamReadinessCommandResult {
  if (!parseReadinessArgs(args)) return { handled: false }
  return notify(ctx, { handled: true, ...buildReadinessText() })
}
