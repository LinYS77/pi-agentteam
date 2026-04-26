import { createTask, pushMailboxMessage, updateTeamState } from '../state.js'
import { defaultThreadIdForTask } from '../protocol.js'
import { TEAM_LEAD } from '../types.js'
import { formatTask } from './shared.js'
import {
  actorRole,
  buildImplementationCompletionNote,
  canCompleteTask,
} from './taskPolicy.js'
import type { TaskCommandContext, TaskCommandResult, TeamTaskInput } from './taskTypes.js'

function requireUpdatedTeam(team: TaskCommandContext['team'] | null, teamName: string): TaskCommandContext['team'] {
  if (!team) throw new Error(`Team ${teamName} no longer exists`)
  return team
}

function requireTask(team: TaskCommandContext['team'], taskId: string) {
  const task = team.tasks[taskId]
  if (!task) throw new Error(`Task ${taskId} not found`)
  return task
}

export function listTasksCommand(input: TaskCommandContext): TaskCommandResult {
  const text =
    Object.values(input.team.tasks)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(formatTask)
      .join('\n') || 'No tasks'
  return { text, details: { count: Object.keys(input.team.tasks).length } }
}

export function createTaskCommand(input: TaskCommandContext, params: TeamTaskInput): TaskCommandResult {
  if (!params.title || !params.description) {
    throw new Error('title and description are required')
  }

  let createdTaskId = ''
  const updated = requireUpdatedTeam(updateTeamState(input.teamName, latest => {
    const task = createTask(latest, {
      title: params.title!,
      description: params.description!,
      blockedBy: params.blockedBy,
    })
    createdTaskId = task.id
    input.deps.appendStructuredTaskNote(task, input.actor, 'Task created', {
      messageType: 'assignment',
      threadId: defaultThreadIdForTask(task.id),
    })
  }), input.teamName)
  const task = requireTask(updated, createdTaskId)
  return { task, text: `Created ${formatTask(task)}`, details: { task } }
}

export function claimTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const updated = requireUpdatedTeam(updateTeamState(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const owner = params.owner !== undefined ? input.deps.normalizeOwnerName(params.owner) : input.actor
    if (!owner) throw new Error('owner cannot be empty')
    input.deps.assertValidOwner(latest, owner)
    task.owner = owner
    task.status = 'in_progress'
    task.updatedAt = Date.now()
    input.deps.appendStructuredTaskNote(task, input.actor, `Claimed by ${owner}`, {
      messageType: 'assignment',
      threadId: defaultThreadIdForTask(task.id),
    })
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return { task, text: `Claimed ${formatTask(task)}`, details: { task } }
}

export function updateTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const role = actorRole(input.team, input.actor)
  if (role === 'planner' && params.status === 'completed') {
    return {
      text: `Planner should close ${taskId} via agentteam_task action=complete (not update status=completed) so completion notes remain explicit.`,
      details: { denied: true, action: 'update', status: 'completed', actor: input.actor },
    }
  }

  let leaderWake: TaskCommandResult['leaderWake']
  const updated = requireUpdatedTeam(updateTeamState(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    if (params.title) task.title = params.title
    if (params.description) task.description = params.description
    if (params.owner !== undefined) {
      const owner = input.deps.normalizeOwnerName(params.owner)
      if (!owner) {
        task.owner = undefined
      } else {
        input.deps.assertValidOwner(latest, owner)
        task.owner = owner
      }
    }
    if (params.status) task.status = params.status
    if (params.blockedBy) task.blockedBy = params.blockedBy
    task.updatedAt = Date.now()
    const note = params.note ?? 'Task updated'
    input.deps.appendStructuredTaskNote(task, input.actor, note, {
      messageType: task.status === 'blocked' ? 'blocked' : 'fyi',
      threadId: defaultThreadIdForTask(task.id),
    })

    if (task.status === 'blocked' && input.actor !== TEAM_LEAD) {
      const blockedMessage = pushMailboxMessage(latest.name, TEAM_LEAD, {
        from: input.actor,
        to: TEAM_LEAD,
        text: `${task.id} is blocked. ${note}`,
        summary: `${task.id} blocked`,
        type: 'blocked',
        taskId: task.id,
        threadId: defaultThreadIdForTask(task.id),
        priority: 'high',
        wakeHint: 'hard',
        metadata: {
          blockedBy: task.blockedBy,
        },
      })
      input.deps.maybeLinkTaskNoteToMessage(task, input.actor, {
        text: `${task.id} is blocked. ${note}`,
        type: 'blocked',
        taskId: task.id,
        threadId: defaultThreadIdForTask(task.id),
        metadata: {
          blockedBy: task.blockedBy,
          linkedMailboxMessageId: blockedMessage.id,
          to: TEAM_LEAD,
        },
      })
      leaderWake = {
        type: 'blocked',
        wakeHint: 'hard',
        from: input.actor,
        summary: `${task.id} blocked`,
        text: `${task.id} is blocked. ${note}`,
      }
    }
  }), input.teamName)

  const task = requireTask(updated, taskId)
  return {
    task,
    text: `Updated ${formatTask(task)}`,
    details: { task },
    leaderWake,
    wakeTeam: updated,
    wakeWorkerName: task.owner && task.owner !== TEAM_LEAD && updated.members[task.owner] && updated.members[task.owner]!.status !== 'running'
      ? task.owner
      : undefined,
  }
}

