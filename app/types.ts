import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import type { TeamState, TeamTask, TeamMessageType } from '../internalTypes.js'
import type { DeliveryResult } from './deliveryTypes.js'
import type { OutboxEffectRunnerDeps } from './effectRunner.js'
import type { MailboxRepositoryPort, OutboxStorePort, TaskMutationPort, TeamStatePort } from './ports.js'

export type AppendStructuredTaskNote = (
  task: TeamTask,
  author: string,
  text: string,
  details?: {
    threadId?: string
    messageType?: TeamMessageType
    requestId?: string
    linkedMessageId?: string
    metadata?: Record<string, unknown>
    hidden?: boolean
  },
) => void

export type DeliveryRequestDeps = {
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
}

export type ApplicationOutboxStore = Pick<OutboxStorePort, 'enqueue' | 'get' | 'claim' | 'markDone' | 'markFailed'>
export type MessageApplicationOutboxStore = ApplicationOutboxStore
export type TaskApplicationOutboxStore = ApplicationOutboxStore
export type MessageReceiveMailboxRepository = MailboxRepositoryPort

export type MessageApplicationDeps = Omit<OutboxEffectRunnerDeps, 'outboxStore'> & DeliveryRequestDeps & {
  outboxStore: MessageApplicationOutboxStore
  sanitizeWorkerName: (name: string) => string
  ensureTeamForSession: (ctx: ExtensionContext) => TeamState | null
  currentActor: (ctx: ExtensionContext) => string
  invalidateStatus: (ctx: ExtensionContext) => void
}

export type MessageReceiveApplicationDeps = {
  mailboxRepository: MessageReceiveMailboxRepository
  ensureTeamForSession: (ctx: ExtensionContext) => TeamState | null
  currentActor: (ctx: ExtensionContext) => string
}

export type TaskApplicationDeps = Omit<OutboxEffectRunnerDeps, 'outboxStore'> & {
  outboxStore: TaskApplicationOutboxStore
  teamState: Pick<TeamStatePort, 'updateTeam'>
  taskMutations: Pick<TaskMutationPort, 'createTask'>
  normalizeOwnerName: (name: string) => string
  assertValidOwner: (team: TeamState, owner: string) => void
  ensureTeamForSession: (ctx: ExtensionContext) => TeamState | null
  currentActor: (ctx: ExtensionContext) => string
  appendStructuredTaskNote: AppendStructuredTaskNote
  invalidateStatus: (ctx: ExtensionContext) => void
}
