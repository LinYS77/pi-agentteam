import { createHash } from 'node:crypto'
import type { PlanRun, PlanRunPauseReason, PlanRunStep, TaskReport, TeamMember, TeamState, TeamTask } from '../internalTypes.js'
import { TEAM_LEAD } from '../internalTypes.js'
import type { PlanRunApplicationDeps } from './types.js'
import type { PlanRunApplicationInput, PlanRunApplicationResult, PlanRunInput, PlanRunStepInput } from './planRunTypes.js'

type PlanRunSummary = NonNullable<ReturnType<PlanRunApplicationDeps['planRuns']['readPlanRunSummary']>>
type PlanRunStepSummary = PlanRunSummary['steps'][number]

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

function currentSummaryStep(run: PlanRunSummary): PlanRunStepSummary | undefined {
  return run.steps.find(step => step.index === run.currentStepIndex) ?? run.steps[run.currentStepIndex]
}

function nextActionForPlanRunSummary(run: PlanRunSummary): string {
  const step = currentSummaryStep(run)
  if (run.status === 'done' || run.status === 'cancelled') return 'no further advance'
  if (run.status === 'paused') return `leader review ${run.pauseReason ?? 'pause'}; maybe agentteam_planrun action=resume/cancel planRunId=${run.id}`
  if (run.status === 'waiting_review' || step?.status === 'waiting_review') return `leader close task then agentteam_planrun action=advance planRunId=${run.id}`
  if (run.status === 'active' || step?.status === 'assigned' || step?.status === 'open') return 'owner report_done/report_blocked; no automatic advance'
  if (run.status === 'approved' || step?.status === 'pending') return `agentteam_planrun action=advance planRunId=${run.id}`
  return 'no automatic advance'
}

function withNextAction(run: PlanRunSummary): PlanRunSummary & { nextAction: string } {
  return {
    ...run,
    nextAction: nextActionForPlanRunSummary(run),
  }
}

function formatPlanRunLine(run: PlanRunSummary): string {
  const source = run.sourceReportId ? ` sourceReport=${run.sourceReportId}` : ''
  const active = run.activeTaskId ? ` activeTask=${run.activeTaskId}` : ''
  const pause = run.pauseReason ? ` pause=${run.pauseReason}` : ''
  return `${run.id} ${run.status}${source} steps=${run.stepCount} currentStep=${run.currentStepIndex}${active}${pause}; nextAction: ${nextActionForPlanRunSummary(run)}`
}

