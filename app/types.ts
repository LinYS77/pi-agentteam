import type { TeamState, TeamMessageType } from '../internalTypes.js'
import type { DeliveryResult } from './deliveryTypes.js'
import type { OutboxEffectRunnerDeps } from './effectRunner.js'
import type { MailboxRepositoryPort, OutboxStorePort, TaskHistoryQueryPort, TaskMutationPort, TeamStatePort } from './ports.js'

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
}

export type MessageReceiveApplicationDeps = {
  mailboxRepository: MessageReceiveMailboxRepository
  taskHistory: Pick<TaskHistoryQueryPort, 'findTaskReport'>
}

export type TaskApplicationDeps = Omit<OutboxEffectRunnerDeps, 'outboxStore'> & {
  outboxStore: TaskApplicationOutboxStore
  teamState: Pick<TeamStatePort, 'updateTeam'>
  taskMutations: Pick<TaskMutationPort, 'createTask' | 'appendTaskEvent' | 'appendTaskReport' | 'updateTaskReport'>
  taskHistory: TaskHistoryQueryPort
  normalizeOwnerName: (name: string) => string
  assertValidOwner: (team: TeamState, owner: string) => void
}
