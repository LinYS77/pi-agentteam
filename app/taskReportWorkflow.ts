import { transitionTask } from '../core/taskReducer.js'
import { TEAM_LEAD } from '../internalTypes.js'
import { defaultThreadIdForTask } from '../protocol.js'
import { compactTaskHistorySummary } from '../state/taskHistoryReadModel.js'
import { planTaskReportAttention } from './messageApplication.js'
import {
  appendTaskEventHistory,
  appendTaskReportHistory,
  applyReducerTransition,
  noteText,
  reducerTaskSnapshot,
  requireTask,
  requireUpdatedTeam,
  taskStatusAtReport,
  taskTransitionFailure,
  unsupportedBlockedByParam,
  unsupportedStatusParam,
} from './taskCommandShared.js'
import { buildImplementationCompletionNote } from './taskFormatting.js'
import { actorRole } from './taskPermissions.js'
import type { TaskCommandContext, TaskCommandResult, TeamTaskInput } from './taskTypes.js'

function denyNonOwnerReport(task: ReturnType<typeof requireTask>, actor: string, action: 'report_done' | 'report_blocked'): TaskCommandResult {
  return {
    task,
    text: `Cannot ${action} ${task.id}: ${actor} is not the task owner${task.owner ? ` (${task.owner})` : ''}. Non-owners should use agentteam_send type=inform/question for context.`,
    details: {
      task,
      denied: true,
      reason: 'task_reporter_not_owner',
      action,
      taskId: task.id,
      actor,
      taskOwner: task.owner ?? null,
    },
  }
}

export function reportDoneTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'report_done')
  if (unsupportedStatus) return unsupportedStatus
  const unsupportedBlockedBy = unsupportedBlockedByParam(params, 'report_done')
  if (unsupportedBlockedBy) return unsupportedBlockedBy
  const existingTask = requireTask(input.team, taskId)
  const transitionAt = Date.now()
  const initialTransition = transitionTask(reducerTaskSnapshot(existingTask), {
    type: 'report_done',
    at: transitionAt,
    actor: input.actor,
    note: params.note,
  })
  if (!initialTransition.ok) return taskTransitionFailure(existingTask, 'report_done', initialTransition.reason)
  if (input.actor !== TEAM_LEAD && input.actor !== existingTask.owner) {
    return denyNonOwnerReport(existingTask, input.actor, 'report_done')
  }
  let leaderWake: TaskCommandResult['leaderWake']
  let leaderMailbox: TaskCommandResult['leaderMailbox']
  const reportAttention = planTaskReportAttention('report_done')
  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const ownerAtReport = task.owner
    const statusAtReport = taskStatusAtReport(task)
    const reporterIsOwner = input.actor === task.owner
    const role = actorRole(latest, input.actor)
    const note = role === 'implementer'
      ? buildImplementationCompletionNote(params.note)
      : noteText(params, 'Done report')
    const transition = applyReducerTransition(task, {
      type: 'report_done',
      at: transitionAt,
      actor: input.actor,
      note,
    })
    if (!transition.ok) throw new Error(transition.reason)
    const threadId = defaultThreadIdForTask(task.id)
    const report = appendTaskReportHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'report_done',
      author: input.actor,
      text: note,
      summary: compactTaskHistorySummary(note),
      createdAt: transitionAt,
      threadId,
      reporterIsOwner,
      statusAtReport,
      ownerAtReport,
      metadata: { source: 'agentteam_task_dual_write' },
    })
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'report_submitted',
      by: input.actor,
      at: transitionAt,
      summary: compactTaskHistorySummary(note),
      reportId: report.id,
      data: { source: 'agentteam_task_dual_write', reportType: 'report_done' },
    })
    if (input.actor !== TEAM_LEAD) {
      leaderMailbox = {
        message: {
          from: input.actor,
          to: TEAM_LEAD,
          text: `${task.id} done report by ${input.actor}: ${task.title}`,
          summary: `${task.id} done report: ${report.summary}`,
          type: 'report_done',
          taskId: task.id,
          threadId: defaultThreadIdForTask(task.id),
          priority: 'normal',
          wakeHint: reportAttention.wakeHint,
          metadata: { reportOnly: true, reporterIsOwner: true, reportId: report.id, ...reportAttention.metadata },
        },
      }
      leaderWake = {
        type: 'report_done',
        wakeHint: reportAttention.wakeHint,
        from: input.actor,
        summary: `${task.id} done report`,
        text: `${task.id} done report by ${input.actor}: ${task.title}`,
      }
    }
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return {
    task,
    text: input.actor === TEAM_LEAD ? `Recorded done report for ${task.id}` : `Reported done for ${task.id} to ${TEAM_LEAD}`,
    details: { task, reportOnly: true, reporterIsOwner: true },
    leaderWake,
    wakeTeam: updated,
    leaderMailbox,
  }
}

