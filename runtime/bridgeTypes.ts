import type { DeliveryRequestState, TeamState } from '../internalTypes.js'

export type BridgePumpResult =
  | {
      ok: true
      method: 'bridge'
      reason: string
      prompt: string
      deliveredMessageIds: string[]
      queued: boolean
      deliverAs?: 'followUp'
    }
  | {
      ok: false
      method: 'bridge'
      reason: string
      error?: string
      deliveredMessageIds: string[]
      queued?: boolean
      deliverAs?: 'followUp'
    }

export type BridgeNativeContext = {
  isIdle?: () => boolean
  hasPendingMessages?: () => boolean
  sendUserMessage?: (content: string, options?: { deliverAs?: 'followUp' }) => void | Promise<void>
  sendMessage?: (
    message: { customType: string; content: string; display: boolean; details?: Record<string, unknown> },
    options?: { triggerTurn?: boolean; deliverAs?: 'followUp' },
  ) => void | Promise<void>
}

export type BridgePumpInput = {
  teamName: string
  memberName: string
  ctx: BridgeNativeContext
  now?: number
}

export type BridgeLifecycleContext = {
  isIdle?: () => boolean
  hasPendingMessages?: () => boolean
}

export type BridgeLifecycleResult = {
  request?: DeliveryRequestState | null
  status?: TeamState['members'][string]['status']
  reason: string
}
