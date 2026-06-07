import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import type { DeliveryResult } from '../app/deliveryTypes.js'
import type { MessageApplicationDeps, MessageReceiveApplicationDeps, PlanRunApplicationDeps, TaskApplicationDeps } from '../app/types.js'
import type { OutboxRunnerPort } from '../app/ports.js'
import type {
  TeamMessageType,
  TeamState,
} from '../internalTypes.js'

export type ToolHandlerDeps = MessageApplicationDeps & MessageReceiveApplicationDeps & Pick<TaskApplicationDeps, 'teamState' | 'taskMutations' | 'taskHistory'> & Pick<PlanRunApplicationDeps, 'planRuns'> & {
  outboxRunner: OutboxRunnerPort
  sanitizeTeamName: (name: string) => string
  sanitizeWorkerName: (name: string) => string
  validateNewTeamName: (name: string) => { ok: true; normalized: string } | { ok: false; normalized: string; reason: string; message: string }
  validateNewWorkerName: (name: string) => { ok: true; normalized: string } | { ok: false; normalized: string; reason: string; message: string }
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
  invalidateStatus: (ctx: ExtensionContext) => void
}
