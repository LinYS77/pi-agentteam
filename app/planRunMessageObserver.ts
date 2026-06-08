import { TEAM_LEAD, type PlanRun, type PlanRunEvent, type PlanRunStep, type TeamState } from '../internalTypes.js'

export type ObservedPlanRunQuestionPause = {
  planRunId: string
  stepIndex: number
  taskId: string
  eventId: string
  status: PlanRun['status']
  stepStatus: PlanRunStep['status']
  pauseReason: 'question'
  mailboxMessageId?: string
  messageRefId?: string
}

export type ObservePlanRunQuestionMessageInput = {
  taskId?: string
  messageType: string
  sender: string
  recipients: string[]
  at: number
  mailboxMessageId?: string
}

function formatPlanRunEventId(seqValue: number): string {
  return `PRE${String(seqValue).padStart(4, '0')}`
}

function allocatePlanRunEventId(team: TeamState): string {
  const next = Math.max(1, Math.floor(team.nextPlanRunEventSeq ?? 1))
  team.nextPlanRunEventSeq = next + 1
  return formatPlanRunEventId(next)
}

function findActiveRunStepForTask(team: TeamState, taskId: string): { run: PlanRun; step: PlanRunStep } | undefined {
  for (const run of Object.values(team.planRuns ?? {})) {
    if (run.status !== 'active' || run.activeTaskId !== taskId) continue
    const step = run.steps.find(candidate => candidate.taskId === taskId)
    if (step) return { run, step }
  }
  return undefined
}

function findTaskMessageRefId(team: TeamState, taskId: string, mailboxMessageId: string | undefined): string | undefined {
  if (!mailboxMessageId) return undefined
  return Object.values(team.taskMessageRefs ?? {})
    .filter(ref => ref.taskId === taskId && ref.mailboxMessageId === mailboxMessageId)
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))[0]?.id
}

function appendPausedQuestionEvent(
  team: TeamState,
  input: {
    run: PlanRun
    step: PlanRunStep
    taskId: string
    sender: string
    at: number
    mailboxMessageId?: string
    messageRefId?: string
  },
): PlanRunEvent {
  const event: PlanRunEvent = {
    id: allocatePlanRunEventId(team),
    planRunId: input.run.id,
    type: 'paused',
    by: input.sender,
    at: input.at,
    summary: `Step ${input.step.index + 1} paused after owner question`,
    stepIndex: input.step.index,
    taskId: input.taskId,
    pauseReason: 'question',
    data: {
      source: 'agentteam_send_question',
      mailboxMessageId: input.mailboxMessageId,
      messageRefId: input.messageRefId,
    },
  }
  team.planRunEvents = {
    ...(team.planRunEvents ?? {}),
    [event.id]: event,
  }
  return event
}

export function observePlanRunQuestionMessage(
  team: TeamState,
  input: ObservePlanRunQuestionMessageInput,
): ObservedPlanRunQuestionPause | undefined {
  if (input.messageType !== 'question') return undefined
  if (!input.taskId || !input.recipients.includes(TEAM_LEAD)) return undefined
  if (input.sender === TEAM_LEAD) return undefined

  const task = team.tasks[input.taskId]
  if (!task || task.status !== 'open' || task.owner !== input.sender) return undefined

  const match = findActiveRunStepForTask(team, input.taskId)
  if (!match) return undefined

  const { run, step } = match
  const messageRefId = findTaskMessageRefId(team, input.taskId, input.mailboxMessageId)
  run.status = 'paused'
  run.pauseReason = 'question'
  run.activeTaskId = input.taskId
  run.updatedAt = input.at
  step.updatedAt = input.at
  team.activePlanRunId = run.id

  const event = appendPausedQuestionEvent(team, {
    run,
    step,
    taskId: input.taskId,
    sender: input.sender,
    at: input.at,
    mailboxMessageId: input.mailboxMessageId,
    messageRefId,
  })

  return {
    planRunId: run.id,
    stepIndex: step.index,
    taskId: input.taskId,
    eventId: event.id,
    status: run.status,
    stepStatus: step.status,
    pauseReason: 'question',
    mailboxMessageId: input.mailboxMessageId,
    messageRefId,
  }
}
