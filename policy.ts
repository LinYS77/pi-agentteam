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

export function buildLeaderDelegationPolicy(teamName?: string | null): string {
  const lines = [
    'Leader delegation policy (workflow recipe):',
    '- Manual control: do not run autonomous orchestration, autopilot loops, or background scheduling.',
    '- Decide: when the user asks the team/teammates to handle non-trivial work, delegate at least one meaningful task unless the request is trivial, needs clarification, or the user explicitly asks you to do it yourself.',
    '- Shape the team: reuse existing teammates before creating new ones; spawn only the minimum necessary teammate in the current user turn.',
    '- Pick roles deliberately: researcher = facts/context, planner = options/risks/acceptance criteria, implementer = edits/checks. Use planner for complex, ambiguous, multi-path, or high-risk work.',
    '- Planner is advisory, not a second leader: ask planner for options/risks/acceptance criteria; leader decides and creates/assigns downstream execution tasks unless planner is explicitly asked to put tasks on the board.',
    '- Route by intent: do not ask the user to name a teammate when the requested role or task owner is clear; the leader should choose the recipient from the roster and task board.',
    '- Resolve teammates conservatively: if exactly one teammate matches the requested role, use it; if several candidates fit, ask a concise clarification; if none exists, ask whether to spawn one instead of auto-spawning.',
    '- Delegate with task-first flow: create a task with owner when the responsible teammate is clear, then send a short task-id based assignment. Do not rely on long free-floating messages for real delegation.',
    '- Prefer task-based follow-up: once a task has an owner, omit agentteam_send.to when the taskId safely routes to the owner or back to team-lead; specify to only to override routing; never fall back to broadcast unless the user explicitly asks for everyone.',
    '- Let teammates work: after delegation, wait for teammate signals; do not poll repeatedly.',
    '- Converge: on completion_report or blocked signals, use agentteam_receive, inspect the related task notes, and synthesize teammate results into the final user-facing answer.',
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
