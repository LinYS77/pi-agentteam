import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import type {
  MailboxMessage,
  TeamMessageType,
  TeamState,
  TeamTask,
  TeamTaskNote,
} from '../internalTypes.js'
import type {
  OutboxClaimInput,
  OutboxCompleteInput,
  OutboxEffect,
  OutboxEnqueueInput,
  OutboxFailInput,
} from './outbox.js'
import type { OutboxRunResult, RunOutboxInput } from './effectRunner.js'

export type TeamContextPort<Context = ExtensionContext> = {
  ensureTeamForSession(ctx: Context): TeamState | null
  currentActor(ctx: Context): string
  invalidateStatus(ctx: Context): void
}

export type TeamStateUpdater = (team: TeamState) => void | TeamState

export type TeamStatePort = {
  readTeam(teamName: string): TeamState | null
  updateTeam(teamName: string, updater: TeamStateUpdater): TeamState | null
}

export type CreateTaskInput = {
  title: string
  description: string
  owner?: string
}

export type StructuredTaskNoteDetails = {
  threadId?: string
  messageType?: TeamMessageType
  requestId?: string
  linkedMessageId?: string
  metadata?: Record<string, unknown>
  hidden?: boolean
}

export type TaskMutationPort = {
  createTask(team: TeamState, input: CreateTaskInput): TeamTask
  appendStructuredTaskNote(
    task: TeamTask,
    author: string,
    text: string,
    details?: StructuredTaskNoteDetails,
  ): TeamTaskNote | void
}

export type MailboxRepositoryPort = {
  readMailbox(teamName: string, memberName: string): MailboxMessage[]
  markDelivered(teamName: string, memberName: string, ids: string[]): void
  markRead(teamName: string, memberName: string, ids: string[]): void
}

export type OutboxStorePort = {
  enqueue<K extends OutboxEffect['kind']>(input: OutboxEnqueueInput<K>): OutboxEffect<K>
  get(teamName: string, effectId: string): OutboxEffect | null
  claim(input: OutboxClaimInput): OutboxEffect[]
  markDone(input: OutboxCompleteInput): OutboxEffect | null
  markFailed(input: OutboxFailInput): OutboxEffect | null
  list?(teamName: string): OutboxEffect[]
  recoverExpiredClaims?(teamName: string, now?: number): OutboxEffect[]
}

export type EffectHandlerSuccess = {
  ok: true
  result?: unknown
}

export type EffectHandlerFailure = {
  ok: false
  error: string
  result?: unknown
}

export type EffectHandlerResult = EffectHandlerSuccess | EffectHandlerFailure

export type MaybePromise<T> = T | Promise<T>

export type OutboxEffectHandler<K extends OutboxEffect['kind']> = (
  effect: OutboxEffect<K>,
) => MaybePromise<EffectHandlerResult>

export type OutboxEffectHandlers = {
  inbox_item_append_requested: OutboxEffectHandler<'inbox_item_append_requested'>
  worker_delivery_requested: OutboxEffectHandler<'worker_delivery_requested'>
  leader_attention_requested: OutboxEffectHandler<'leader_attention_requested'>
  task_note_append_requested: OutboxEffectHandler<'task_note_append_requested'>
  append_event_requested: OutboxEffectHandler<'append_event_requested'>
}

export type OutboxRunnerPort = {
  runOnce(input: RunOutboxInput): Promise<OutboxRunResult>
}
