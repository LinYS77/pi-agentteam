import type { TeamState, TeamMessageType } from '../internalTypes.js'
import type { DeliveryResult } from './deliveryTypes.js'
import type { MailboxRepositoryPort, OutboxEffectHandlers, OutboxRunnerPort, OutboxStorePort, PlanRunMutationPort, PlanRunRepositoryPort, TaskHistoryQueryPort, TaskMutationPort, TeamStatePort } from './ports.js'

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

export type MessageApplicationDeps = DeliveryRequestDeps & {
  outboxRunner: OutboxRunnerPort
  // Kept for composition compatibility while workflow callers use outboxRunner.
  outboxHandlers?: OutboxEffectHandlers
  now?: () => number
  outboxStore: MessageApplicationOutboxStore
  planRuns: PlanRunMutationPort
  sanitizeWorkerName: (name: string) => string
}

export type MessageReceiveApplicationDeps = {
  mailboxRepository: MessageReceiveMailboxRepository
  taskHistory: Pick<TaskHistoryQueryPort, 'findTaskReport'>
}

export type TaskApplicationDeps = {
  outboxRunner: OutboxRunnerPort
  outboxStore: TaskApplicationOutboxStore
  teamState: Pick<TeamStatePort, 'updateTeam'>
  taskMutations: Pick<TaskMutationPort, 'createTask' | 'appendTaskEvent' | 'appendTaskReport' | 'updateTaskReport'>
  taskHistory: TaskHistoryQueryPort
  normalizeOwnerName: (name: string) => string
  assertValidOwner: (team: TeamState, owner: string) => void
}

export type PlanRunApplicationDeps = {
  planRuns: PlanRunRepositoryPort & PlanRunMutationPort
  taskMutations: Pick<TaskMutationPort, 'createTask' | 'appendTaskEvent'>
  taskHistory: Pick<TaskHistoryQueryPort, 'findTaskReport'>
  now?: () => number
}
