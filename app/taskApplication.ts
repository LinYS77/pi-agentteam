import { ensureTaskPrivilege } from './taskPermissions.js'
import { assignTaskCommand, blockTaskCommand, closeTaskCommand, createTaskCommand, progressTaskCommand, unblockTaskCommand } from './taskMutationCommands.js'
import { historyTaskCommand, listTasksCommand, reportTaskCommand, reportsTaskCommand, showTaskCommand } from './taskReadCommands.js'
import { reportBlockedTaskCommand, reportDoneTaskCommand } from './taskReportWorkflow.js'
import { handleTaskApplicationSideEffects } from './taskSideEffects.js'
import type { TaskApplicationDeps } from './types.js'
import type { TaskApplicationInput, TaskApplicationResult, TaskCommandContext, TaskCommandResult } from './taskTypes.js'

export { actorRole, ensureTaskPrivilege } from './taskPermissions.js'

export async function executeTaskApplication(
  input: TaskApplicationInput,
  deps: TaskApplicationDeps,
): Promise<TaskApplicationResult> {
  const { params, context } = input
  const { team, actor } = context
  const teamName = team.name
  const denied = ensureTaskPrivilege(team, actor, params.action)
  if (denied) {
    const result: TaskCommandResult = { text: denied, details: { denied: true, action: params.action, actor } }
    await handleTaskApplicationSideEffects(result, deps)
    return { text: result.text, details: result.details, sideEffectWarnings: result.sideEffectWarnings, statusInvalidationRequested: true }
  }

  const commandContext: TaskCommandContext = { team, teamName, actor, deps }
  if (params.action === 'list') {
    const result = listTasksCommand(commandContext, params)
    return { text: result.text, details: result.details, sideEffectWarnings: result.sideEffectWarnings }
  }

  if (params.action === 'report') {
    const result = reportTaskCommand(commandContext, params)
    return { text: result.text, details: result.details, sideEffectWarnings: result.sideEffectWarnings }
  }

  if (params.action === 'create') {
    const result = createTaskCommand(commandContext, params)
    await handleTaskApplicationSideEffects(result, deps)
    return { text: result.text, details: result.details, sideEffectWarnings: result.sideEffectWarnings, statusInvalidationRequested: true }
  }

  if (!params.taskId) throw new Error('taskId is required for this action')
  const taskId = params.taskId

  let result: TaskCommandResult
  switch (params.action) {
    case 'show':
      result = showTaskCommand(commandContext, taskId)
      break
    case 'history':
      result = historyTaskCommand(commandContext, taskId, params)
      break
    case 'reports':
      result = reportsTaskCommand(commandContext, taskId)
      break
    case 'assign':
      result = assignTaskCommand(commandContext, taskId, params)
      break
    case 'block':
      result = blockTaskCommand(commandContext, taskId, params)
      break
    case 'unblock':
      result = unblockTaskCommand(commandContext, taskId, params)
      break
    case 'close':
      result = closeTaskCommand(commandContext, taskId, params)
      break
    case 'progress':
      result = progressTaskCommand(commandContext, taskId, params)
      break
    case 'report_done':
      result = reportDoneTaskCommand(commandContext, taskId, params)
      break
    case 'report_blocked':
      result = reportBlockedTaskCommand(commandContext, taskId, params)
      break
    default:
      throw new Error(`Unsupported action ${(params as { action: string }).action}`)
  }

  if (params.action === 'show' || params.action === 'history' || params.action === 'reports') {
    return { text: result.text, details: result.details, sideEffectWarnings: result.sideEffectWarnings }
  }

  await handleTaskApplicationSideEffects(result, deps)
  return { text: result.text, details: result.details, sideEffectWarnings: result.sideEffectWarnings, statusInvalidationRequested: true }
}
