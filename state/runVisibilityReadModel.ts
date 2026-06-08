import type { PlanRun, PlanRunEvent, PlanRunPauseReason, PlanRunStatus, PlanRunStepStatus, TeamState } from '../internalTypes.js'
import { buildReportWatchdogSummary, type ReportWatchdogTaskSummary } from './taskReportWatchdogReadModel.js'

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
  watchdog?: Pick<ReportWatchdogTaskSummary, 'state' | 'needsNudge' | 'reason' | 'owner' | 'workerStatus'>
  nextAction: string
}

export type CompactPlanRunPanelProjection = CompactPlanRunTaskHint
export type CompactPlanRunLeaderAttention = CompactPlanRunTaskHint

function planRunEventTime(event: PlanRunEvent): number {
  return event.at
}

function latestPlanRunEvent(team: TeamState, planRunId: string): PlanRunEvent | undefined {
  return Object.values(team.planRunEvents ?? {})
    .filter(event => event.planRunId === planRunId)
    .sort((a, b) => planRunEventTime(b) - planRunEventTime(a) || b.id.localeCompare(a.id))[0]
}

function watchdogForTask(team: TeamState, taskId: string): ReportWatchdogTaskSummary | undefined {
  return buildReportWatchdogSummary(team).tasks.find(task => task.taskId === taskId)
}

function nextActionFor(run: PlanRun, stepStatus: PlanRunStepStatus, watchdog?: ReportWatchdogTaskSummary): string {
  if (watchdog?.state === 'waiting_for_report') {
    return `watchdog waiting_for_report needsNudge=${watchdog.needsNudge}; no automatic nudge or advance`
  }
  if (run.status === 'waiting_review' || stepStatus === 'waiting_review') {
    return `leader close task then agentteam_planrun action=advance planRunId=${run.id}`
  }
  if (run.status === 'paused') {
    return `leader review ${run.pauseReason ?? 'pause'}; no automatic advance`
  }
  if (run.status === 'active' || stepStatus === 'assigned' || stepStatus === 'open') {
    return 'watchdog active; owner report_done/report_blocked; no automatic advance'
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
  const watchdog = watchdogForTask(team, taskId)
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
    watchdog: watchdog
      ? {
          state: watchdog.state,
          needsNudge: watchdog.needsNudge,
          reason: watchdog.reason,
          owner: watchdog.owner,
          workerStatus: watchdog.workerStatus,
        }
      : undefined,
    nextAction: nextActionFor(run, step.status, watchdog),
  }
}

function compactCurrentStepHint(team: TeamState, run: PlanRun): CompactPlanRunTaskHint | undefined {
  const taskId = run.activeTaskId ?? run.steps[run.currentStepIndex]?.taskId
  if (taskId) return compactTaskHint(team, run, taskId)
  const step = run.steps[run.currentStepIndex]
  if (!step) return undefined
  const latestEvent = latestPlanRunEvent(team, run.id)
  return {
    planRunId: run.id,
    status: run.status,
    stepIndex: step.index,
    stepNumber: step.index + 1,
    stepStatus: step.status,
    taskId: step.taskId ?? '',
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

export function compactPlanRunPanelProjection(team: TeamState): CompactPlanRunPanelProjection[] {
  return Object.values(team.planRuns ?? {})
    .filter(run => run.status === 'approved' || run.status === 'active' || run.status === 'waiting_review' || run.status === 'paused')
    .sort((a, b) => planRunUpdatedTime(b) - planRunUpdatedTime(a) || b.id.localeCompare(a.id))
    .map(run => compactCurrentStepHint(team, run))
    .filter((hint): hint is CompactPlanRunPanelProjection => Boolean(hint))
}

export function compactPlanRunLeaderAttention(team: TeamState): CompactPlanRunLeaderAttention[] {
  return compactPlanRunPanelProjection(team)
    .filter(hint => hint.status === 'waiting_review' || hint.status === 'paused' || hint.status === 'active')
    .sort((a, b) => a.planRunId.localeCompare(b.planRunId))
}

export function formatCompactPlanRunTaskHint(hint: CompactPlanRunTaskHint | undefined): string {
  if (!hint) return 'PlanRun: -'
  const pause = hint.pauseReason ? ` pauseReason=${hint.pauseReason}` : ''
  const report = hint.latestReportId ? ` report=${hint.latestReportId}` : ''
  const watchdog = hint.watchdog ? ` watchdog=${hint.watchdog.state} needsNudge=${hint.watchdog.needsNudge}` : ''
  return `PlanRun ${hint.planRunId} step ${hint.stepNumber} ${hint.status}; stepStatus=${hint.stepStatus}; task=${hint.taskId}${pause}${report}${watchdog}; next: ${hint.nextAction}`
}
