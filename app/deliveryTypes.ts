import type { TeamMessageWakeHint } from '../internalTypes.js'

export type DeliveryResult =
  | {
      ok: true
      recipient: string
      wakeHint: TeamMessageWakeHint
      reason: string
      method?: 'bridge' | 'bridge_requested' | 'projection_requested' | 'leader_attention_requested'
      requestId?: string
    }
  | {
      ok: false
      recipient: string
      wakeHint?: TeamMessageWakeHint
      reason: string
      error?: string
      method?: 'bridge' | 'bridge_requested' | 'projection_requested' | 'leader_attention_requested' | 'failed'
      requestId?: string
    }
