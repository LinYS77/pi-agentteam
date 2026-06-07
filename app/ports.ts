import type {
  MailboxMessage,
  TeamMember,
  TeamState,
  TaskEvent,
  TaskMessageRef,
  TaskReport,
  TeamTask,
} from '../internalTypes.js'
import type { TaskHistoryCounts, TaskHistoryDisplaySummary, TaskHistoryReportDisplay, TaskHistorySummary } from '../state/taskHistoryReadModel.js'
export type { TaskHistoryCounts, TaskHistorySummary } from '../state/taskHistoryReadModel.js'
import type {
  OutboxClaimInput,
  OutboxCompleteInput,
  OutboxEffect,
  OutboxEnqueueInput,
  OutboxFailInput,
} from './outbox.js'
import type { OutboxRunResult, RunOutboxInput } from './effectRunner.js'

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

export type RepositoryMailboxProjectionItem = Pick<MailboxMessage,
  | 'id'
  | 'from'
  | 'to'
  | 'summary'
  | 'type'
  | 'taskId'
  | 'threadId'
  | 'requestId'
  | 'replyTo'
  | 'priority'
  | 'wakeHint'
  | 'metadata'
  | 'createdAt'
  | 'deliveredAt'
  | 'readAt'
>

export type RepositoryLeaderMailboxProjection = {
  total: number
  unread: number
  items: RepositoryMailboxProjectionItem[]
  latestAttention?: RepositoryMailboxProjectionItem
}

export type RepositoryTeamPanelMember = Pick<TeamMember,
  | 'name'
  | 'role'
  | 'model'
  | 'sessionFile'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'paneId'
  | 'windowTarget'
  | 'lastWakeReason'
  | 'lastError'
  | 'bridgeAvailable'
  | 'bridgeVersion'
  | 'bridgeLastSeenAt'
  | 'bridgeLastDeliveryAt'
  | 'bridgeLastError'
  | 'bridgeWorkRequestedAt'
  | 'bridgeWorkRequestCount'
>

export type RepositoryTeamPanelTask = Pick<TeamTask,
  | 'id'
  | 'title'
  | 'description'
  | 'status'
  | 'owner'
  | 'blockedBy'
  | 'createdAt'
  | 'updatedAt'
> & {
  history: TaskHistoryDisplaySummary
}

export type RepositoryTeamPanelModel = {
  version: TeamState['version']
  name: string
  identity?: TeamState['identity']
  description?: string
  createdAt: number
  leaderCwd: string
  leaderSessionFile?: string
  members: Record<string, RepositoryTeamPanelMember>
  tasks: Record<string, RepositoryTeamPanelTask>
  nextTaskSeq: number
  revision?: number
  memberTombstones?: Record<string, number>
}

export type StateRepositoryPort = {
  readTeamPanelModel(teamName: string): RepositoryTeamPanelModel | null
  readLeaderMailboxProjection(teamName: string): RepositoryLeaderMailboxProjection
  readTaskReportSummary(teamName: string, reportId: string): TaskHistoryReportDisplay | undefined
  writeTeamMutation(teamName: string, updater: TeamStateUpdater): TeamState | null
}

export type RuntimeRepositoryPaneSnapshotItem = {
  paneId: string
  target: string
  label: string
  currentCommand: string
}

export type RuntimeRepositorySnapshot = {
  capturedAt: number
  panes: RuntimeRepositoryPaneSnapshotItem[]
  byPaneId: Record<string, RuntimeRepositoryPaneSnapshotItem>
  ok?: boolean
  error?: string
}

export type RuntimeRepositoryPort = {
  withRuntimeSnapshot<T>(handler: (snapshot: RuntimeRepositorySnapshot) => T): T
  listAgentTeamPanes(snapshot?: RuntimeRepositorySnapshot): RuntimeRepositoryPaneSnapshotItem[]
  reconcileTeamPanes(team: TeamState, options?: { force?: boolean; mode?: 'light' | 'force'; snapshot?: RuntimeRepositorySnapshot }): boolean
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
