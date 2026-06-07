import { createHash } from 'node:crypto'
import type { PlanRun, PlanRunStep, TaskReport, TeamMember, TeamState, TeamTask } from '../internalTypes.js'
import { TEAM_LEAD } from '../internalTypes.js'
import type { PlanRunApplicationDeps } from './types.js'
import type { PlanRunApplicationInput, PlanRunApplicationResult, PlanRunInput, PlanRunStepInput } from './planRunTypes.js'

function compactSummary(value: string | undefined, fallback: string): string {
  const normalized = String(value || fallback).replace(/\s+/g, ' ').trim()
  if (normalized.length <= 140) return normalized
  return `${normalized.slice(0, 137)}...`
}

function denyPlanRun(input: {
  action: string
  reason: string
  message: string
  details?: Record<string, unknown>
}): PlanRunApplicationResult {
  return {
    text: input.message,
    details: {
      denied: true,
      action: input.action,
      reason: input.reason,
      ...(input.details ?? {}),
    },
  }
}

function formatPlanRunId(seqValue: number): string {
  return `PR${String(seqValue).padStart(4, '0')}`
}

function allocatePlanRunId(team: TeamState): string {
  const next = Math.max(1, Math.floor(team.nextPlanRunSeq ?? 1))
  team.nextPlanRunSeq = next + 1
  return formatPlanRunId(next)
}

function sourceReportHash(report: TaskReport): string {
  return createHash('sha256')
    .update(JSON.stringify({
      id: report.id,
      taskId: report.taskId,
      type: report.type,
      author: report.author,
      summary: report.summary,
      createdAt: report.createdAt,
    }))
    .digest('hex')
    .slice(0, 16)
}

function fallbackStepCount(report: TaskReport): number {
  const value = report.metadata?.proposedPlanSteps
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.max(1, Math.min(20, Math.floor(value)))
}

function normalizePlanRunSteps(input: {
  steps?: PlanRunStepInput[]
  report: TaskReport
  at: number
}): PlanRunStep[] {
  const sourceSteps: PlanRunStepInput[] = input.steps?.length
    ? input.steps
    : Array.from({ length: fallbackStepCount(input.report) }, (_, index): PlanRunStepInput => ({
        title: `Plan step ${index + 1}`,
        description: `Compact placeholder for approved PlanRun step ${index + 1}; details remain in source report ${input.report.id}.`,
      }))
  return sourceSteps.map((step, index) => ({
    id: `PRS${String(index + 1).padStart(4, '0')}`,
    index,
    title: compactSummary(step.title, `Plan step ${index + 1}`),
    description: compactSummary(step.description, `Approved PlanRun step ${index + 1}`),
    owner: step.owner,
    status: 'pending',
    createdAt: input.at,
    updatedAt: input.at,
    sourceSummary: compactSummary(step.title ?? step.description, `Plan step ${index + 1}`),
  }))
}

function formatPlanRunLine(run: NonNullable<ReturnType<PlanRunApplicationDeps['planRuns']['readPlanRunSummary']>>): string {
  const source = run.sourceReportId ? ` sourceReport=${run.sourceReportId}` : ''
  const active = run.activeTaskId ? ` activeTask=${run.activeTaskId}` : ''
  const pause = run.pauseReason ? ` pause=${run.pauseReason}` : ''
  return `${run.id} ${run.status}${source} steps=${run.stepCount} currentStep=${run.currentStepIndex}${active}${pause}`
}

function formatPlanRunDetails(run: NonNullable<ReturnType<PlanRunApplicationDeps['planRuns']['readPlanRunSummary']>>): string {
  const lines = [
    `PlanRun ${run.id}`,
    `Status: ${run.status}`,
    `Source report: ${run.sourceReportId}`,
    `Source summary: ${run.sourceReportSummary ?? '-'}`,
    `Steps: ${run.stepCount}`,
    `Current step index: ${run.currentStepIndex}`,
  ]
  if (run.pauseReason) lines.push(`Pause reason: ${run.pauseReason}`)
  if (run.latestEvent) lines.push(`Latest event: ${run.latestEvent.id} ${run.latestEvent.type} — ${run.latestEvent.summary}`)
  for (const step of run.steps) {
    lines.push(`- step ${step.index + 1}: ${step.status} ${step.title}${step.owner ? ` owner=${step.owner}` : ''}${step.taskId ? ` task=${step.taskId}` : ''}`)
  }
  return lines.join('\n')
}

