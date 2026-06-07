import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { executePlanRunApplication } from '../app/planRunApplication.js'
import type { PlanRunApplicationResult } from '../app/planRunTypes.js'
import type { ToolHandlerDeps } from './shared.js'
import type { PlanRunInput } from '../app/planRunTypes.js'

function planRunApplicationResultToToolResponse(result: PlanRunApplicationResult) {
  const { text, details } = result
  return { content: [{ type: 'text' as const, text }], details }
}

export async function executePlanRunAction(
  params: PlanRunInput,
  ctx: ExtensionContext,
  deps: ToolHandlerDeps,
) {
  const team = deps.ensureTeamForSession(ctx)
  if (!team) {
    return {
      content: [{ type: 'text' as const, text: 'No current team context.' }],
      details: {},
    }
  }
  const result = executePlanRunApplication({
    params,
    context: {
      team,
      teamName: team.name,
      actor: deps.currentActor(ctx),
    },
  }, deps)
  if (result.statusInvalidationRequested) deps.invalidateStatus(ctx)
  return planRunApplicationResultToToolResponse(result)
}
