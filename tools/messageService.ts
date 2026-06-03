import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import type { ToolHandlerDeps } from './shared.js'
import { executeSendMessageApplication } from '../app/messageApplication.js'
import { executeReceiveMessages } from './messageReceive.js'
import type { TeamReceiveInput, TeamSendInput } from './messageTypes.js'

export type { TeamReceiveInput, TeamSendInput }
export { executeReceiveMessages }

export async function executeSendMessage(
  params: TeamSendInput,
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
  const result = await executeSendMessageApplication({
    params,
    context: {
      team,
      actor: deps.currentActor(ctx),
    },
  }, deps)
  if (result.statusInvalidationRequested) deps.invalidateStatus(ctx)
  return {
    content: [{ type: 'text' as const, text: result.text }],
    details: result.details,
  }
}
