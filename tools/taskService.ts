import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { executeTaskApplication } from '../app/taskApplication.js'
import type { TaskApplicationResult } from '../app/taskTypes.js'
import type { ToolHandlerDeps } from './shared.js'
import type { TeamTaskInput } from './taskTypes.js'

export type { TeamTaskAction, TeamTaskInput } from './taskTypes.js'

function taskApplicationResultToToolResponse(result: TaskApplicationResult) {
  return { content: [{ type: 'text' as const, text: result.text }], details: result.details }
}

export async function executeTaskAction(
  params: TeamTaskInput,
  ctx: ExtensionContext,
  deps: ToolHandlerDeps,
) {
  const result = await executeTaskApplication({ params, ctx }, deps)
  return taskApplicationResultToToolResponse(result)
}
