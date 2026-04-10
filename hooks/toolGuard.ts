import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { getCurrentMemberName, getCurrentTeamName } from '../session.js'
import { readTeamState } from '../state.js'
import { TEAM_LEAD } from '../types.js'

const READ_ONLY_TOOLS = new Set([
  'read',
  'grep',
  'find',
  'ls',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
])

const FULL_TOOLS = new Set([
  ...READ_ONLY_TOOLS,
  'bash',
  'edit',
  'write',
])

function allowedToolsForRole(role: string): Set<string> {
  if (role === 'implementer') {
    return FULL_TOOLS
  }
  return READ_ONLY_TOOLS
}

export function registerToolGuardHooks(pi: ExtensionAPI): void {
  pi.on('tool_call', async (event, ctx) => {
    const teamName = getCurrentTeamName(ctx)
    const memberName = getCurrentMemberName(ctx)
    if (!teamName || !memberName || memberName === TEAM_LEAD) return

    const team = readTeamState(teamName)
    const member = team?.members?.[memberName]
    const role = (member?.role ?? '').trim().toLowerCase()

    const allowed = allowedToolsForRole(role)
    if (!allowed.has(event.toolName)) {
      return {
        block: true,
        reason: `Role ${role || 'worker'} is not allowed to use tool ${event.toolName}.`,
      }
    }

    return
  })
}
