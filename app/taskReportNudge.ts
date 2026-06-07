import { TEAM_LEAD } from '../internalTypes.js'
import { defaultThreadIdForTask } from '../protocol.js'
import { buildReportWatchdogSummary } from '../state/taskReportWatchdogReadModel.js'
import { requireTask, unsupportedBlockedByParam, unsupportedStatusParam } from './taskCommandShared.js'
import type { TaskCommandContext, TaskCommandResult, TeamTaskInput } from './taskTypes.js'

function denyNudge(input: {
  task: ReturnType<typeof requireTask>
  reason: string
  message: string
  details?: Record<string, unknown>
}): TaskCommandResult {
  return {
    task: input.task,
    text: input.message,
    details: {
      task: input.task,
      denied: true,
      reason: input.reason,
      action: 'nudge_report',
      taskId: input.task.id,
      ...input.details,
    },
  }
}

function reportNudgeText(taskId: string): string {
  return [
    `Please report status for ${taskId}.`,
    '',
    `Use agentteam_task action=report_done taskId=${taskId} when the task is ready for leader review.`,
    `Use agentteam_task action=report_blocked taskId=${taskId} when you are blocked and need leader action.`,
    'Progress updates are compact local activity only and do not notify team-lead.',
  ].join('\n')
}

export function nudgeReportTaskCommand(
  input: TaskCommandContext,
  taskId: string,
  params: TeamTaskInput,
): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'nudge_report')
  if (unsupportedStatus) return unsupportedStatus
  const unsupportedBlockedBy = unsupportedBlockedByParam(params, 'nudge_report')
  if (unsupportedBlockedBy) return unsupportedBlockedBy

  const task = requireTask(input.team, taskId)
  if (task.status !== 'open') {
    return denyNudge({
      task,
      reason: 'invalid_task_status',
      message: `Cannot nudge_report ${task.id}: expected open, got ${task.status}.`,
      details: { status: task.status, expected: 'open' },
    })
  }
  if (!task.owner) {
    return denyNudge({
      task,
      reason: 'task_owner_missing',
      message: `Cannot nudge_report ${task.id}: task has no owner.`,
    })
  }
  if (task.owner === TEAM_LEAD) {
    return denyNudge({
      task,
      reason: 'task_owner_is_leader',
      message: `Cannot nudge_report ${task.id}: task is owned by team-lead.`,
      details: { owner: task.owner },
    })
  }
  if (!input.team.members[task.owner]) {
    return denyNudge({
      task,
      reason: 'task_owner_member_not_found',
      message: `Cannot nudge_report ${task.id}: owner ${task.owner} is not in the current team.`,
      details: { owner: task.owner },
    })
  }

  const watchdog = buildReportWatchdogSummary(input.team).tasks.find(item => item.taskId === task.id)
  if (!watchdog || watchdog.state !== 'waiting_for_report' || !watchdog.needsNudge) {
    return denyNudge({
      task,
      reason: 'report_not_waiting_for_owner',
      message: `Cannot nudge_report ${task.id}: report watchdog state is ${watchdog?.state ?? 'none'} and needsNudge=${watchdog?.needsNudge ?? false}.`,
      details: { reportWatchdog: watchdog },
    })
  }

  return {
    task,
    text: `Requested report from ${task.owner} for ${task.id}`,
    details: {
      task,
      reportWatchdog: watchdog,
      recipient: task.owner,
      type: 'question',
      summary: `${task.id} report requested`,
    },
    wakeTeam: input.team,
    ownerNudge: {
      recipient: task.owner,
      message: {
        from: TEAM_LEAD,
        to: task.owner,
        text: reportNudgeText(task.id),
        summary: `${task.id} report requested`,
        type: 'question',
        taskId: task.id,
        threadId: defaultThreadIdForTask(task.id),
        priority: 'high',
        wakeHint: 'soft',
        metadata: {
          source: 'agentteam_task_nudge_report',
          reportWatchdogState: watchdog.state,
          needsNudge: watchdog.needsNudge,
        },
      },
    },
  }
}