function memberNameSort(a: TeamMember, b: TeamMember): number {
  return a.name.localeCompare(b.name)
}

function selectStepOwner(team: TeamState, step: PlanRunStep): string | undefined {
  if (step.owner) {
    const member = team.members[step.owner]
    return member && member.name !== TEAM_LEAD ? member.name : undefined
  }
  const implementers = Object.values(team.members)
    .filter(member => member.name !== TEAM_LEAD && member.role === 'implementer')
    .sort(memberNameSort)
  return implementers.find(member => member.status === 'idle')?.name ?? implementers[0]?.name
}

function activePlanRunTask(team: TeamState, run: PlanRun, step: PlanRunStep): TeamTask | undefined {
  const taskId = step.taskId ?? run.activeTaskId
  return taskId ? team.tasks[taskId] : undefined
}

function approvePlanRun(
  input: PlanRunApplicationInput,
  deps: PlanRunApplicationDeps,
): PlanRunApplicationResult {
  const { params, context } = input
  const { team, teamName, actor } = context
  if (actor !== TEAM_LEAD) {
    return denyPlanRun({
      action: 'approve',
      reason: 'leader_only',
      message: 'Cannot approve PlanRun: only team-lead may approve a planner report into a PlanRun.',
    })
  }
  if (params.confirmApproved !== true) {
    return denyPlanRun({
      action: 'approve',
      reason: 'confirm_approved_required',
      message: 'Cannot approve PlanRun: confirmApproved=true is required for explicit approval.',
    })
  }
  if (!params.sourceReportId) {
    return denyPlanRun({
      action: 'approve',
      reason: 'source_report_required',
      message: 'Cannot approve PlanRun: sourceReportId is required.',
    })
  }
  const report = deps.taskHistory.findTaskReport(team, params.sourceReportId)
  if (!report) {
    return denyPlanRun({
      action: 'approve',
      reason: 'source_report_not_found',
      message: `Cannot approve PlanRun: source report ${params.sourceReportId} was not found.`,
      details: { sourceReportId: params.sourceReportId },
    })
  }

  const approvedAt = deps.now?.() ?? Date.now()
  let planRunId = ''
  const updated = deps.planRuns.writePlanRunMutation(teamName, latest => {
    planRunId = allocatePlanRunId(latest)
    const run: PlanRun = {
      id: planRunId,
      status: 'approved',
      sourceTaskId: report.taskId,
      sourceReportId: report.id,
      sourceReportSummary: compactSummary(report.summary, `${report.type} by ${report.author}`),
      sourceReportHash: sourceReportHash(report),
      approvedBy: actor,
      approvedAt,
      createdAt: approvedAt,
      updatedAt: approvedAt,
      currentStepIndex: 0,
      steps: normalizePlanRunSteps({ steps: params.steps, report, at: approvedAt }),
      metadata: { source: 'agentteam_planrun_approve', reportType: report.type, reportAuthor: report.author },
    }
    latest.planRuns = {
      ...(latest.planRuns ?? {}),
      [run.id]: run,
    }
    latest.activePlanRunId = run.id
  })
  if (!updated || !planRunId) {
    return denyPlanRun({
      action: 'approve',
      reason: 'planrun_write_failed',
      message: 'Cannot approve PlanRun: write failed.',
    })
  }

  const event = deps.planRuns.appendPlanRunEvent(teamName, {
    planRunId,
    type: 'approved',
    by: actor,
    at: approvedAt,
    summary: `Approved PlanRun from ${report.id}`,
    reportId: report.id,
    data: { source: 'agentteam_planrun_approve' },
  })
  const summary = deps.planRuns.readPlanRunSummary(teamName, planRunId)
  if (!summary) {
    return denyPlanRun({
      action: 'approve',
      reason: 'planrun_read_failed',
      message: `Approved PlanRun ${planRunId}, but compact summary could not be read.`,
      details: { planRunId },
    })
  }
  return {
    text: `Approved PlanRun ${summary.id} from report ${summary.sourceReportId}; no tasks were created.`,
    details: {
      planRunId: summary.id,
      planRun: summary,
      event,
      taskCreated: false,
      assignmentSent: false,
    },
    statusInvalidationRequested: true,
  }
}

