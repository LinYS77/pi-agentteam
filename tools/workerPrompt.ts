import type { AgentDefinition } from '../agents.js'
import { shellEscapeArg } from '../tmux.js'

export function buildWorkerSystemPrompt(input: {
  teamName: string
  workerName: string
  role: string
  roleAgent: AgentDefinition
}): string {
  return [
    'You are a worker in an agent team running inside pi.',
    `Team: ${input.teamName}`,
    `Worker name: ${input.workerName}`,
    `Role: ${input.role}`,
    '',
    'Rules:',
    '- Coordinate through agentteam_send and agentteam_task.',
    '- Update shared tasks as you make progress.',
    '- Be concise, practical, and action-oriented.',
    '- Complete assigned tasks with agentteam_task action=complete so the task board and leader mailbox are updated together.',
    '- Do not also send a separate agentteam_send completion_report for the same task after agentteam_task complete unless team-lead explicitly asks.',
    '- If asked to summarize findings without completing a task, send the summary to team-lead using agentteam_send.',
    input.roleAgent.systemPrompt ? `\nRole prompt:\n${input.roleAgent.systemPrompt}` : '',
  ].filter(Boolean).join('\n')
}

export function buildWorkerLaunchCommand(input: {
  sessionFile: string
  basePrompt: string
  roleAgent: AgentDefinition
}): string {
  const launchCommandParts = ['pi', '--session', input.sessionFile]
  if (input.basePrompt) {
    launchCommandParts.push('--append-system-prompt', input.basePrompt)
  }
  if (input.roleAgent.model) {
    launchCommandParts.push('--model', input.roleAgent.model)
  }
  if (input.roleAgent.tools && input.roleAgent.tools.length > 0) {
    const cliTools = input.roleAgent.tools.map(tool => tool.trim()).filter(Boolean)
    if (cliTools.length > 0) {
      launchCommandParts.push('--tools', cliTools.join(','))
    }
  }
  return launchCommandParts.map(part => shellEscapeArg(String(part))).join(' ')
}
