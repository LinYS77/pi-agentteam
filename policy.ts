import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent'
import { readTeamState } from './state.js'
import { getCurrentMemberName, getCurrentTeamName } from './session.js'
import { TEAM_LEAD } from './types.js'

const AGENTTEAM_POLICY_TRIGGER_RE = /\bagentteam\b|\bagent\s*team\b|\bteammate\b|\bsubagent\b|\/team(?:-(?:sync|delete|cleanup|remove-member))?\b|\bagentteam_(?:create|spawn|send|receive|task)\b|队友|队员|待命|研究员|规划师|实现者|planner|researcher|implementer/i

function shouldAppendLeaderConstraints(prompt: string, ctx: ExtensionContext): boolean {
  const memberName = getCurrentMemberName(ctx)
  if (memberName && memberName !== TEAM_LEAD) return false
  if (memberName === TEAM_LEAD) return true
  return AGENTTEAM_POLICY_TRIGGER_RE.test(prompt)
}

function buildLeaderDelegationPolicy(teamName?: string | null): string {
  const lines = [
    'Leader delegation policy (core):',
    '- Coordinator first, not worker.',
    '- Reuse existing teammates before creating new ones.',
    '- Delegate with task-first flow: create/claim task, then send a short task-id based assignment.',
    '- After delegation, wait for teammate signals; do not poll repeatedly.',
    '- Synthesize teammate results into the final user-facing answer.',
  ]
  if (teamName) {
    const team = readTeamState(teamName)
    if (team) {
      const roster = Object.values(team.members)
        .filter(member => member.name !== TEAM_LEAD)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(member => `${member.name}(${member.role}, ${member.status})`)
        .join(', ')
      lines.push(`Current teammate roster: ${roster || '(none yet)'}`)
    }
  }
  return lines.join('\n')
}

export function registerBeforeAgentStartPolicy(pi: ExtensionAPI): void {
  pi.on('before_agent_start', async (event, ctx) => {
    if (!shouldAppendLeaderConstraints(event.prompt, ctx)) return
    const teamName = getCurrentTeamName(ctx)
    const constraints = [
      'AgentTeam operating rules:',
      buildLeaderDelegationPolicy(teamName),
    ].join('\n')
    return {
      systemPrompt: `${event.systemPrompt}\n\n${constraints}${teamName ? `\nCurrent attached team: ${teamName}` : ''}`,
    }
  })
}
