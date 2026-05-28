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
  const result = await executeSendMessageApplication({ params, ctx }, deps)
  return {
    content: [{ type: 'text' as const, text: result.text }],
    details: result.details,
  }
}