function advancePlanRun(
  input: PlanRunApplicationInput,
  deps: PlanRunApplicationDeps,
): PlanRunApplicationResult {
  const { params, context } = input
  const { teamName, actor } = context
  if (actor !== TEAM_LEAD) {
    return denyPlanRun({
      action: 'advance',
      reason: 'leader_only',
      message: 'Cannot advance PlanRun: only team-lead may advance approved steps.',
    })
  }
  if (!params.planRunId) {
    return denyPlanRun({
      action: 'advance',
      reason: 'planrun_id_required',
      message: 'Cannot advance PlanRun: planRunId is required.',
    })
  }

  const advancedAt = deps.now?.() ?? Date.now()
  let denial: PlanRunApplicationResult | undefined
  let createdTask: TeamTask | undefined
  let advancedStepIndex = -1
  const updated = deps.planRuns.writePlanRunMutation(teamName, latest => {
    const run = latest.planRuns?.[params.planRunId!]
    if (!run) {
      denial = denyPlanRun({
        action: 'advance',
        reason: 'planrun_not_found',
        message: `Cannot advance PlanRun: ${params.planRunId} was not found.`,
        details: { planRunId: params.planRunId },
      })
      return
    }
    const step = run.steps[run.currentStepIndex]
    if (!step) {
      denial = denyPlanRun({
        action: 'advance',
        reason: 'no_current_step',
        message: `Cannot advance PlanRun ${run.id}: no current step is available.`,
        details: { planRunId: run.id, currentStepIndex: run.currentStepIndex },
      })
      return
    }
    const activeTask = activePlanRunTask(latest, run, step)
    if (activeTask && activeTask.status !== 'done') {
      denial = denyPlanRun({
        action: 'advance',
        reason: 'active_step_unresolved',
        message: `Cannot advance PlanRun ${run.id}: step ${step.index + 1} task ${activeTask.id} is still ${activeTask.status}.`,
        details: { planRunId: run.id, taskId: activeTask.id, taskStatus: activeTask.status, stepIndex: step.index },
      })
      return
    }
    if (step.status !== 'pending' && !activeTask) {
      denial = denyPlanRun({
        action: 'advance',
        reason: 'step_not_pending',
        message: `Cannot advance PlanRun ${run.id}: step ${step.index + 1} is ${step.status}.`,
        details: { planRunId: run.id, stepIndex: step.index, stepStatus: step.status },
      })
      return
    }
    const owner = selectStepOwner(latest, step)
    if (!owner) {
      denial = denyPlanRun({
        action: 'advance',
        reason: 'owner_required',
        message: `Cannot advance PlanRun ${run.id}: step ${step.index + 1} has no valid owner and no idle implementer is available.`,
        details: { planRunId: run.id, stepIndex: step.index, stepOwner: step.owner ?? null },
      })
      return
    }

    const task = deps.taskMutations.createTask(latest, {
      title: step.title,
      description: step.description,
      owner,
    })
    deps.taskMutations.appendTaskEvent(latest, {
      taskId: task.id,
      type: 'created',
      by: actor,
      at: advancedAt,
      summary: `PlanRun ${run.id} step ${step.index + 1} task created`,
      data: { source: 'agentteam_planrun_advance', planRunId: run.id, stepId: step.id, stepIndex: step.index },
    })
    deps.taskMutations.appendTaskEvent(latest, {
      taskId: task.id,
      type: 'assigned',
      by: actor,
      at: advancedAt,
      summary: `Assigned to ${owner} by PlanRun ${run.id}`,
      data: { source: 'agentteam_planrun_advance', planRunId: run.id, stepId: step.id, stepIndex: step.index, newOwner: owner },
    })

    step.owner = owner
    step.taskId = task.id
    step.status = 'assigned'
    step.updatedAt = advancedAt
    run.status = 'active'
    run.activeTaskId = task.id
    run.updatedAt = advancedAt
    latest.activePlanRunId = run.id
    createdTask = task
    advancedStepIndex = step.index
  })

  if (denial) return denial
  if (!updated || !createdTask) {
    return denyPlanRun({
      action: 'advance',
      reason: 'advance_write_failed',
      message: `Cannot advance PlanRun ${params.planRunId}: write failed.`,
      details: { planRunId: params.planRunId },
    })
  }

  const event = deps.planRuns.appendPlanRunEvent(teamName, {
    planRunId: params.planRunId,
    type: 'advanced',
    by: actor,
    at: advancedAt,
    summary: `Advanced step ${advancedStepIndex + 1} to task ${createdTask.id}`,
    stepIndex: advancedStepIndex,
    taskId: createdTask.id,
    data: { source: 'agentteam_planrun_advance' },
  })
  const summary = deps.planRuns.readPlanRunSummary(teamName, params.planRunId)
  return {
    text: `Advanced PlanRun ${params.planRunId} step ${advancedStepIndex + 1}: created ${createdTask.id} for ${createdTask.owner}.`,
    details: {
      planRunId: params.planRunId,
      planRun: summary,
      task: createdTask,
      event,
      taskCreated: true,
      assignmentAudited: true,
      assignmentSent: false,
    },
    statusInvalidationRequested: true,
  }
}

