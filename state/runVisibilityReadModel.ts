import type { PlanRun, PlanRunEvent, PlanRunPauseReason, PlanRunStatus, PlanRunStepStatus, TeamState } from '../internalTypes.js'

export type CompactPlanRunTaskHint = {
  planRunId: string
  status: PlanRunStatus
  stepIndex: number
  stepNumber: number
  stepStatus: PlanRunStepStatus
  taskId: string
  pauseReason?: PlanRunPauseReason
  latestEventId?: string
  latestEventType?: PlanRunEvent['type']
  latestReportId?: string
  nextAction: string
}

export type CompactPlanRunLeaderAttention = CompactPlanRunTaskHint

function planRunEventTime(event: PlanRunEvent): number {
  return event.at
}

function latestPlanRunEvent(team: TeamState, planRunId: string): PlanRunEvent | undefined {
  return Object.values(team.planRunEvents ?? {})
    .filter(event => event.planRunId === planRunId)
    .sort((a, b) => planRunEventTime(b) - planRunEventTime(a) || b.id.localeCompare(a.id))[0]
}

function nextActionFor(run: PlanRun, stepStatus: PlanRunStepStatus): string {
  if (run.status === 'waiting_review' || stepStatus === 'waiting_review') {
    return `leader close task then agentteam_planrun action=advance planRunId=${run.id}`
  }
  if (run.status === 'paused') {
    return `leader review ${run.pauseReason ?? 'pause'}; no automatic advance`
  }
  if (run.status === 'active' || stepStatus === 'assigned' || stepStatus === 'open') {
    return 'owner report_done/report_blocked; no automatic advance'
  }
  if (run.status === 'approved') {
    return `agentteam_planrun action=advance planRunId=${run.id}`
  }
  return 'no automatic advance'
}

function compactTaskHint(team: TeamState, run: PlanRun, taskId: string): CompactPlanRunTaskHint | undefined {
  const step = run.steps.find(candidate => candidate.taskId === taskId)
  if (!step) return undefined
  const latestEvent = latestPlanRunEvent(team, run.id)
  return {
    planRunId: run.id,
    status: run.status,
    stepIndex: step.index,
    stepNumber: step.index + 1,
    stepStatus: step.status,
    taskId,
    pauseReason: run.pauseReason,
    latestEventId: latestEvent?.id,
    latestEventType: latestEvent?.type,
    latestReportId: latestEvent?.reportId,
    nextAction: nextActionFor(run, step.status),
  }
}

function planRunUpdatedTime(run: PlanRun): number {
  return run.updatedAt ?? run.createdAt ?? 0
}

export function compactPlanRunTaskHint(team: TeamState, taskId: string): CompactPlanRunTaskHint | undefined {
  const runs = Object.values(team.planRuns ?? {})
    .sort((a, b) => planRunUpdatedTime(b) - planRunUpdatedTime(a) || b.id.localeCompare(a.id))
  for (const run of runs) {
    if (run.activeTaskId !== taskId && !run.steps.some(step => step.taskId === taskId)) continue
    const hint = compactTaskHint(team, run, taskId)
    if (hint) return hint
  }
  return undefined
}

export function compactPlanRunLeaderAttention(team: TeamState): CompactPlanRunLeaderAttention[] {
  return Object.values(team.planRuns ?? {})
    .filter(run => run.status === 'waiting_review' || run.status === 'paused')
    .map(run => {
      const taskId = run.activeTaskId ?? run.steps[run.currentStepIndex]?.taskId
      return taskId ? compactTaskHint(team, run, taskId) : undefined
    })
    .filter((hint): hint is CompactPlanRunLeaderAttention => Boolean(hint))
    .sort((a, b) => a.planRunId.localeCompare(b.planRunId))
}

export function formatCompactPlanRunTaskHint(hint: CompactPlanRunTaskHint | undefined): string {
  if (!hint) return 'PlanRun: -'
  const pause = hint.pauseReason ? ` pauseReason=${hint.pauseReason}` : ''
  const report = hint.latestReportId ? ` report=${hint.latestReportId}` : ''
  return `PlanRun ${hint.planRunId} step ${hint.stepNumber} ${hint.status}; stepStatus=${hint.stepStatus}; task=${hint.taskId}${pause}${report}; next: ${hint.nextAction}`
}