export function noteTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  let leaderWake: TaskCommandResult['leaderWake']
  const updated = requireUpdatedTeam(updateTeamState(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    input.deps.appendStructuredTaskNote(task, input.actor, params.note ?? 'Note added', {
      messageType: 'fyi',
      threadId: defaultThreadIdForTask(task.id),
    })
    if (input.actor !== TEAM_LEAD) {
      const noteSummary = `${task.id} note from ${input.actor}`
      const noteText = `${task.id} note by ${input.actor}: ${params.note ?? 'Note added'}`
      const noteMessage = pushMailboxMessage(latest.name, TEAM_LEAD, {
        from: input.actor,
        to: TEAM_LEAD,
        text: noteText,
        summary: noteSummary,
        type: 'fyi',
        taskId: task.id,
        threadId: defaultThreadIdForTask(task.id),
        priority: 'normal',
        wakeHint: 'soft',
      })
      input.deps.maybeLinkTaskNoteToMessage(task, input.actor, {
        text: noteText,
        type: 'fyi',
        taskId: task.id,
        threadId: defaultThreadIdForTask(task.id),
        metadata: {
          linkedMailboxMessageId: noteMessage.id,
          to: TEAM_LEAD,
        },
      })
      leaderWake = {
        type: 'fyi',
        wakeHint: 'soft',
        from: input.actor,
        summary: noteSummary,
        text: noteText,
      }
    }
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return { task, text: `Noted on ${task.id}`, details: { task }, leaderWake, wakeTeam: updated }
}

export function completeTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  let leaderWake: TaskCommandResult['leaderWake']
  let alreadyCompleted = false
  const updated = requireUpdatedTeam(updateTeamState(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    if (!canCompleteTask({ actor: input.actor, owner: task.owner })) {
      throw new Error(`Only owner ${task.owner ?? '(none)'} or ${TEAM_LEAD} can complete ${task.id}`)
    }
    if (task.status === 'completed') {
      alreadyCompleted = true
      return
    }
    const role = actorRole(latest, input.actor)

    task.status = 'completed'
    task.updatedAt = Date.now()
    const note = role === 'implementer'
      ? buildImplementationCompletionNote(params.note)
      : (params.note ?? 'Task completed')
    input.deps.appendStructuredTaskNote(task, input.actor, note, {
      messageType: 'completion_report',
      threadId: defaultThreadIdForTask(task.id),
    })
    if (input.actor !== TEAM_LEAD) {
      const completionMessage = pushMailboxMessage(latest.name, TEAM_LEAD, {
        from: input.actor,
        to: TEAM_LEAD,
        text: `${task.id} completed by ${input.actor}: ${task.title}\n\n${note}`,
        summary: `${task.id} completed`,
        type: 'completion_report',
        taskId: task.id,
        threadId: defaultThreadIdForTask(task.id),
        priority: 'normal',
        wakeHint: 'hard',
      })
      input.deps.maybeLinkTaskNoteToMessage(task, input.actor, {
        text: `${task.id} completed by ${input.actor}: ${task.title}`,
        type: 'completion_report',
        taskId: task.id,
        threadId: defaultThreadIdForTask(task.id),
        metadata: {
          linkedMailboxMessageId: completionMessage.id,
          to: TEAM_LEAD,
        },
      })
      leaderWake = {
        type: 'completion_report',
        wakeHint: 'hard',
        from: input.actor,
        summary: `${task.id} completed`,
        text: `${task.id} completed by ${input.actor}: ${task.title}`,
      }
    }
  }), input.teamName)
  const task = requireTask(updated, taskId)
  if (alreadyCompleted) {
    return { task, text: `Already completed ${formatTask(task)}`, details: { task, alreadyCompleted: true } }
  }
  return { task, text: `Completed ${formatTask(task)}`, details: { task }, leaderWake, wakeTeam: updated }
}
