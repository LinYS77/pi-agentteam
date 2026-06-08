import type { PlanRun, PlanRunEvent, PlanRunStep, TeamState } from '../internalTypes.js'

export type ObservedClosedTaskRunStep = {
  planRunId: string
  stepIndex: number
  taskId: string
  acceptedEventId: string
  completedEventId?: string
  status: PlanRun['status']
  stepStatus: PlanRunStep['status']
  nextStepIndex?: number
  terminal: boolean
}

export type ObserveClosedTaskForRunsInput = {
  taskId: string
  actor: string
  at: number
}

function formatRunEventId(seqValue: number): string {
  return `PRE${String(seqValue).padStart(4, '0')}`
}

function allocateRunEventId(team: TeamState): string {
  const next = Math.max(1, Math.floor(team.nextPlanRunEventSeq ?? 1))
  team.nextPlanRunEventSeq = next + 1
  return formatRunEventId(next)
}

function appendRunEvent(team: TeamState, input: Omit<PlanRunEvent, 'id'>): PlanRunEvent {
  const event: PlanRunEvent = {
    id: allocateRunEventId(team),
    ...input,
  }
  team.planRunEvents = {
    ...(team.planRunEvents ?? {}),
    [event.id]: event,
  }
  return event
}

function findRunStepForTask(team: TeamState, taskId: string): { run: PlanRun; step: PlanRunStep } | undefined {
  for (const run of Object.values(team.planRuns ?? {})) {
    if (run.status === 'done' || run.status === 'cancelled') continue
    const step = run.steps.find(candidate => candidate.taskId === taskId)
    if (!step) continue
    if (run.activeTaskId && run.activeTaskId !== taskId) continue
    if (!run.activeTaskId && step.status !== 'waiting_review' && step.status !== 'assigned' && step.status !== 'blocked') continue
    return { run, step }
  }
  return undefined
}

function nextPendingStep(run: PlanRun, afterIndex: number): PlanRunStep | undefined {
  return run.steps
    .filter(step => step.index > afterIndex && step.status === 'pending')
    .sort((a, b) => a.index - b.index)[0]
}

export function observeClosedTaskForRuns(
  team: TeamState,
  input: ObserveClosedTaskForRunsInput,
): ObservedClosedTaskRunStep | undefined {
  const match = findRunStepForTask(team, input.taskId)
  if (!match) return undefined

  const { run, step } = match
  step.status = 'done'
  step.updatedAt = input.at
  run.activeTaskId = undefined
  run.pauseReason = undefined
  run.updatedAt = input.at

  const acceptedEvent = appendRunEvent(team, {
    planRunId: run.id,
    type: 'step_accepted',
    by: input.actor,
    at: input.at,
    summary: `Accepted step ${step.index + 1} after task ${input.taskId} close`,
    stepIndex: step.index,
    taskId: input.taskId,
    data: { source: 'agentteam_task_close' },
  })

  const nextStep = nextPendingStep(run, step.index)
  if (nextStep) {
    run.status = 'approved'
    run.currentStepIndex = nextStep.index
    return {
      planRunId: run.id,
      stepIndex: step.index,
      taskId: input.taskId,
      acceptedEventId: acceptedEvent.id,
      status: run.status,
      stepStatus: step.status,
      nextStepIndex: nextStep.index,
      terminal: false,
    }
  }

  run.status = 'done'
  if (team.activePlanRunId === run.id) team.activePlanRunId = undefined
  const completedEvent = appendRunEvent(team, {
    planRunId: run.id,
    type: 'completed',
    by: input.actor,
    at: input.at,
    summary: `Completed PlanRun ${run.id} after accepting step ${step.index + 1}`,
    stepIndex: step.index,
    taskId: input.taskId,
    data: { source: 'agentteam_task_close' },
  })
  return {
    planRunId: run.id,
    stepIndex: step.index,
    taskId: input.taskId,
    acceptedEventId: acceptedEvent.id,
    completedEventId: completedEvent.id,
    status: run.status,
    stepStatus: step.status,
    terminal: true,
  }
}
