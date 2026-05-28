import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import type { DeliveryResult } from '../app/deliveryTypes.js'
import type { AppendStructuredTaskNote, MessageApplicationDeps } from '../app/types.js'
import type {
  TeamMessageType,
  TeamState,
} from '../internalTypes.js'

export type ToolHandlerDeps = MessageApplicationDeps & {
  sanitizeTeamName: (name: string) => string
  sanitizeWorkerName: (name: string) => string
  normalizeOwnerName: (name: string) => string
  assertValidOwner: (team: TeamState, owner: string) => void
  classifySpawnTask: (task?: string) => { initialTask?: string; bootPrompt?: string }
  ensureTeamForSession: (ctx: ExtensionContext) => TeamState | null
  currentActor: (ctx: ExtensionContext) => string
  healMemberPaneBinding: (member: TeamState['members'][string]) => void
  isLeaderInsideTmux: () => boolean
  requestWorkerDelivery: (
    team: TeamState,
    memberName: string,
    explicitTask?: string,
    options?: { requestedBy?: string; reason?: string; messageIds?: string[]; wakeHint?: 'none' | 'soft' | 'hard' },
  ) => Promise<DeliveryResult>
  requestLeaderAttentionIfNeeded: (
    team: TeamState,
    message: {
      type?: TeamMessageType
      wakeHint?: 'none' | 'soft' | 'hard'
      from?: string
      summary?: string
      text?: string
      messageId?: string
      taskId?: string
      threadId?: string
    },
  ) => Promise<DeliveryResult>
  appendStructuredTaskNote: AppendStructuredTaskNote
  invalidateStatus: (ctx: ExtensionContext) => void
}