function showPlanRun(params: PlanRunInput, deps: PlanRunApplicationDeps, teamName: string): PlanRunApplicationResult {
  if (!params.planRunId) {
    return denyPlanRun({
      action: 'show',
      reason: 'planrun_id_required',
      message: 'Cannot show PlanRun: planRunId is required.',
    })
  }
  const run = deps.planRuns.readPlanRunSummary(teamName, params.planRunId)
  if (!run) {
    return denyPlanRun({
      action: 'show',
      reason: 'planrun_not_found',
      message: `Cannot show PlanRun: ${params.planRunId} was not found.`,
      details: { planRunId: params.planRunId },
    })
  }
  return {
    text: formatPlanRunDetails(run),
    details: { planRun: run, planRunId: run.id },
  }
}

function listPlanRuns(deps: PlanRunApplicationDeps, teamName: string): PlanRunApplicationResult {
  const runs = deps.planRuns.listPlanRuns(teamName)
  const lines = runs.length
    ? [`PlanRuns for ${teamName}: ${runs.length}`, ...runs.map(formatPlanRunLine)]
    : [`PlanRuns for ${teamName}: 0`]
  return {
    text: lines.join('\n'),
    details: { planRuns: runs, count: runs.length },
  }
}

export function executePlanRunApplication(
  input: PlanRunApplicationInput,
  deps: PlanRunApplicationDeps,
): PlanRunApplicationResult {
  switch (input.params.action) {
    case 'approve':
      return approvePlanRun(input, deps)
    case 'show':
      return showPlanRun(input.params, deps, input.context.teamName)
    case 'list':
      return listPlanRuns(deps, input.context.teamName)
    case 'advance':
      return advancePlanRun(input, deps)
    case 'pause':
    case 'resume':
    case 'cancel':
      return denyPlanRun({
        action: input.params.action,
        reason: 'not_implemented',
        message: `PlanRun action ${input.params.action} is not implemented in this slice.`,
      })
    default:
      throw new Error(`Unsupported PlanRun action ${(input.params as { action: string }).action}`)
  }
}
