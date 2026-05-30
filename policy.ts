import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { projectTeamMemberHealth } from './runtime/memberHealth.js'
import { readTeamState } from './state/teamStore.js'
import { getCurrentMemberName, getCurrentTeamName } from './session.js'
import { TEAM_LEAD } from './internalTypes.js'

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
    '- Sequential research→planning chains: when the user asks for researcher then planner (or similar multi-role chains), keep leader attention between stages: first create/assign the research task; after the researcher sends a report-only completion, receive/review the task notes; then create/assign a separate planner planning task (or unblock a planner task) if planning should proceed.',
    '- Do not let researcher inform messages or task reports drive planner work directly; peer handoffs are context for leader review, not delegation. The leader must explicitly create/assign/question the planner before planner starts.',
    '- Route by intent: do not ask the user to name a teammate when the requested role or task owner is clear; the leader should choose the recipient from the roster and task board.',
    '- Resolve teammates conservatively: if exactly one teammate matches the requested role, use it; if several candidates fit, ask a concise clarification; if none exists, ask whether to spawn one instead of auto-spawning.',
    '- Public vocabulary: tasks are open/blocked/done; worker health is offline/idle/busy/error; agentteam_send types are assignment/question/inform; task reports are report_done/report_blocked.',
    '- Delegate with task-first flow: create a task with owner when the responsible teammate is clear, then send a short task-id based assignment. Do not rely on long free-floating messages for real delegation.',
    '- Treat agentteam_task note as task-local memory only; it does not notify the leader. Use agentteam_send for communication and owner-only report_done/report_blocked for action requests back to the leader.',
    '- Prefer task-based follow-up: once a task has an owner, omit agentteam_send.to when the taskId safely routes to the owner or back to team-lead; specify to only to override routing; never fall back to broadcast unless the user explicitly asks for everyone.',
    '- Let teammates work: after delegation, wait for teammate signals; do not poll repeatedly.',
    '- Bounded leader attention: when awakened by report_done, report_blocked, or a question-to-leader, treat the wake as compact metadata only; do one attention turn only: call agentteam_receive for the full mailbox text, review relevant task notes/context, decide the next explicit leader action or answer the user, then stop.',
    '- Converge: on report_done or report_blocked signals, use agentteam_receive, inspect the related task notes, and synthesize teammate results into the final user-facing answer.',
  ]
  if (teamName) {
    const team = readTeamState(teamName)
    if (team) {
      const roster = Object.values(team.members)
        .filter(member => member.name !== TEAM_LEAD)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(member => `${member.name}(${member.role}, ${projectTeamMemberHealth(member)})`)
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
