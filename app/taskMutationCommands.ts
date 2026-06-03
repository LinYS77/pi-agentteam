import { transitionTask } from '../core/taskReducer.js'
import { compactTaskHistorySummary } from '../state/taskHistoryReadModel.js'
import {
  appendTaskEventHistory,
  applyReducerTransition,
  noteText,
  reducerTaskSnapshot,
  requireTask,
  requireUpdatedTeam,
  resolveTaskOwner,
  taskTransitionFailure,
  unsupportedBlockedByParam,
  unsupportedStatusParam,
} from './taskCommandShared.js'
import { buildImplementationCompletionNote, formatTask } from './taskFormatting.js'
import { actorRole } from './taskPermissions.js'
import type { TaskCommandContext, TaskCommandResult, TeamTaskInput } from './taskTypes.js'

export function createTaskCommand(input: TaskCommandContext, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'create')
  if (unsupportedStatus) return unsupportedStatus
  const unsupportedBlockedBy = unsupportedBlockedByParam(params, 'create')
  if (unsupportedBlockedBy) return unsupportedBlockedBy
  if (!params.title || !params.description) {
    throw new Error('title and description are required')
  }
  let createdTaskId = ''
  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const owner = params.owner !== undefined
      ? resolveTaskOwner(input, latest, params.owner)
      : undefined
    const task = input.deps.taskMutations.createTask(latest, {
      title: params.title!,
      description: params.description!,
      owner,
    })
    createdTaskId = task.id
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'created',
      by: input.actor,
      at: task.createdAt,
      summary: 'Task created',
      data: { source: 'agentteam_task_dual_write' },
    })
    if (owner) {
      appendTaskEventHistory({ ...input, team: latest }, {
        taskId: task.id,
        type: 'assigned',
        by: input.actor,
        at: task.updatedAt,
        summary: `Assigned to ${owner} on create`,
        data: { source: 'agentteam_task_dual_write', newOwner: owner, onCreate: true },
      })
    }
  }), input.teamName)
  const task = requireTask(updated, createdTaskId)
  return { task, text: `Created ${formatTask(task)}`, details: { task } }
}

export function assignTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'assign')
  if (unsupportedStatus) return unsupportedStatus
  const unsupportedBlockedBy = unsupportedBlockedByParam(params, 'assign')
  if (unsupportedBlockedBy) return unsupportedBlockedBy
  const existingTask = requireTask(input.team, taskId)
  const owner = resolveTaskOwner(input, input.team, params.owner, input.actor)
  const transitionAt = Date.now()
  const initialTransition = transitionTask(reducerTaskSnapshot(existingTask), { type: 'assign', owner, at: transitionAt })
  if (!initialTransition.ok) return taskTransitionFailure(existingTask, 'assign', initialTransition.reason)

  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const previousOwner = task.owner
    const transition = applyReducerTransition(task, { type: 'assign', owner, at: transitionAt })
    if (!transition.ok) throw new Error(transition.reason)
    const note = noteText(params, `Assigned to ${owner}`)
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'assigned',
      by: input.actor,
      at: transitionAt,
      summary: compactTaskHistorySummary(note),
      data: { source: 'agentteam_task_dual_write', previousOwner, newOwner: owner },
    })
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return { task, text: `Assigned ${formatTask(task)}`, details: { task } }
}

export function blockTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'block')
  if (unsupportedStatus) return unsupportedStatus
  const existingTask = requireTask(input.team, taskId)
  const transitionAt = Date.now()
  const initialTransition = transitionTask(reducerTaskSnapshot(existingTask), { type: 'block', at: transitionAt })
  if (!initialTransition.ok) return taskTransitionFailure(existingTask, 'block', initialTransition.reason)

  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const transition = applyReducerTransition(task, { type: 'block', at: transitionAt })
    if (!transition.ok) throw new Error(transition.reason)
    task.blockedBy = params.blockedBy ?? []
    const note = noteText(params, 'Task blocked')
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'blocked',
      by: input.actor,
      at: transitionAt,
      summary: compactTaskHistorySummary(note),
      data: { source: 'agentteam_task_dual_write', blockedBy: task.blockedBy },
    })
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return { task, text: `Blocked ${formatTask(task)}`, details: { task } }
}

export function unblockTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'unblock')
  if (unsupportedStatus) return unsupportedStatus
  const unsupportedBlockedBy = unsupportedBlockedByParam(params, 'unblock')
  if (unsupportedBlockedBy) return unsupportedBlockedBy
  const existingTask = requireTask(input.team, taskId)
  const transitionAt = Date.now()
  const initialTransition = transitionTask(reducerTaskSnapshot(existingTask), { type: 'unblock', at: transitionAt })
  if (!initialTransition.ok) return taskTransitionFailure(existingTask, 'unblock', initialTransition.reason)

  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const previousBlockedBy = [...task.blockedBy]
    const transition = applyReducerTransition(task, { type: 'unblock', at: transitionAt })
    if (!transition.ok) throw new Error(transition.reason)
    task.blockedBy = []
    const note = noteText(params, 'Task unblocked')
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'unblocked',
      by: input.actor,
      at: transitionAt,
      summary: compactTaskHistorySummary(note),
      data: { source: 'agentteam_task_dual_write', previousBlockedBy },
    })
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return { task, text: `Unblocked ${formatTask(task)}`, details: { task } }
}

export function closeTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'close')
  if (unsupportedStatus) return unsupportedStatus
  const unsupportedBlockedBy = unsupportedBlockedByParam(params, 'close')
  if (unsupportedBlockedBy) return unsupportedBlockedBy
  const existingTask = requireTask(input.team, taskId)
  const transitionAt = Date.now()
  const initialTransition = transitionTask(reducerTaskSnapshot(existingTask), { type: 'close', at: transitionAt })
  if (!initialTransition.ok) return taskTransitionFailure(existingTask, 'close', initialTransition.reason)

  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const previousStatus = task.status
    const previousBlockedBy = [...task.blockedBy]
    const transition = applyReducerTransition(task, { type: 'close', at: transitionAt })
    if (!transition.ok) throw new Error(transition.reason)
    const role = actorRole(latest, input.actor)
    const note = role === 'implementer'
      ? buildImplementationCompletionNote(params.note)
      : noteText(params, 'Task closed')
    task.blockedBy = []
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'closed',
      by: input.actor,
      at: transitionAt,
      summary: compactTaskHistorySummary(note),
      data: { source: 'agentteam_task_dual_write', previousStatus, previousBlockedBy },
    })
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return { task, text: `Closed ${formatTask(task)}`, details: { task } }
}

export function progressTaskCommand(input: TaskCommandContext, taskId: string, params: TeamTaskInput): TaskCommandResult {
  const unsupportedStatus = unsupportedStatusParam(params, 'progress')
  if (unsupportedStatus) return unsupportedStatus
  const unsupportedBlockedBy = unsupportedBlockedByParam(params, 'progress')
  if (unsupportedBlockedBy) return unsupportedBlockedBy
  const at = Date.now()
  const updated = requireUpdatedTeam(input.deps.teamState.updateTeam(input.teamName, latest => {
    const task = requireTask(latest, taskId)
    const progress = noteText(params, 'Progress recorded')
    appendTaskEventHistory({ ...input, team: latest }, {
      taskId: task.id,
      type: 'progress',
      by: input.actor,
      at,
      summary: compactTaskHistorySummary(progress),
      data: { source: 'agentteam_task_progress' },
    })
  }), input.teamName)
  const task = requireTask(updated, taskId)
  return { task, text: `Recorded progress on ${task.id}`, details: { task } }
}