export function reportBlockedTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'report_blocked')
  if (unsupportedStatus) return unsupportedStatus
  const existingTask = requireTask(input.team, taskId)
  const transitionAt = Date.now()
  const initialTransition = transitionTask(reducerTaskSnapshot(existingTask), {
    type: 'report_blocked',
    at: transitionAt,
    actor: input.actor,
    note: params.note,
  })
  if (!initialTransition.ok) return taskTransitionFailure(existingTask, 'report_blocked', initialTransition.reason)
  if (input.actor !== TEAM_LEAD && input.actor !== existingTask.owner) {
    return denyNonOwnerReport(existingTask, input.actor, 'report_blocked')
  }
  let leaderWake: TaskCommandResult['leaderWake']
  let leaderMailbox: TaskCommandResult['leaderMailbox']
  const reportAttention = planTaskReportAttention('report_blocked')
  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const ownerAtReport = task.owner
    const statusAtReport = taskStatusAtReport(task)
    const reporterIsOwner = input.actor === task.owner
    const blockerText = params.blockedBy?.length
      ? `Blocked by: ${params.blockedBy.join(', ')}`
      : undefined
    const note = [noteText(params, 'Blocked report'), blockerText].filter(Boolean).join('\n')
    const transition = applyReducerTransition(task, {
      type: 'report_blocked',
      at: transitionAt,
      actor: input.actor,
      note,
    })
    if (!transition.ok) throw new Error(transition.reason)
    const threadId = defaultThreadIdForTask(task.id)
    const report = appendTaskReportHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'report_blocked',
      author: input.actor,
      text: note,
      summary: compactTaskHistorySummary(note),
      createdAt: transitionAt,
      threadId,
      reporterIsOwner,
      reportedBlockedBy: params.blockedBy ?? [],
      statusAtReport,
      ownerAtReport,
      metadata: { source: 'agentteam_task_dual_write' },
    })
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'report_submitted',
      by: input.actor,
      at: transitionAt,
      summary: compactTaskHistorySummary(note),
      reportId: report.id,
      data: { source: 'agentteam_task_dual_write', reportType: 'report_blocked', reportedBlockedBy: params.blockedBy ?? [] },
    })
    if (input.actor !== TEAM_LEAD) {
      leaderMailbox = {
        message: {
          from: input.actor,
          to: TEAM_LEAD,
          text: `${task.id} blocked report by ${input.actor}: ${task.title}`,
          summary: `${task.id} blocked report: ${report.summary}`,
          type: 'report_blocked',
          taskId: task.id,
          threadId: defaultThreadIdForTask(task.id),
          priority: 'high',
          wakeHint: reportAttention.wakeHint,
          metadata: {
            reportOnly: true,
            ...reportAttention.metadata,
            reportId: report.id,
            reportedBlockedBy: params.blockedBy ?? [],
            reporterIsOwner: true,
          },
        },
      }
      leaderWake = {
        type: 'report_blocked',
        wakeHint: reportAttention.wakeHint,
        from: input.actor,
        summary: `${task.id} blocked report`,
        text: `${task.id} blocked report by ${input.actor}: ${task.title}`,
      }
    }
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return {
    task,
    text: input.actor === TEAM_LEAD ? `Recorded blocked report for ${task.id}` : `Reported blocked status for ${task.id} to ${TEAM_LEAD}`,
    details: { task, reportOnly: true, reportedBlockedBy: params.blockedBy ?? [], reporterIsOwner: true },
    leaderWake,
    wakeTeam: updated,
    leaderMailbox,
  }
}
