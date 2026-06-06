import { TEAM_LEAD } from './internalTypes.js'
import type { MailboxMessage, TeamState } from './internalTypes.js'
import { isTaskActionableForWorkerDelivery } from './app/taskActionability.js'
import { oneLine } from './utils.js'

export type WorkerTurnPromptOptions = {
  explicitInstruction?: string
  unreadMessages?: MailboxMessage[]
  allowAssignedTaskTrigger?: boolean
  includeAssignedTasks?: boolean
}

function sortTasksById(tasks: TeamState['tasks'][string][]): TeamState['tasks'][string][] {
  return tasks.sort((a, b) => a.id.localeCompare(b.id))
}

function actionableMessages(messages: MailboxMessage[]): MailboxMessage[] {
  return messages.filter(message => message.type === 'assignment' || message.type === 'question')
}

function hasAssignmentMessage(messages: MailboxMessage[]): boolean {
  return messages.some(message => message.type === 'assignment')
}

function hasQuestionMessage(messages: MailboxMessage[]): boolean {
  return messages.some(message => message.type === 'question')
}

function isTaskMessageMergeCandidate(message: MailboxMessage): boolean {
  return message.type === 'assignment' || message.type === 'question' || message.type === 'inform'
}

function formatTaskMessageSignal(message: MailboxMessage): string {
  const text = oneLine(message.text)
  const summary = message.summary ? oneLine(message.summary) : ''
  const signal = [
    `type=${message.type ?? 'message'}`,
    `from=${oneLine(message.from)}`,
    summary && summary !== text ? `summary=${summary}` : '',
  ].filter(Boolean).join(' ')
  return `[${signal}] ${text}`
}

function renderAssignedTaskWithMessages(
  task: TeamState['tasks'][string],
  messages: MailboxMessage[],
): string {
  const taskFacts = `${task.id} ${oneLine(task.title)} — ${oneLine(task.description)}`
  if (messages.length === 0) return taskFacts
  return `${taskFacts} — task messages: ${messages.map(formatTaskMessageSignal).join('; ')}`
}

function reportContractForTaskIds(taskIds: string[]): string {
  const ids = taskIds.length > 0 ? taskIds : ['<taskId>']
  const doneCommands = ids.map(id => `agentteam_task action=report_done taskId=${id}`).join('; ')
  const blockedCommands = ids.map(id => `agentteam_task action=report_blocked taskId=${id}`).join('; ')
  return `Report contract: finish with ${doneCommands} for the durable completion report; if blocked use ${blockedCommands}. Do not only use natural language to say done/blocked. Progress/history is compact local activity only and does not notify team-lead; final result must use report_done/report_blocked.`
}

export function assignedTasksForWorker(team: TeamState, memberName: string): TeamState['tasks'][string][] {
  return sortTasksById(Object.values(team.tasks)
    .filter(task => task.owner === memberName && isTaskActionableForWorkerDelivery(task)))
}

export function blockedTasksForWorker(team: TeamState, memberName: string): TeamState['tasks'][string][] {
  return sortTasksById(Object.values(team.tasks)
    .filter(task => task.owner === memberName && task.status !== 'done' && !isTaskActionableForWorkerDelivery(task)))
}

export function buildWorkerTurnPrompt(
  team: TeamState,
  memberName: string,
  options: WorkerTurnPromptOptions = {},
): string | null {
  const member = team.members[memberName]
  if (!member || member.name === TEAM_LEAD) return null

  const explicitInstruction = options.explicitInstruction
  const unreadMessages = options.unreadMessages ?? []
  const assigned = options.includeAssignedTasks === false ? [] : assignedTasksForWorker(team, memberName)
  const blocked = options.includeAssignedTasks === false ? [] : blockedTasksForWorker(team, memberName)
  const assignedTaskIds = new Set(assigned.map(task => task.id))
  const mergedMessagesByTaskId = new Map<string, MailboxMessage[]>()
  const standaloneMessages: MailboxMessage[] = []
  for (const message of unreadMessages) {
    if (message.taskId && assignedTaskIds.has(message.taskId) && isTaskMessageMergeCandidate(message)) {
      const messages = mergedMessagesByTaskId.get(message.taskId) ?? []
      messages.push(message)
      mergedMessagesByTaskId.set(message.taskId, messages)
    } else {
      standaloneMessages.push(message)
    }
  }
  const actionableUnreadMessages = actionableMessages(unreadMessages)
  const hasExplicitWorkTrigger = Boolean(member.bootPrompt || explicitInstruction)
  const hasAssignedTaskTrigger = Boolean(options.allowAssignedTaskTrigger && assigned.length > 0)
  const hasMessageTrigger = actionableUnreadMessages.length > 0
  const hasTrigger = Boolean(hasExplicitWorkTrigger || hasAssignedTaskTrigger || hasMessageTrigger)
  if (!hasTrigger) return null

  const sections: string[] = []
  if (member.bootPrompt && member.bootPrompt !== explicitInstruction) {
    sections.push(`Boot: ${oneLine(member.bootPrompt)}`)
  }
  if (assigned.length > 0) {
    sections.push(
      `Assigned tasks: ${assigned.map(task => renderAssignedTaskWithMessages(task, mergedMessagesByTaskId.get(task.id) ?? [])).join(' | ')}`,
    )
  }
  if (blocked.length > 0) {
    sections.push(
      `Blocked tasks / non-actionable: ${blocked.map(task => `${task.id} ${oneLine(task.title)} — ${task.blockedBy.length > 0 ? `blockedBy=${oneLine(task.blockedBy.join(', '))}` : 'task status blocked'} — do not work until team-lead clears blockers`).join(' | ')}`,
    )
  }
  if (standaloneMessages.length > 0) {
    sections.push(
      `Messages: ${standaloneMessages.map(msg => `from ${msg.from}: ${oneLine(msg.text)}`).join(' | ')}`,
    )
  }
  if (explicitInstruction) {
    sections.push(`Instruction: ${oneLine(explicitInstruction)}`)
  }
  if (hasAssignmentMessage(actionableUnreadMessages) || hasExplicitWorkTrigger || hasAssignedTaskTrigger) {
    const reportTaskIds = [...new Set([
      ...assigned.map(task => task.id),
      ...actionableUnreadMessages.map(message => message.taskId).filter((taskId): taskId is string => Boolean(taskId)),
    ])].sort((a, b) => a.localeCompare(b))
    sections.push(`Do the work now. Use agentteam_send type=inform/question for directed communication. ${reportContractForTaskIds(reportTaskIds)}`)
  } else if (hasQuestionMessage(actionableUnreadMessages)) {
    sections.push('Answer/respond to the question now. Do not start unrelated task work unless team-lead explicitly assigned it.')
  }
  return sections.join(' || ')
}