function formatPlanRunDetails(run: PlanRunSummary): string {
  const lines = [
    `PlanRun ${run.id}`,
    `Status: ${run.status}`,
    `Source report: ${run.sourceReportId}`,
    `Source summary: ${run.sourceReportSummary ?? '-'}`,
    `Steps: ${run.stepCount}`,
    `Current step index: ${run.currentStepIndex}`,
    `nextAction: ${nextActionForPlanRunSummary(run)}`,
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

function selectStepOwner(team: TeamState, step: Pick<PlanRunStep, 'owner'>): string | undefined {
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

function normalizeManualPauseReason(value: PlanRunInput['pauseReason']): PlanRunPauseReason | undefined {
  const reason = typeof value === 'string' && value.trim() ? value.trim() : 'leader_paused'
  return reason === 'leader_paused' || reason === 'validation_failed' ? reason : undefined
}

function isActiveStepStatus(status: PlanRunStep['status']): boolean {
  return status === 'assigned' || status === 'open' || status === 'waiting_review' || status === 'blocked'
}

function resumeStatusForRun(run: Pick<PlanRun, 'activeTaskId' | 'currentStepIndex'> & { steps: Array<Pick<PlanRunStep, 'taskId' | 'status'>> }): PlanRun['status'] {
  const step = run.steps[run.currentStepIndex]
  return run.activeTaskId || (step?.taskId && isActiveStepStatus(step.status)) ? 'active' : 'approved'
}

type PlanRunDryRunAction = Extract<PlanRunInput['action'], 'advance' | 'pause' | 'resume' | 'cancel'>

type PlanRunDryRunPreview = {
  dryRun: true
  preview: true
  action: PlanRunDryRunAction
  planRunId: string
  allowed: boolean
  reason?: string
  status?: PlanRun['status']
  stepIndex?: number
  stepStatus?: PlanRunStep['status']
  taskId?: string | null
  wouldCreateTask: boolean
  wouldAppendEvent: boolean
  wouldChangeStatus: boolean
  wouldChangePlanRun: boolean
  wouldChangeTask: boolean
  wouldSendMailbox: boolean
  wouldAllocateIdOnExecute: boolean
  allocatedId: false
  changedSeq: false
  nextStatus?: PlanRun['status']
  nextPauseReason?: PlanRunPauseReason
  nextAction?: string
  owner?: string
  title?: string
}

function previewDenied(input: {
  action: PlanRunDryRunAction
  planRunId: string
  run?: PlanRunSummary
  reason: string
  step?: PlanRunStepSummary
  taskId?: string | null
}): PlanRunDryRunPreview {
  return {
    dryRun: true,
    preview: true,
    action: input.action,
    planRunId: input.planRunId,
    allowed: false,
    reason: input.reason,
    status: input.run?.status,
    stepIndex: input.step?.index,
    stepStatus: input.step?.status,
    taskId: input.taskId ?? input.step?.taskId ?? input.run?.activeTaskId ?? null,
    wouldCreateTask: false,
    wouldAppendEvent: false,
    wouldChangeStatus: false,
    wouldChangePlanRun: false,
    wouldChangeTask: false,
    wouldSendMailbox: false,
    wouldAllocateIdOnExecute: false,
    allocatedId: false,
    changedSeq: false,
    nextAction: input.run ? nextActionForPlanRunSummary(input.run) : undefined,
  }
}

function previewAdvancePlanRun(run: PlanRunSummary, context: PlanRunApplicationInput['context']): PlanRunDryRunPreview {
  const step = currentSummaryStep(run)
  if (run.status === 'done' || run.status === 'cancelled') return previewDenied({ action: 'advance', planRunId: run.id, run, reason: 'planrun_terminal', step })
  if (!step) return previewDenied({ action: 'advance', planRunId: run.id, run, reason: 'no_current_step' })
  const activeTaskId = step.taskId ?? run.activeTaskId
  const activeTask = activeTaskId ? context.team.tasks[activeTaskId] : undefined
  if (step.status !== 'pending') return previewDenied({ action: 'advance', planRunId: run.id, run, reason: 'step_not_pending', step, taskId: step.taskId ?? null })
  if (activeTask && activeTask.status !== 'done') return previewDenied({ action: 'advance', planRunId: run.id, run, reason: 'active_step_unresolved', step, taskId: activeTask.id })
  const owner = selectStepOwner(context.team, step)
  if (!owner) return previewDenied({ action: 'advance', planRunId: run.id, run, reason: 'owner_required', step })
  return {
    dryRun: true,
    preview: true,
    action: 'advance',
    planRunId: run.id,
    allowed: true,
    status: run.status,
    stepIndex: step.index,
    stepStatus: step.status,
    taskId: null,
    wouldCreateTask: true,
    wouldAppendEvent: true,
    wouldChangeStatus: run.status !== 'active',
    wouldChangePlanRun: true,
    wouldChangeTask: false,
    wouldSendMailbox: false,
    wouldAllocateIdOnExecute: true,
    allocatedId: false,
    changedSeq: false,
    nextStatus: 'active',
    nextAction: 'would create task and wait for owner report; no automatic advance',
    owner,
    title: step.title,
  }
}

function previewPausePlanRun(run: PlanRunSummary, params: PlanRunInput): PlanRunDryRunPreview {
  const step = currentSummaryStep(run)
  const pauseReason = normalizeManualPauseReason(params.pauseReason)
  if (!pauseReason) return previewDenied({ action: 'pause', planRunId: run.id, run, reason: 'unsupported_pause_reason', step })
  if (run.status === 'done' || run.status === 'cancelled') return previewDenied({ action: 'pause', planRunId: run.id, run, reason: 'planrun_terminal', step })
  return {
    dryRun: true,
    preview: true,
    action: 'pause',
    planRunId: run.id,
    allowed: true,
    status: run.status,
    stepIndex: step?.index,
    stepStatus: step?.status,
    taskId: run.activeTaskId ?? step?.taskId ?? null,
    wouldCreateTask: false,
    wouldAppendEvent: true,
    wouldChangeStatus: run.status !== 'paused' || run.pauseReason !== pauseReason,
    wouldChangePlanRun: true,
    wouldChangeTask: false,
    wouldSendMailbox: false,
    wouldAllocateIdOnExecute: true,
    allocatedId: false,
    changedSeq: false,
    nextStatus: 'paused',
    nextPauseReason: pauseReason,
    nextAction: `leader review ${pauseReason}; maybe resume/cancel`,
  }
}

function previewResumePlanRun(run: PlanRunSummary): PlanRunDryRunPreview {
  const step = currentSummaryStep(run)
  if (run.status !== 'paused') return previewDenied({ action: 'resume', planRunId: run.id, run, reason: 'planrun_not_paused', step })
  const nextStatus = resumeStatusForRun(run)
  return {
    dryRun: true,
    preview: true,
    action: 'resume',
    planRunId: run.id,
    allowed: true,
    status: run.status,
    stepIndex: step?.index,
    stepStatus: step?.status,
    taskId: run.activeTaskId ?? step?.taskId ?? null,
    wouldCreateTask: false,
    wouldAppendEvent: true,
    wouldChangeStatus: true,
    wouldChangePlanRun: true,
    wouldChangeTask: false,
    wouldSendMailbox: false,
    wouldAllocateIdOnExecute: true,
    allocatedId: false,
    changedSeq: false,
    nextStatus,
    nextAction: nextStatus === 'active' ? 'owner report_done/report_blocked; no automatic advance' : `agentteam_planrun action=advance planRunId=${run.id}`,
  }
}

function previewCancelPlanRun(run: PlanRunSummary): PlanRunDryRunPreview {
  const step = currentSummaryStep(run)
  if (run.status === 'done' || run.status === 'cancelled') return previewDenied({ action: 'cancel', planRunId: run.id, run, reason: 'planrun_terminal', step })
  return {
    dryRun: true,
    preview: true,
    action: 'cancel',
    planRunId: run.id,
    allowed: true,
    status: run.status,
    stepIndex: step?.index,
    stepStatus: step?.status,
    taskId: run.activeTaskId ?? step?.taskId ?? null,
    wouldCreateTask: false,
    wouldAppendEvent: true,
    wouldChangeStatus: true,
    wouldChangePlanRun: true,
    wouldChangeTask: false,
    wouldSendMailbox: false,
    wouldAllocateIdOnExecute: true,
    allocatedId: false,
    changedSeq: false,
    nextStatus: 'cancelled',
    nextAction: 'no further advance',
  }
}

function dryRunPlanRun(
  input: PlanRunApplicationInput,
  deps: PlanRunApplicationDeps,
): PlanRunApplicationResult {
  const { params, context } = input
  const action = params.action as PlanRunDryRunAction
  if (context.actor !== TEAM_LEAD) {
    return denyPlanRun({
      action,
      reason: 'leader_only',
      message: `Cannot preview PlanRun ${action}: only team-lead may preview control actions.`,
    })
  }
  if (!params.planRunId) {
    return denyPlanRun({
      action,
      reason: 'planrun_id_required',
      message: `Cannot preview PlanRun ${action}: planRunId is required.`,
    })
  }
  const run = deps.planRuns.readPlanRunSummary(context.teamName, params.planRunId)
  if (!run) {
    return denyPlanRun({
      action,
      reason: 'planrun_not_found',
      message: `Cannot preview PlanRun ${action}: ${params.planRunId} was not found.`,
      details: { planRunId: params.planRunId },
    })
  }
  const preview = action === 'advance'
    ? previewAdvancePlanRun(run, context)
    : action === 'pause'
      ? previewPausePlanRun(run, params)
      : action === 'resume'
        ? previewResumePlanRun(run)
        : previewCancelPlanRun(run)
  return {
    text: `dryRun preview ${action} PlanRun ${run.id}: wouldCreateTask=${preview.wouldCreateTask}; wouldAppendEvent=${preview.wouldAppendEvent}; nextStatus=${preview.nextStatus ?? '-'}; reason=${preview.reason ?? '-'}`,
    details: {
      dryRun: true,
      preview,
      planRunId: run.id,
      planRun: withNextAction(run),
    },
  }
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
    if (run.status === 'done' || run.status === 'cancelled') {
      denial = denyPlanRun({
        action: 'advance',
        reason: 'planrun_terminal',
        message: `Cannot advance PlanRun ${run.id}: status is ${run.status}.`,
        details: { planRunId: run.id, status: run.status },
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
    if (step.status !== 'pending') {
      denial = denyPlanRun({
        action: 'advance',
        reason: 'step_not_pending',
        message: `Cannot advance PlanRun ${run.id}: step ${step.index + 1} is ${step.status}.`,
        details: { planRunId: run.id, stepIndex: step.index, stepStatus: step.status, taskId: step.taskId ?? null },
      })
      return
    }
    if (activeTask && activeTask.status !== 'done') {
      denial = denyPlanRun({
        action: 'advance',
        reason: 'active_step_unresolved',
        message: `Cannot advance PlanRun ${run.id}: step ${step.index + 1} task ${activeTask.id} is still ${activeTask.status}.`,
        details: { planRunId: run.id, taskId: activeTask.id, taskStatus: activeTask.status, stepIndex: step.index },
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

function pausePlanRun(
  input: PlanRunApplicationInput,
  deps: PlanRunApplicationDeps,
): PlanRunApplicationResult {
  const { params, context } = input
  const { teamName, actor } = context
  if (actor !== TEAM_LEAD) {
    return denyPlanRun({
      action: 'pause',
      reason: 'leader_only',
      message: 'Cannot pause PlanRun: only team-lead may pause a PlanRun.',
    })
  }
  if (!params.planRunId) {
    return denyPlanRun({
      action: 'pause',
      reason: 'planrun_id_required',
      message: 'Cannot pause PlanRun: planRunId is required.',
    })
  }
  const pauseReason = normalizeManualPauseReason(params.pauseReason)
  if (!pauseReason) {
    return denyPlanRun({
      action: 'pause',
      reason: 'unsupported_pause_reason',
      message: `Cannot pause PlanRun ${params.planRunId}: pauseReason must be leader_paused or validation_failed.`,
      details: { planRunId: params.planRunId, pauseReason: params.pauseReason ?? null },
    })
  }

  const pausedAt = deps.now?.() ?? Date.now()
  let denial: PlanRunApplicationResult | undefined
  let previousStatus: PlanRun['status'] | undefined
  let stepIndex: number | undefined
  let taskId: string | undefined
  const updated = deps.planRuns.writePlanRunMutation(teamName, latest => {
    const run = latest.planRuns?.[params.planRunId!]
    if (!run) {
      denial = denyPlanRun({
        action: 'pause',
        reason: 'planrun_not_found',
        message: `Cannot pause PlanRun: ${params.planRunId} was not found.`,
        details: { planRunId: params.planRunId },
      })
      return
    }
    if (run.status === 'done' || run.status === 'cancelled') {
      denial = denyPlanRun({
        action: 'pause',
        reason: 'planrun_terminal',
        message: `Cannot pause PlanRun ${run.id}: status is ${run.status}.`,
        details: { planRunId: run.id, status: run.status },
      })
      return
    }
    const step = run.steps[run.currentStepIndex]
    previousStatus = run.status
    stepIndex = step?.index
    taskId = run.activeTaskId ?? step?.taskId
    run.status = 'paused'
    run.pauseReason = pauseReason
    run.updatedAt = pausedAt
    latest.activePlanRunId = run.id
  })

  if (denial) return denial
  if (!updated) {
    return denyPlanRun({
      action: 'pause',
      reason: 'pause_write_failed',
      message: `Cannot pause PlanRun ${params.planRunId}: write failed.`,
      details: { planRunId: params.planRunId },
    })
  }

  const event = deps.planRuns.appendPlanRunEvent(teamName, {
    planRunId: params.planRunId,
    type: 'paused',
    by: actor,
    at: pausedAt,
    summary: `Paused PlanRun ${params.planRunId}: ${pauseReason}`,
    stepIndex,
    taskId,
    pauseReason,
    data: { source: 'agentteam_planrun_pause', previousStatus },
  })
  const summary = deps.planRuns.readPlanRunSummary(teamName, params.planRunId)
  return {
    text: `Paused PlanRun ${params.planRunId} with pauseReason=${pauseReason}; no tasks were created.`,
    details: {
      planRunId: params.planRunId,
      planRun: summary,
      event,
      pauseReason,
      taskCreated: false,
      assignmentSent: false,
      mailboxSent: false,
    },
    statusInvalidationRequested: true,
  }
}

function resumePlanRun(
  input: PlanRunApplicationInput,
  deps: PlanRunApplicationDeps,
): PlanRunApplicationResult {
  const { params, context } = input
  const { teamName, actor } = context
  if (actor !== TEAM_LEAD) {
    return denyPlanRun({
      action: 'resume',
      reason: 'leader_only',
      message: 'Cannot resume PlanRun: only team-lead may resume a PlanRun.',
    })
  }
  if (!params.planRunId) {
    return denyPlanRun({
      action: 'resume',
      reason: 'planrun_id_required',
      message: 'Cannot resume PlanRun: planRunId is required.',
    })
  }

  const resumedAt = deps.now?.() ?? Date.now()
  let denial: PlanRunApplicationResult | undefined
  let previousPauseReason: PlanRunPauseReason | undefined
  let nextStatus: PlanRun['status'] | undefined
  let stepIndex: number | undefined
  let taskId: string | undefined
  const updated = deps.planRuns.writePlanRunMutation(teamName, latest => {
    const run = latest.planRuns?.[params.planRunId!]
    if (!run) {
      denial = denyPlanRun({
        action: 'resume',
        reason: 'planrun_not_found',
        message: `Cannot resume PlanRun: ${params.planRunId} was not found.`,
        details: { planRunId: params.planRunId },
      })
      return
    }
    if (run.status !== 'paused') {
      denial = denyPlanRun({
        action: 'resume',
        reason: 'planrun_not_paused',
        message: `Cannot resume PlanRun ${run.id}: status is ${run.status}, not paused.`,
        details: { planRunId: run.id, status: run.status },
      })
      return
    }
    const step = run.steps[run.currentStepIndex]
    previousPauseReason = run.pauseReason
    nextStatus = resumeStatusForRun(run)
    stepIndex = step?.index
    taskId = run.activeTaskId ?? step?.taskId
    if (!run.activeTaskId && step?.taskId && nextStatus === 'active') run.activeTaskId = step.taskId
    run.status = nextStatus
    run.pauseReason = undefined
    run.updatedAt = resumedAt
    latest.activePlanRunId = run.id
  })

  if (denial) return denial
  if (!updated || !nextStatus) {
    return denyPlanRun({
      action: 'resume',
      reason: 'resume_write_failed',
      message: `Cannot resume PlanRun ${params.planRunId}: write failed.`,
      details: { planRunId: params.planRunId },
    })
  }

  const event = deps.planRuns.appendPlanRunEvent(teamName, {
    planRunId: params.planRunId,
    type: 'resumed',
    by: actor,
    at: resumedAt,
    summary: `Resumed PlanRun ${params.planRunId} to ${nextStatus}`,
    stepIndex,
    taskId,
    data: { source: 'agentteam_planrun_resume', previousPauseReason },
  })
  const summary = deps.planRuns.readPlanRunSummary(teamName, params.planRunId)
  return {
    text: `Resumed PlanRun ${params.planRunId} to ${nextStatus}; no tasks were created.`,
    details: {
      planRunId: params.planRunId,
      planRun: summary,
      event,
      taskCreated: false,
      assignmentSent: false,
      mailboxSent: false,
    },
    statusInvalidationRequested: true,
  }
}

function cancelPlanRun(
  input: PlanRunApplicationInput,
  deps: PlanRunApplicationDeps,
): PlanRunApplicationResult {
  const { params, context } = input
  const { teamName, actor } = context
  if (actor !== TEAM_LEAD) {
    return denyPlanRun({
      action: 'cancel',
      reason: 'leader_only',
      message: 'Cannot cancel PlanRun: only team-lead may cancel a PlanRun.',
    })
  }
  if (!params.planRunId) {
    return denyPlanRun({
      action: 'cancel',
      reason: 'planrun_id_required',
      message: 'Cannot cancel PlanRun: planRunId is required.',
    })
  }

  const cancelledAt = deps.now?.() ?? Date.now()
  let denial: PlanRunApplicationResult | undefined
  let previousStatus: PlanRun['status'] | undefined
  let previousPauseReason: PlanRunPauseReason | undefined
  let stepIndex: number | undefined
  let taskId: string | undefined
  const updated = deps.planRuns.writePlanRunMutation(teamName, latest => {
    const run = latest.planRuns?.[params.planRunId!]
    if (!run) {
      denial = denyPlanRun({
        action: 'cancel',
        reason: 'planrun_not_found',
        message: `Cannot cancel PlanRun: ${params.planRunId} was not found.`,
        details: { planRunId: params.planRunId },
      })
      return
    }
    if (run.status === 'done' || run.status === 'cancelled') {
      denial = denyPlanRun({
        action: 'cancel',
        reason: 'planrun_terminal',
        message: `Cannot cancel PlanRun ${run.id}: status is ${run.status}.`,
        details: { planRunId: run.id, status: run.status },
      })
      return
    }
    const step = run.steps[run.currentStepIndex]
    previousStatus = run.status
    previousPauseReason = run.pauseReason
    stepIndex = step?.index
    taskId = run.activeTaskId ?? step?.taskId
    run.status = 'cancelled'
    run.pauseReason = undefined
    run.updatedAt = cancelledAt
    if (latest.activePlanRunId === run.id) latest.activePlanRunId = undefined
  })

  if (denial) return denial
  if (!updated) {
    return denyPlanRun({
      action: 'cancel',
      reason: 'cancel_write_failed',
      message: `Cannot cancel PlanRun ${params.planRunId}: write failed.`,
      details: { planRunId: params.planRunId },
    })
  }

  const event = deps.planRuns.appendPlanRunEvent(teamName, {
    planRunId: params.planRunId,
    type: 'cancelled',
    by: actor,
    at: cancelledAt,
    summary: `Cancelled PlanRun ${params.planRunId}`,
    stepIndex,
    taskId,
    data: { source: 'agentteam_planrun_cancel', previousStatus, previousPauseReason },
  })
  const summary = deps.planRuns.readPlanRunSummary(teamName, params.planRunId)
  return {
    text: `Cancelled PlanRun ${params.planRunId}; no tasks were created or closed.`,
    details: {
      planRunId: params.planRunId,
      planRun: summary,
      event,
      taskCreated: false,
      taskClosed: false,
      assignmentSent: false,
      mailboxSent: false,
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
  const nextAction = nextActionForPlanRunSummary(run)
  return {
    text: formatPlanRunDetails(run),
    details: { planRun: withNextAction(run), planRunId: run.id, nextAction },
  }
}

function listPlanRuns(deps: PlanRunApplicationDeps, teamName: string): PlanRunApplicationResult {
  const runs = deps.planRuns.listPlanRuns(teamName)
  const lines = runs.length
    ? [`PlanRuns for ${teamName}: ${runs.length}`, ...runs.map(formatPlanRunLine)]
    : [`PlanRuns for ${teamName}: 0`]
  return {
    text: lines.join('\n'),
    details: { planRuns: runs.map(withNextAction), count: runs.length },
  }
}

export function executePlanRunApplication(
  input: PlanRunApplicationInput,
  deps: PlanRunApplicationDeps,
): PlanRunApplicationResult {
  if (input.params.dryRun === true) {
    if (input.params.action === 'advance' || input.params.action === 'pause' || input.params.action === 'resume' || input.params.action === 'cancel') {
      return dryRunPlanRun(input, deps)
    }
  }
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
      return pausePlanRun(input, deps)
    case 'resume':
      return resumePlanRun(input, deps)
    case 'cancel':
      return cancelPlanRun(input, deps)
    default:
      throw new Error(`Unsupported PlanRun action ${(input.params as { action: string }).action}`)
  }
}
