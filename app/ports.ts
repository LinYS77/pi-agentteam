import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import type {
  MailboxMessage,
  TeamState,
  TaskEvent,
  TaskMessageRef,
  TaskReport,
  TeamTask,
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

export type AppendTaskEventInput = Omit<TaskEvent, 'id'>
export type AppendTaskReportInput = Omit<TaskReport, 'id' | 'reportOnly'>
export type UpdateTaskReportInput = Partial<Omit<TaskReport, 'id' | 'taskId'>>
export type AppendTaskMessageRefInput = Omit<TaskMessageRef, 'id'>

export type TaskHistoryCounts = {
  reports: number
  events: number
  messageRefs: number
}

export type TaskHistorySummary = TaskHistoryCounts & {
  taskId: string
  latestReport?: TaskReport
  latestActivity?: TaskReport | TaskEvent | TaskMessageRef
}

export type TaskHistoryQueryPort = {
  taskReportsForTask(team: TeamState, taskId: string): TaskReport[]
  taskEventsForTask(team: TeamState, taskId: string): TaskEvent[]
  taskMessageRefsForTask(team: TeamState, taskId: string): TaskMessageRef[]
  latestTaskReport(team: TeamState, taskId: string): TaskReport | undefined
  latestTaskActivity(team: TeamState, taskId: string): TaskReport | TaskEvent | TaskMessageRef | undefined
  taskHistoryCounts(team: TeamState, taskId: string): TaskHistoryCounts
  taskHistorySummary(team: TeamState, taskId: string): TaskHistorySummary
  findTaskReport(team: TeamState, reportId: string): TaskReport | undefined
}

export type TaskMutationPort = {
  createTask(team: TeamState, input: CreateTaskInput): TeamTask
  appendTaskEvent(team: TeamState, input: AppendTaskEventInput): TaskEvent
  appendTaskReport(team: TeamState, input: AppendTaskReportInput): TaskReport
  updateTaskReport(team: TeamState, reportId: string, patch: UpdateTaskReportInput): TaskReport | undefined
  appendTaskMessageRef(team: TeamState, input: AppendTaskMessageRefInput): TaskMessageRef
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
  task_message_ref_append_requested: OutboxEffectHandler<'task_message_ref_append_requested'>
  append_event_requested: OutboxEffectHandler<'append_event_requested'>
}

export type OutboxRunnerPort = {
  runOnce(input: RunOutboxInput): Promise<OutboxRunResult>
}
