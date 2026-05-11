import type { TeamState } from '../types.js'
import type { ToolHandlerDeps } from './shared.js'
import type { TeamSendInput } from './messageTypes.js'

export type MessageRoutingMode = 'explicit' | 'broadcast'

export type MessageRoutingDetails = {
  mode: MessageRoutingMode
  reason: string
  explicitTo?: string
  resolvedRecipient?: string
}

export type MessageRoutingResult = {
  recipients: string[]
  routing: MessageRoutingDetails
}

export function resolveMessageRecipients(input: {
  team: TeamState
  sender: string
  params: TeamSendInput
  deps: Pick<ToolHandlerDeps, 'sanitizeWorkerName'>
}): MessageRoutingResult {
  const { team, sender, params, deps } = input

  if (params.to === '*') {
    return {
      recipients: Object.values(team.members)
        .map(member => member.name)
        .filter(name => name !== sender),
      routing: {
        mode: 'broadcast',
        reason: 'explicit broadcast recipient',
        explicitTo: params.to,
      },
    }
  }

  const resolvedRecipient = deps.sanitizeWorkerName(params.to)
  return {
    recipients: [resolvedRecipient],
    routing: {
      mode: 'explicit',
      reason: 'explicit recipient',
      explicitTo: params.to,
      resolvedRecipient,
    },
  }
}
