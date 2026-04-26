import type { ExtensionContext } from '@mariozechner/pi-coding-agent'
import type { ToolHandlerDeps } from './shared.js'
import { ensureTaskPrivilege } from './taskPolicy.js'
import type { TeamTaskInput, TaskCommandResult } from './taskTypes.js'
import {
  claimTaskCommand,
  completeTaskCommand,
  createTaskCommand,
  listTasksCommand,
  noteTaskCommand,
  updateTaskCommand,
} from './taskCommands.js'

export type { TeamTaskAction, TeamTaskInput } from './taskTypes.js'

async function handleTaskCommandSideEffects(result: TaskCommandResult, ctx: ExtensionContext, deps: ToolHandlerDeps): Promise<void> {
  if (result.leaderWake && result.wakeTeam) {
    await deps.wakeLeaderIfNeeded(result.wakeTeam, result.leaderWake)
  }
  if (result.wakeWorkerName && result.wakeTeam) {
    await deps.wakeWorker(result.wakeTeam, result.wakeWorkerName)
  }
  deps.invalidateStatus(ctx)
}

export async function executeTaskAction(
  params: TeamTaskInput,
  ctx: ExtensionContext,
  deps: ToolHandlerDeps,
) {
  const team = deps.ensureTeamForSession(ctx)
  if (!team) {
    return { content: [{ type: 'text', text: 'No current team context.' }], details: {} }
  }
  const teamName = team.name
  const actor = deps.currentActor(ctx)
  const denied = ensureTaskPrivilege(team, actor, params.action)
  if (denied) {
    return { content: [{ type: 'text', text: denied }], details: { denied: true, action: params.action, actor } }
  }

  const commandContext = { team, teamName, actor, deps }
  if (params.action === 'list') {
    const result = listTasksCommand(commandContext)
    return { content: [{ type: 'text', text: result.text }], details: result.details }
  }

  if (params.action === 'create') {
    const result = createTaskCommand(commandContext, params)
    await handleTaskCommandSideEffects(result, ctx, deps)
    return { content: [{ type: 'text', text: result.text }], details: result.details }
  }

  if (!params.taskId) throw new Error('taskId is required for this action')
  const taskId = params.taskId

  let result: TaskCommandResult
  switch (params.action) {
    case 'claim':
      result = claimTaskCommand(commandContext, taskId, params)
      break
    case 'update':
      result = updateTaskCommand(commandContext, taskId, params)
      break
    case 'note':
      result = noteTaskCommand(commandContext, taskId, params)
      break
    case 'complete':
      result = completeTaskCommand(commandContext, taskId, params)
      break
    default:
      throw new Error(`Unsupported action ${params.action}`)
  }

  await handleTaskCommandSideEffects(result, ctx, deps)
  return { content: [{ type: 'text', text: result.text }], details: result.details }
}
