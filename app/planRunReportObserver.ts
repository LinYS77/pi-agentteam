import type { PlanRun, PlanRunEvent, PlanRunEventType, PlanRunPauseReason, PlanRunStep, TeamState } from '../internalTypes.js'

export type ObservedTaskReportForRun = {
  planRunId: string
  stepIndex: number
  taskId: string
  reportId: string
  eventId: string
  status: PlanRun['status']
  stepStatus: PlanRunStep['status']
  pauseReason?: PlanRunPauseReason
}

export type ObserveTaskReportForRunsInput = {
  taskId: string
  reportId: string
  reportType: 'report_done' | 'report_blocked'
  actor: string
  at: number
}

function formatPlanRunEventId(seqValue: number): string {
  return `PRE${String(seqValue).padStart(4, '0')}`
}

function allocatePlanRunEventId(team: TeamState): string {
  const next = Math.max(1, Math.floor(team.nextPlanRunEventSeq ?? 1))
  team.nextPlanRunEventSeq = next + 1
  return formatPlanRunEventId(next)
}

function findRunForTask(team: TeamState, taskId: string): { run: PlanRun; step: PlanRunStep } | undefined {
  for (const run of Object.values(team.planRuns ?? {})) {
    const step = run.steps.find(candidate => candidate.taskId === taskId)
    if (step && (run.activeTaskId === taskId || step.status === 'assigned' || step.status === 'waiting_review' || step.status === 'blocked')) {
      return { run, step }
    }
  }
  return undefined
}

function appendCompactEvent(
  team: TeamState,
  input: {
    run: PlanRun
    step: PlanRunStep
    eventType: PlanRunEventType
    report: ObserveTaskReportForRunsInput
    summary: string
    pauseReason?: PlanRunPauseReason
  },
): PlanRunEvent {
  const event: PlanRunEvent = {
    id: allocatePlanRunEventId(team),
    planRunId: input.run.id,
    type: input.eventType,
    by: input.report.actor,
    at: input.report.at,
    summary: input.summary,
    stepIndex: input.step.index,
    taskId: input.report.taskId,
    reportId: input.report.reportId,
    pauseReason: input.pauseReason,
    data: { source: 'agentteam_task_report_workflow', reportType: input.report.reportType },
  }
  team.planRunEvents = {
    ...(team.planRunEvents ?? {}),
    [event.id]: event,
  }
  return event
}

export function observeTaskReportForRuns(
  team: TeamState,
  input: ObserveTaskReportForRunsInput,
): ObservedTaskReportForRun | undefined {
  const match = findRunForTask(team, input.taskId)
  if (!match) return undefined

  const { run, step } = match
  if (input.reportType === 'report_blocked') {
    run.status = 'paused'
    run.pauseReason = 'report_blocked'
    run.updatedAt = input.at
    run.activeTaskId = input.taskId
    step.status = 'blocked'
    step.updatedAt = input.at
    const event = appendCompactEvent(team, {
      run,
      step,
      eventType: 'paused',
      report: input,
      summary: `Step ${step.index + 1} paused after blocked report ${input.reportId}`,
      pauseReason: 'report_blocked',
    })
    return {
      planRunId: run.id,
      stepIndex: step.index,
      taskId: input.taskId,
      reportId: input.reportId,
      eventId: event.id,
      status: run.status,
      stepStatus: step.status,
      pauseReason: run.pauseReason,
    }
  }

  run.status = 'waiting_review'
  run.pauseReason = undefined
  run.updatedAt = input.at
  run.activeTaskId = input.taskId
  step.status = 'waiting_review'
  step.updatedAt = input.at
  const event = appendCompactEvent(team, {
    run,
    step,
    eventType: 'waiting_review',
    report: input,
    summary: `Step ${step.index + 1} waiting for leader review after report ${input.reportId}`,
  })
  return {
    planRunId: run.id,
    stepIndex: step.index,
    taskId: input.taskId,
    reportId: input.reportId,
    eventId: event.id,
    status: run.status,
    stepStatus: step.status,
  }
}
