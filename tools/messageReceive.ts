import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { executeReceiveMessagesApplication } from '../app/messageReceiveApplication.js'
import type { ToolHandlerDeps } from './shared.js'
import type { TeamReceiveInput } from './messageTypes.js'

export function executeReceiveMessages(
  params: TeamReceiveInput,
  ctx: ExtensionContext,
  deps: ToolHandlerDeps,
) {
  const result = executeReceiveMessagesApplication({ params, ctx }, deps)
  return {
    content: [{ type: 'text' as const, text: result.text }],
    details: result.details,
  }
}
